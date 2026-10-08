jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => undefined), deleteItemAsync: jest.fn(async () => undefined) }));
beforeEach(() => jest.resetModules());
it('creates one secure identity for concurrent callers and persists before returning', async () => {
  const secure = require('expo-secure-store'); secure.getItemAsync.mockResolvedValue(null);
  const device = require('../device');
  const [a,b] = await Promise.all([device.loadDeviceIdentity(), device.loadDeviceIdentity()]);
  expect(a).toEqual(b); expect(a.installationId).toMatch(/^[a-f0-9]{32}$/); expect(a.secret).toMatch(/^[a-f0-9]{64}$/);
  expect(secure.setItemAsync).toHaveBeenCalledTimes(1);
});
it('never replaces a corrupt or unreadable identity automatically', async () => {
  const secure = require('expo-secure-store'); secure.getItemAsync.mockResolvedValue('{bad');
  const device = require('../device');
  await expect(device.loadDeviceIdentity()).rejects.toThrow('INVALID_DEVICE_STORAGE');
  expect(secure.setItemAsync).not.toHaveBeenCalled();
  secure.getItemAsync.mockRejectedValue(new Error('Keychain unavailable'));
  await expect(device.loadDeviceIdentity()).rejects.toThrow('Keychain unavailable');
  expect(secure.setItemAsync).not.toHaveBeenCalled();
});
it('does not create a key when only recovery is requested', async () => {
  const secure = require('expo-secure-store'); secure.getItemAsync.mockResolvedValue(null);
  expect(await require('../device').loadDeviceIdentity(false)).toBeNull();
  expect(secure.setItemAsync).not.toHaveBeenCalled();
});
