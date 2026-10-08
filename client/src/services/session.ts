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
let current: SessionData | null = null;
let generation = 0;
let writes = Promise.resolve();
export const getSessionGeneration = () => generation;
export const getCurrentSession = () => current;
function valid(s: SessionData) {
  return s && typeof s.uid === 'string' && !!s.uid && typeof s.idToken === 'string' && !!s.idToken && typeof s.refreshToken === 'string' && !!s.refreshToken && typeof s.isGuest === 'boolean';
}
function write(work: () => Promise<void>) {
  const next = writes.catch(() => undefined).then(work);
  writes = next;
  return next;
}
export async function loadSession(): Promise<SessionData | null> {
  // A corrupt/read-failed identity must not silently become a new guest.
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    current = null;
    return null;
  }
  const session = JSON.parse(raw) as SessionData;
  if (!valid(session)) throw new Error('INVALID_SESSION_STORAGE');
  current = session;
  return session;
}
export async function saveSession(session: SessionData): Promise<void> {
  if (!valid(session)) throw new Error('INVALID_SESSION');
  generation++;
  current = {
    ...session,
    acquiredAt: Math.floor(Date.now() / 1000)
  };
  const next = current;
  await write(() => SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)));
}
export async function saveRefreshedSession(session: SessionData, expectedGeneration: number): Promise<void> {
  if (generation !== expectedGeneration || !current || current.uid !== session.uid) throw new Error('SESSION_CHANGED');
  if (!valid(session)) throw new Error('INVALID_SESSION');
  current = {
    ...session,
    acquiredAt: Math.floor(Date.now() / 1000)
  };
  const next = current;
  await write(() => SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)));
  if (generation !== expectedGeneration) throw new Error('SESSION_CHANGED');
}
export async function clearSession(): Promise<void> {
  generation++;
  current = null;
  await write(() => SecureStore.deleteItemAsync(SESSION_KEY));
}
