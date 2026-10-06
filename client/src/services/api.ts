import { LevelStar, ProgressResponse } from '../game/types';
import { SessionData } from './session';
import type { PlayerOperation, PlayerProfile, SyncResponse } from '../game/domain';

export interface BootstrapResponse {
  contentVersion: number;
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
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = 'GameApiError';
    this.code = code;
    this.status = status;
  }
}

const API_BASE = (process.env.EXPO_PUBLIC_GAME_API_URL ?? '').trim().replace(/\/+$/, '');

export function isApiConfigured(): boolean {
  return API_BASE.length > 0 && !API_BASE.includes('YOUR_PROJECT');
}

async function request<T>(path: string, options: RequestInit = {}, session?: SessionData): Promise<T> {
  if (!isApiConfigured()) throw new GameApiError('OFFLINE');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = new Headers(options.headers);
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (session?.idToken) headers.set('Authorization', `Bearer ${session.idToken}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      const code = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error : 'NETWORK_ERROR';
      throw new GameApiError(code, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof GameApiError) throw error;
    throw new GameApiError(error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

async function authorized<T>(
  session: SessionData,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ value: T; session: SessionData }> {
  const options = { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  try {
    return { value: await request<T>(path, options, session), session };
  } catch (error) {
    if (!(error instanceof GameApiError) || error.code !== 'INVALID_SESSION') throw error;
    const refreshed = await refreshSession(session.refreshToken);
    return { value: await request<T>(path, options, refreshed), session: refreshed };
  }
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  return request<BootstrapResponse>('/v2/bootstrap');
}

export async function syncProfile(session: SessionData, operations: PlayerOperation[]): Promise<{ response: SyncResponse; session: SessionData }> {
  const result = await authorized<SyncResponse>(session, 'POST', '/v2/profile/sync', { contentVersion: 2, operations });
  return { response: result.value, session: result.session };
}

export async function fetchProfile(session: SessionData): Promise<{ profile: PlayerProfile; session: SessionData }> {
  const result = await authorized<PlayerProfile>(session, 'GET', '/v2/profile');
  return { profile: result.value, session: result.session };
}

export async function createGuest(): Promise<SessionData> {
  return request<SessionData>('/v1/auth/guest', { method: 'POST', body: '{}' });
}

async function credentialRequest(path: string, email: string, password: string, current?: SessionData | null): Promise<SessionData> {
  const body = { method: 'POST', body: JSON.stringify({ email, password }) };
  try {
    return await request<SessionData>(path, body, current ?? undefined);
  } catch (error) {
    if (!(error instanceof GameApiError) || error.code !== 'INVALID_SESSION' || !current) throw error;
    const refreshed = await refreshSession(current.refreshToken);
    return request<SessionData>(path, body, refreshed);
  }
}

export async function registerAccount(email: string, password: string, current?: SessionData | null): Promise<SessionData> {
  return credentialRequest('/v1/auth/register', email, password, current);
}

export async function loginAccount(email: string, password: string, current?: SessionData | null): Promise<SessionData> {
  return credentialRequest('/v1/auth/login', email, password, current?.isGuest ? current : undefined);
}

export async function refreshSession(refreshToken: string): Promise<SessionData> {
  return request<SessionData>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function syncProgress(
  session: SessionData,
  levels: LevelStar[],
): Promise<{ progress: ProgressResponse; session: SessionData }> {
  const result = await authorized<ProgressResponse>(session, 'PUT', '/v1/progress', { levels });
  return { progress: result.value, session: result.session };
}

export async function createAdIntent(session: SessionData, levelId: number): Promise<{ intent: AdIntent; session: SessionData }> {
  const result = await authorized<AdIntent>(session, 'POST', '/v1/ads/intents', { levelId, placement: 'extra_moves' });
  return { intent: result.value, session: result.session };
}

export async function checkAdIntent(session: SessionData, intentId: string): Promise<SessionData> {
  const result = await authorized<{ status: string; levelId: number }>(
    session,
    'GET',
    `/v1/ads/intents/${encodeURIComponent(intentId)}`,
  );
  return result.session;
}
