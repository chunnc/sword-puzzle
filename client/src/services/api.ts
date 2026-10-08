import { getCurrentSession, getSessionGeneration, saveRefreshedSession, type SessionData } from './session';
import { loadDeviceIdentity, markDeviceProvisioned, identityOperation, clearIdentityOperation } from './device';
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
      let updated: SessionData;
      try { updated = await refreshSession(session.refreshToken); }
      catch (error) {
        if (!(error instanceof GameApiError) || error.status !== 401) throw error;
        if (getSessionGeneration() !== generation) throw new GameApiError('SESSION_CHANGED');
        updated = await deviceSession(session);
      }
      if (updated.uid !== session.uid || updated.bindingVersion !== session.bindingVersion) throw new GameApiError('DEVICE_BINDING_CHANGED', 409);
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
export async function deviceSession(previous?: SessionData | null, create = !previous || !previous.installationId): Promise<SessionData> {
  const device = await loadDeviceIdentity(create);
  if (!device || previous?.installationId && previous.installationId !== device.installationId) throw new GameApiError('DEVICE_KEY_MISSING', 403);
  let legacy = previous && !previous.installationId ? previous : undefined;
  const send = () => request<SessionData>('/v2/auth/device-session', { method: 'POST', body: JSON.stringify({ ...device, requireExisting: device.provisioned === true || Boolean(previous?.installationId) || !create }) }, legacy);
  let result: SessionData;
  try { result = await send(); }
  catch (error) {
    if (!legacy || !(error instanceof GameApiError) || error.status !== 401) throw error;
    legacy = await request<SessionData>('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: legacy.refreshToken }) });
    result = await send();
  }
  if (result.installationId !== device.installationId || !Number.isSafeInteger(result.bindingVersion) || result.bindingVersion! < 1) throw new GameApiError('INVALID_RESPONSE');
  if (!device.provisioned) await markDeviceProvisioned(device);
  return result;
}
export const createGuest = () => deviceSession();
async function changeIdentity(kind: 'login' | 'register' | 'logout', current: SessionData | null | undefined, email?: string, password?: string, confirmedDiscardGuest = false, preserveOwnerId?: string) {
  const device = await loadDeviceIdentity(false);
  if (!device || !current?.bindingVersion || device.installationId !== current.installationId) throw new GameApiError('DEVICE_KEY_MISSING', 403);
  const operation = await identityOperation(kind, current.bindingVersion, email?.trim().toLowerCase());
  const generation = getSessionGeneration();
  const payload = { ...device, ...operation, email, password, confirmedDiscardGuest, preserveOwnerId };
  let result: SessionData;
  try {
    result = await request<SessionData>(`/v2/auth/${kind}`, { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    if (!(error instanceof GameApiError) || !['NETWORK_ERROR', 'TIMEOUT'].includes(error.code)) throw error;
    const recovered = await deviceSession(current);
    const completed = recovered.bindingVersion! > current.bindingVersion &&
      (kind === 'logout' ? recovered.isGuest : recovered.email?.toLowerCase() === email?.trim().toLowerCase());
    if (!completed) throw new GameApiError('IDENTITY_UNCERTAIN', 409);
    result = recovered;
  }
  if (generation !== getSessionGeneration()) throw new GameApiError('SESSION_CHANGED');
  if (result.installationId !== device.installationId || !result.bindingVersion) throw new GameApiError('INVALID_RESPONSE');
  await clearIdentityOperation();
  return result;
}
export const registerAccount = (email: string, password: string, current?: SessionData | null) => changeIdentity('register', current, email, password);
export const loginAccount = (email: string, password: string, current?: SessionData | null, confirmedDiscardGuest = false, preserveOwnerId?: string) => changeIdentity('login', current, email, password, confirmedDiscardGuest, preserveOwnerId);
export const logoutAccount = (current: SessionData, confirmedDiscardGuest = false) => changeIdentity('logout', current, undefined, undefined, confirmedDiscardGuest);
export const refreshSession = (refreshToken: string) => request<SessionData>('/v2/auth/refresh', {
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
