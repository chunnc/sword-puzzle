const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { patchSource } = require('../../../scripts/patch-expo-dev-launcher.cjs');

const vulnerable = [
  '        intent.categories?.let {',
  '            categories.addAll(it)',
  '          }',
].join('\n');
const fixed = [
  '        intent.categories?.forEach { category ->',
  '            addCategory(category)',
  '          }',
].join('\n');

test('patches the SDK 57 deep-link category copy with Intent.addCategory', () => {
  expect(patchSource(vulnerable, '57.0.20')).toBe(fixed);
});

test('is idempotent when the launcher source already contains the fix', () => {
  expect(patchSource(fixed, '57.0.20')).toBe(fixed);
});

test('fails closed when the Expo SDK version or launcher source is unknown', () => {
  expect(() => patchSource(vulnerable, '58.0.0')).toThrow(/Unsupported expo-dev-launcher version/);
  expect(() => patchSource('unexpected source', '57.0.20')).toThrow(/Could not safely patch/);
});

test('patch applies cleanly to the installed expo-dev-launcher source', () => {
  const packagePath = require.resolve('expo-dev-launcher/package.json');
  const packageRoot = join(packagePath, '..');
  const sourcePath = join(packageRoot, 'android/src/debug/java/expo/modules/devlauncher/DevLauncherController.kt');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const source = readFileSync(sourcePath, 'utf8');
  const patched = patchSource(source, packageJson.version);

  expect(patched).toMatch(/intent\.categories\?\.forEach \{ category ->\n\s+addCategory\(category\)/);
  expect(patched).not.toMatch(/categories\.addAll\(/);
});
