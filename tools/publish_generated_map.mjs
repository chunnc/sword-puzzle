import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';

const require = createRequire(import.meta.url);
const { ROOT, parseArgs, positiveInteger, loadArtifact, writeJSON, hash, engineHash, inBand } = require('./map_generation.cjs');
const { validateContent, validateMap, chapterForLevel, contentWire } = require('./game-runtime.cjs');
const { publishMapResource } = require('./map_resources.cjs');
const { defaultProject } = require('./sync_content_cache.cjs');

function globalRules(config) {
  const { version, levelCount, levelBaseExp, chapters, ...rules } = contentWire(config);
  return rules;
}
function assertCompatible(active, authored) {
  if (!isDeepStrictEqual(globalRules(active), globalRules(authored))) throw new Error('GLOBAL_RULES_CHANGED: publish global rule changes separately, then regenerate/revalidate the map');
  const shared = Math.min(active.levelCount, authored.levelCount);
  for (let index = 1; index <= shared; index++) {
    const a = chapterForLevel(index, active), b = chapterForLevel(index, authored);
    if (a.id !== b.id || index - a.firstLevelId !== index - b.firstLevelId || a.order !== b.order || active.levelBaseExp[index - 1] !== authored.levelBaseExp[index - 1]) {
      throw new Error(`CATALOG_IDENTITY_CHANGED: map ${index}`);
    }
  }
}
function expandedConfig(active, authored, map, version) {
  assertCompatible(active, authored);
  if (map.id <= active.levelCount) return active;
  if (map.id !== active.levelCount + 1) throw new Error(`PUBLISH_INDEX_GAP: publish map ${active.levelCount + 1} first`);
  const next = structuredClone(active), chapter = chapterForLevel(map.id, authored), last = next.chapters.at(-1);
  next.version = version; next.levelCount = map.id;
  next.levelBaseExp.push(authored.levelBaseExp[map.id - 1]);
  if (chapter.id === last.id) last.lastLevelId = map.id;
  else {
    if (chapter.firstLevelId !== map.id || chapter.order !== next.chapters.length + 1 || next.chapters.some(ch => ch.id === chapter.id)) throw new Error('INVALID_CHAPTER_APPEND');
    next.chapters.push({ ...chapter, lastLevelId: map.id });
  }
  return validateContent(next);
}
function assertBalanced(artifact) {
  const { seed, report } = artifact, summary = report.validation?.summary;
  const request = seed.verificationRequest ?? seed.generation.request;
  if (seed.hashes.engine !== engineHash() || seed.hashes.map !== hash(artifact.map)
    || seed.hashes.config !== hash(contentWire(artifact.config)) || seed.hashes.report !== hash(report)) throw new Error('STALE_OR_MODIFIED_SEED: revalidate the saved map');
  if (report.status !== 'passed' || !report.validation?.passed || report.failures?.length || !summary || summary.samples < 1000
    || summary.mapHash !== seed.hashes.map
    || request.winRateEnforced !== false && !inBand(summary.winRate, request.bands.win, request.bands.exclusiveWin)
    || !inBand(summary.starRates[3], request.bands.three, request.bands.exclusiveThree)) {
    throw new Error('BALANCE_NOT_PASSED: a matching, passed validation report with at least 1000 seeds is required');
  }
}
// Read every mutable pointer/resource before writing. A concurrent publish retries
// this transaction and recalculates both content and map revision numbers.
export async function publishGeneratedMap(db, artifact, { dryRun = false } = {}) {
  assertBalanced(artifact);
  return db.runTransaction(async tx => {
    const settingsRef = db.doc('gameConfig/current'), mapRef = db.doc(`gameMaps/${artifact.map.id}`);
    const [settingsSnap, mapSnap] = await Promise.all([tx.get(settingsRef), tx.get(mapRef)]);
    const settings = settingsSnap.data();
    if (!settingsSnap.exists || !Number.isSafeInteger(settings?.contentVersion)) throw new Error('CONTENT_NOT_CONFIGURED: publish the initial catalog with tools/seed_game_content.mjs first');
    const activeRef = db.doc(`gameContent/${settings.contentVersion}`), activeSnap = await tx.get(activeRef);
    if (!activeSnap.exists) throw new Error('ACTIVE_CONTENT_MISSING');
    const active = validateContent(activeSnap.data());
    if (active.version !== settings.contentVersion) throw new Error('ACTIVE_CONTENT_MISMATCH');
    assertCompatible(active, artifact.config);
    if (artifact.map.id > active.levelCount + 1) throw new Error(`PUBLISH_INDEX_GAP: publish map ${active.levelCount + 1} first`);

    // Check the active prefix, without including un-published local maps in a new config.
    const prefix = await tx.get(db.collection('gameMaps').where('id', '>=', 1).where('id', '<=', active.levelCount)
      .select('id', 'chapterId', 'orderInChapter', 'latestVersion', 'latestSummary'));
    const byId = new Map(prefix.docs.filter(doc => /^[1-9]\d*$/.test(doc.id)).map(doc => [Number(doc.id), doc.data()]));
    for (let id = 1; id <= active.levelCount; id++) {
      const resource = byId.get(id), chapter = chapterForLevel(id, active);
      if (!resource || resource.id !== id || resource.chapterId !== chapter.id || resource.orderInChapter !== id - chapter.firstLevelId + 1
        || resource.latestSummary?.id !== id || resource.latestSummary?.mapVersion !== resource.latestVersion) throw new Error(`PUBLISHED_MAP_GAP_OR_INVALID: ${id}`);
    }

    const grows = artifact.map.id > active.levelCount;
    let nextVersion = active.version, nextRef = activeRef, nextSnap = activeSnap;
    if (grows) {
      const newest = await tx.get(db.collection('gameContent').orderBy('version', 'desc').limit(1));
      nextVersion = Math.max(active.version + 1, artifact.config.version, (newest.docs[0]?.data().version ?? 0) + 1);
      nextRef = db.doc(`gameContent/${nextVersion}`); nextSnap = await tx.get(nextRef);
    }
    const config = expandedConfig(active, artifact.config, artifact.map, nextVersion);
    const { mapVersion, ...payload } = artifact.map;
    const raw = { ...payload, contentVersion: config.version, ...(mapSnap.exists ? {} : { mapVersion: 1 }) };
    validateMap({ ...raw, mapVersion: raw.mapVersion ?? 1 }, config);
    const resource = publishMapResource(mapSnap.data(), raw, config);
    const mapChanged = !mapSnap.exists || !isDeepStrictEqual(mapSnap.data(), resource);
    if (grows && nextSnap.exists && !isDeepStrictEqual(nextSnap.data(), contentWire(config))) throw new Error('CONTENT_VERSION_IMMUTABLE');
    const changed = grows || mapChanged;
    const revision = (settings.catalogRevision ?? 0) + (changed ? 1 : 0);
    if (!dryRun) {
      if (grows && !nextSnap.exists) tx.create(nextRef, contentWire(config));
      if (mapChanged) tx.set(mapRef, resource);
      if (changed) tx.set(settingsRef, { contentVersion: config.version, catalogRevision: revision,
        ...(!settings.minClientVersion || settings.minClientVersion.localeCompare('1.8.0', undefined, { numeric: true }) < 0 ? { minClientVersion: '1.8.0' } : {}) }, { merge: true });
    }
    return { id: artifact.map.id, mapVersion: resource.latestVersion, contentVersion: config.version,
      levelCount: config.levelCount, catalogRevision: revision, changed, dryRun,
      authoredMapHash: artifact.seed.hashes.map, reportHash: artifact.seed.hashes.report, resourceHash: hash(resource) };
  });
}
export async function main(args = process.argv.slice(2)) {
  const opts = parseArgs(args, ['--project'], ['--dry-run', '--adc', '--firebase-cli', '--help'], true);
  if (opts['--help']) {
    console.log(`Publish ONE generated map by its numeric index.
  npm run maps:publish -- INDEX [--project PROJECT] [--dry-run]
Uses .firebaserc and Firebase CLI login by default; --adc uses Application Default Credentials.
With FIRESTORE_EMULATOR_HOST set, uses the emulator. No local map generation/simulation occurs.
Initial tutorial catalog must already be published. Append new indices in order.
Changed maps get a new immutable revision; identical re-publishes are idempotent.`);
    return;
  }
  const index = positiveInteger(opts.index, 'map index', 1, 1000), project = opts['--project'] ?? defaultProject();
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(project)) throw new Error('Invalid --project ID');
  if (opts['--adc'] && opts['--firebase-cli']) throw new Error('Choose either --adc or --firebase-cli');
  if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST');
  const artifact = loadArtifact(index); assertBalanced(artifact);
  let db;
  if (process.env.FIRESTORE_EMULATOR_HOST || opts['--adc']) {
    if (process.env.FIRESTORE_EMULATOR_HOST && opts['--firebase-cli']) throw new Error('--firebase-cli applies to live projects only');
    const serverRequire = createRequire(path.join(ROOT, 'server', 'package.json'));
    const { initializeApp, deleteApp } = serverRequire('firebase-admin/app');
    const { getFirestore } = serverRequire('firebase-admin/firestore');
    const app = initializeApp({ projectId: project }, `publish-map-${process.pid}`);
    db = getFirestore(app);
    try {
      const receipt = await publishGeneratedMap(db, artifact, { dryRun: !!opts['--dry-run'] });
      deliverReceipt(receipt, project, artifact.directory); return receipt;
    } finally { await db.terminate(); await deleteApp(app); }
  }
  ({ db } = await firebaseCliServices(project));
  try {
    const receipt = await publishGeneratedMap(db, artifact, { dryRun: !!opts['--dry-run'] });
    deliverReceipt(receipt, project, artifact.directory); return receipt;
  } finally { await db.terminate(); }
}
export { assertBalanced };
function deliverReceipt(receipt, project, directory) {
  if (!receipt.dryRun) writeJSON(path.join(directory, 'published', `${project}.json`), { ...receipt, project });
  console.log(`${receipt.dryRun ? 'Dry run' : receipt.changed ? 'Published' : 'Unchanged'}: map ${receipt.id} v${receipt.mapVersion}; content v${receipt.contentVersion}; catalog revision ${receipt.catalogRevision}; ${project}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
