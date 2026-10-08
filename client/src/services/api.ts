import { getCurrentSession, getSessionGeneration, saveRefreshedSession, type SessionData } from './session';
import { requireContent, type GameContent, type PlayerOperation, type PlayerProfile, type SyncResponse } from '../game/domain';
export interface BootstrapResponse {
  contentVersion: number;
  content: GameContent;
  levelCount: number;
  rewardedAdsEnabled: boolean;
  minClientVersion: string;
}
export interface AdIntent {
  intentId: string;
  customData: string;
  expiresAt: number;
}
export class GameApiError extends Error {
  constructor(readonly code: string, readonly status = 0) {
    super(code);
    this.name = 'GameApiError';
  }
}
const API_BASE = (process.env.EXPO_PUBLIC_GAME_API_URL ?? '').trim().replace(/\/+$/, '');
export function isApiConfigured() {
  return API_BASE.length > 0 && !API_BASE.includes('YOUR_PROJECT');
}
async function request<T>(path: string, options: RequestInit = {}, session?: SessionData, timeoutMs = 12000): Promise<T> {
  if (!isApiConfigured()) throw new GameApiError('API_NOT_CONFIGURED');
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(options.headers);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (session) headers.set('Authorization', `Bearer ${session.idToken}`);
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {/* Invalid successful payloads are rejected below. */}
    if (!response.ok) throw new GameApiError(typeof payload?.error === 'string' ? payload.error : 'NETWORK_ERROR', response.status);
    if (payload === null) throw new GameApiError('INVALID_RESPONSE');
    return payload as T;
  } catch (error) {
    if (error instanceof GameApiError) throw error;
    throw new GameApiError(error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}
export async function checkHealth(): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await request<{
        ok: boolean;
      }>('/health', {
        method: 'GET',
        cache: 'no-store'
      }, undefined, 2000);
      if (result.ok !== true) throw new GameApiError('NETWORK_ERROR');
      return;
    } catch (error) {
      if (attempt === 0 && error instanceof GameApiError && error.code === 'TIMEOUT') continue;
      throw error;
    }
  }
}
const refreshes = new Map<string, Promise<SessionData>>();
async function refresh(session: SessionData, generation: number): Promise<SessionData> {
  const key = `${generation}:${session.uid}`;
  let inFlight = refreshes.get(key);
  if (!inFlight) {
    inFlight = (async () => {
      const updated = await refreshSession(session.refreshToken);
      if (updated.uid !== session.uid) throw new GameApiError('INVALID_SESSION', 401);
      await saveRefreshedSession(updated, generation);
      return updated;
    })().finally(() => {
      refreshes.delete(key);
    });
    refreshes.set(key, inFlight);
  }
  return inFlight;
}
async function authorized<T>(session: SessionData, method: string, path: string, body?: unknown): Promise<{
  value: T;
  session: SessionData;
}> {
  const generation = getSessionGeneration();
  const active = getCurrentSession();
  if (!active || active.uid !== session.uid) throw new GameApiError('SESSION_CHANGED');
  const options = {
    method,
    ...(body === undefined ? {} : {
      body: JSON.stringify(body)
    })
  };
  let used = active;
  let value: T;
  try {
    value = await request<T>(path, options, used);
  } catch (error) {
    if (!(error instanceof GameApiError) || error.status !== 401) throw error;
    if (getSessionGeneration() !== generation) throw new GameApiError('SESSION_CHANGED');
    const latest = getCurrentSession();
    used = latest && latest.idToken !== used.idToken ? latest : await refresh(used, generation);
    value = await request<T>(path, options, used);
  }
  if (getSessionGeneration() !== generation) throw new GameApiError('SESSION_CHANGED');
  return {
    value,
    session: getCurrentSession() ?? used
  };
}
export const fetchBootstrap = () => request<BootstrapResponse>('/v2/bootstrap');
export const fetchContent = (version: number) => request<GameContent>(`/v2/content/${version}`);
export async function syncProfile(session: SessionData, operations: PlayerOperation[], contentVersion = requireContent().version) {
  const result = await authorized<SyncResponse>(session, 'POST', '/v2/profile/sync', {
    contentVersion,
    operations
  });
  return {
    response: result.value,
    session: result.session
  };
}
export async function fetchProfile(session: SessionData) {
  const result = await authorized<PlayerProfile>(session, 'GET', '/v2/profile');
  return {
    profile: result.value,
    session: result.session
  };
}
export const createGuest = () => request<SessionData>('/v1/auth/guest', {
  method: 'POST',
  body: '{}'
});
async function credentials(path: string, email: string, password: string, current?: SessionData | null) {
  if (current) return (await authorized<SessionData>(current, 'POST', path, {
    email,
    password
  })).value;
  return request<SessionData>(path, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password
    })
  });
}
export const registerAccount = (email: string, password: string, current?: SessionData | null) => credentials('/v1/auth/register', email, password, current);
export const loginAccount = (email: string, password: string, current?: SessionData | null) => credentials('/v1/auth/login', email, password, current?.isGuest ? current : undefined);
export const refreshSession = (refreshToken: string) => request<SessionData>('/v1/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({
    refreshToken
  })
});
export async function createAdIntent(session: SessionData, levelId: number) {
  const r = await authorized<AdIntent>(session, 'POST', '/v1/ads/intents', {
    levelId,
    placement: 'extra_moves'
  });
  return {
    intent: r.value,
    session: r.session
  };
}
export async function checkAdIntent(session: SessionData, intentId: string) {
  const r = await authorized<{
    status: string;
    levelId: number;
  }>(session, 'GET', `/v1/ads/intents/${encodeURIComponent(intentId)}`);
  return r.session;
}
