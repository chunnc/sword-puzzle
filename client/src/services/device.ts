import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';

export interface DeviceIdentity { installationId: string; secret: string; provisioned?: boolean }
export interface IdentityOperation {
  operationId: string; kind: 'login' | 'register' | 'logout'; email?: string; expectedBindingVersion: number;
}
const DEVICE_KEY = 'kiem-khai-installation';
const OPERATION_KEY = 'kiem-khai-identity-operation';
let loading: Promise<DeviceIdentity | null> | null = null;
let cached: DeviceIdentity | null = null;
const randomHex = async (length: number) => Array.from(await getRandomBytesAsync(length), b => b.toString(16).padStart(2, '0')).join('');
async function freshIdentity(): Promise<DeviceIdentity> {
  const identity = { installationId: await randomHex(16), secret: await randomHex(32) };
  await SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(identity));
  cached = identity;
  return identity;
}
export async function loadDeviceIdentity(create = true): Promise<DeviceIdentity | null> {
  if (cached) return cached;
  if (!loading) loading = (async () => {
    const raw = await SecureStore.getItemAsync(DEVICE_KEY);
    if (!raw) return create ? freshIdentity() : null;
    let value: DeviceIdentity;
    try { value = JSON.parse(raw); } catch { throw new Error('INVALID_DEVICE_STORAGE'); }
    if (!/^[a-f0-9]{32}$/.test(value?.installationId) || !/^[a-f0-9]{64}$/.test(value?.secret)) throw new Error('INVALID_DEVICE_STORAGE');
    cached = value; return value;
  })().finally(() => { loading = null; });
  return loading;
}
export async function resetDeviceIdentity(): Promise<DeviceIdentity> {
  if (loading) await loading;
  await SecureStore.deleteItemAsync(OPERATION_KEY);
  return freshIdentity();
}
export async function identityOperation(kind: IdentityOperation['kind'], expectedBindingVersion: number, email?: string): Promise<IdentityOperation> {
  const raw = await SecureStore.getItemAsync(OPERATION_KEY);
  if (raw) {
    let previous: IdentityOperation;
    try { previous = JSON.parse(raw); } catch { throw new Error('INVALID_DEVICE_STORAGE'); }
    if (previous.kind === kind && previous.email === email && previous.expectedBindingVersion === expectedBindingVersion) return previous;
  }
  const operation = { operationId: await randomHex(16), kind, email, expectedBindingVersion };
  await SecureStore.setItemAsync(OPERATION_KEY, JSON.stringify(operation));
  return operation;
}
export const clearIdentityOperation = () => SecureStore.deleteItemAsync(OPERATION_KEY);
export async function markDeviceProvisioned(identity: DeviceIdentity) {
  const next = { ...identity, provisioned: true };
  await SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(next));
  cached = next;
}
// Only used by the local, development-only acceptance bridge after fixture injection.
export function forgetDeviceCacheForTesting() { cached = null; loading = null; }
