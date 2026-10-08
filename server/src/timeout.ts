export const API_TIMEOUT_SECONDS = 10;
export const API_TIMEOUT_MS = API_TIMEOUT_SECONDS * 1000;

// Fetch, Firebase Admin HTTP requests, and Firestore gRPC deadlines.
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: string; code?: string | number };
  return name === 'TimeoutError' || name === 'AbortError' ||
    code === 4 || code === 'DEADLINE_EXCEEDED' || code === 'deadline-exceeded' ||
    code === 'ETIMEDOUT' || code === 'app/network-timeout';
}
