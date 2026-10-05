import * as SecureStore from 'expo-secure-store';

export interface SessionData {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  isGuest: boolean;
  acquiredAt?: number;
}

const SESSION_KEY = 'kiem-khai-session';

export async function loadSession(): Promise<SessionData | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionData;
    if (!session.uid || !session.idToken || !session.refreshToken) return null;
    return session;
  } catch {
    return null;
  }
}

export async function saveSession(session: SessionData): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ ...session, acquiredAt: Math.floor(Date.now() / 1000) }));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
