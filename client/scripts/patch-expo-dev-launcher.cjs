const fs = require('node:fs');
const path = require('node:path');

const OLD_BLOCK = [
  'intent.categories?.let {',
  '            categories.addAll(it)',
  '          }',
].join('\n');

const FIXED_BLOCK = [
  'intent.categories?.forEach { category ->',
  '            addCategory(category)',
  '          }',
].join('\n');

function patchSource(source, version) {
  const major = Number(String(version).split('.')[0]);
  if (major !== 57) {
    throw new Error(`Unsupported expo-dev-launcher version ${version}; review the Android deep-link fix before updating Expo SDK.`);
  }

  const oldCount = source.split(OLD_BLOCK).length - 1;
  const hasFixedBlock = source.includes(FIXED_BLOCK);
  if (oldCount === 0 && hasFixedBlock) return source;
  if (oldCount === 1 && !hasFixedBlock) return source.replace(OLD_BLOCK, FIXED_BLOCK);

  throw new Error(`Could not safely patch expo-dev-launcher@${version}: expected exactly one known categories.addAll block.`);
}

function patchInstalledPackage(projectRoot = process.cwd()) {
  const packagePath = path.join(projectRoot, 'node_modules/expo-dev-launcher/package.json');
  const sourcePath = path.join(projectRoot, 'node_modules/expo-dev-launcher/android/src/debug/java/expo/modules/devlauncher/DevLauncherController.kt');
  if (!fs.existsSync(packagePath) || !fs.existsSync(sourcePath)) {
    throw new Error('expo-dev-launcher is missing. Install dependencies before applying the Android launcher fix.');
  }

  const { version } = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const source = fs.readFileSync(sourcePath, 'utf8');
  const patched = patchSource(source, version);
  if (patched !== source) fs.writeFileSync(sourcePath, patched);
}

if (require.main === module) {
  try {
    patchInstalledPackage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { patchSource };
