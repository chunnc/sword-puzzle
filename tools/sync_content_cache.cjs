// Sync published content to a local cache, then run seeds against the cached snapshot.
// Firestore reads per run: one pointer document when the active version matches the cache.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateContent, validateMap, mapFromDocument } = require('./game-runtime.cjs');

const root = path.resolve(__dirname, '..');
const FORMAT = 1;

function defaultProject() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
    if (settings?.projects?.default) return settings.projects.default;
  } catch {}
  return 'sword-puzzle';
}

function defaultCacheDir() {
  return process.env.BALANCE_CACHE_DIR ? path.resolve(process.env.BALANCE_CACHE_DIR) : path.join(root, '.balance-reports', 'content-cache');
}

function projectDir(project, cacheDir = defaultCacheDir()) {
  return path.join(cacheDir, project);
}

function cacheFileFor(project, version, cacheDir = defaultCacheDir()) {
  return path.join(projectDir(project, cacheDir), `v${version}.json`);
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildSnapshot({ project, serverConfig = null, config, maps, syncedAt }) {
  const safeConfig = validateContent(config);
  const safeMaps = [...maps].sort((a, b) => a.id - b.id).map(m => validateMap(m, safeConfig));
  if (safeMaps.length !== safeConfig.levelCount) throw new Error(`PUBLISHED_MAP_COUNT: ${safeMaps.length} maps, expected ${safeConfig.levelCount}`);
  safeMaps.forEach((map, index) => { if (map.id !== index + 1) throw new Error(`PUBLISHED_MAP_GAP: expected map ${index + 1}, found ${map.id}`); });
  const hashes = { config: hash(safeConfig), maps: Object.fromEntries(safeMaps.map(m => [m.id, hash(m)])) };
  hashes.snapshot = hash({ project, version: safeConfig.version, config: hashes.config, maps: safeMaps.map(m => [m.id, hashes.maps[m.id]]) });
  return { project, version: safeConfig.version, serverConfig, syncedAt, checkedAt: syncedAt, source: 'server', cacheFile: null, config: safeConfig, maps: safeMaps, hashes };
}

function saveSnapshot(snapshot, { cacheDir = defaultCacheDir() } = {}) {
  const directory = projectDir(snapshot.project, cacheDir);
  fs.mkdirSync(directory, { recursive: true });
  const file = cacheFileFor(snapshot.project, snapshot.version, cacheDir);
  const temporary = `${file}.${process.pid}.tmp`;
  const body = { format: FORMAT, project: snapshot.project, version: snapshot.version, syncedAt: snapshot.syncedAt, serverConfig: snapshot.serverConfig, config: snapshot.config, maps: snapshot.maps, hashes: snapshot.hashes };
  fs.writeFileSync(temporary, JSON.stringify(body, null, 2) + '\n');
  fs.renameSync(temporary, file);
  return file;
}

function loadSnapshot(project, { cacheDir = defaultCacheDir(), version = null } = {}) {
  const directory = projectDir(project, cacheDir);
  if (!fs.existsSync(directory)) return null;
  const versions = version
    ? [version]
    : fs.readdirSync(directory).map(name => /^v(\d+)\.json$/.exec(name)).filter(Boolean).map(match => Number(match[1])).sort((a, b) => a - b);
  if (!versions.length) return null;
  const chosen = versions[versions.length - 1];
  const file = cacheFileFor(project, chosen, cacheDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.format !== FORMAT || raw.project !== project || raw.version !== chosen) return null;
    return { ...buildSnapshot({ project, serverConfig: raw.serverConfig, config: raw.config, maps: raw.maps, syncedAt: raw.syncedAt }), cacheFile: file };
  } catch { return null; }
}

async function liveReaders(project) {
  let db;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const serverRequire = require('node:module').createRequire(path.join(root, 'server', 'package.json'));
    const { Firestore } = serverRequire('@google-cloud/firestore');
    db = new Firestore({ projectId: project });
  } else {
    const { firebaseCliServices } = await import('./firebase_cli_credentials.mjs');
    ({ db } = await firebaseCliServices(project));
  }
  return {
    async close() { await db.terminate().catch(() => {}); },
    async readConfig() {
      const snap = await db.doc('gameConfig/current').get();
      const data = snap.data();
      if (!snap.exists || !Number.isSafeInteger(data?.contentVersion) || data.contentVersion < 3) throw new Error('CONTENT_NOT_CONFIGURED');
      return data;
    },
    async readContent(version) {
      const snap = await db.doc(`gameContent/${version}`).get();
      if (!snap.exists) throw new Error(`CONTENT_MISSING: gameContent/${version}`);
      return snap.data();
    },
    async readMaps(version, content) {
      const result = await db.collection('gameMaps').where('contentVersion', '==', version).get();
      if (!result.size) throw new Error(`CONTENT_MISSING: no maps published for v${version}`);
      return result.docs.map(doc => mapFromDocument(doc.data(), content));
    }
  };
}

async function resolveSnapshot({ project = defaultProject(), cacheDir = defaultCacheDir(), offline = false, readers = null, now = () => new Date() } = {}) {
  if (!project || typeof project !== 'string') throw new Error('A project ID is required.');
  if (offline) {
    const cached = loadSnapshot(project, { cacheDir });
    if (!cached) throw new Error(`OFFLINE_CACHE_MISSING: no cached server content for ${project} in ${projectDir(project, cacheDir)}. Run once without --offline to sync.`);
    return { ...cached, source: 'cache', checkedAt: now().toISOString() };
  }
  const active = readers ?? await liveReaders(project);
  const detached = !readers;
  try {
    const serverConfig = await active.readConfig();
    const version = serverConfig.contentVersion;
    const cached = loadSnapshot(project, { cacheDir, version });
    if (cached) return { ...cached, serverConfig, source: 'cache', checkedAt: now().toISOString() };
    const config = validateContent(await active.readContent(version));
    if (config.version !== version) throw new Error(`CONTENT_MISMATCH: published v${config.version}, active pointer v${version}`);
    const maps = await active.readMaps(version, config);
    const snapshot = buildSnapshot({ project, serverConfig, config, maps, syncedAt: now().toISOString() });
    const cacheFile = saveSnapshot(snapshot, { cacheDir });
    return { ...snapshot, cacheFile };
  } finally {
    if (detached && active.close) await active.close();
  }
}

module.exports = { defaultProject, defaultCacheDir, projectDir, cacheFileFor, hash, buildSnapshot, saveSnapshot, loadSnapshot, liveReaders, resolveSnapshot };
