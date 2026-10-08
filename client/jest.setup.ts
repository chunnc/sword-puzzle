// Test fixture only; production client never imports the seed catalog.
require('./src/game/domain').installContent(require('../content/game-content.json'));

jest.mock('expo-crypto', () => ({ getRandomBytesAsync: async (length: number) => new Uint8Array(require('node:crypto').randomBytes(length)) }));
