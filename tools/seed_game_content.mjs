import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateContent, versionMap, contentWire } = require('./game-runtime.cjs');
const { publishMapResource } = require('../tools/map_resources.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'));
const content = validateContent(read('game-config.json'));
const authoredMaps = read('game-maps.json');
const maps = authoredMaps.map(raw => versionMap(raw, content, raw.mapVersion));
if (content.version < 8 || maps.length !== content.levelCount || maps.some((map,i) => map.id !== i+1)) throw new Error('Expected a contiguous modern map catalog');

const args = process.argv.slice(2), flag = name => { const i=args.indexOf(name); return i<0?null:args[i+1]; };
const project = flag('--project'), apply = args.includes('--apply'), resetCatalog = args.includes('--reset-catalog');
if (!apply) {
  console.log('Validated content v8 and its two tutorial maps. Dry run; no database writes.');
  process.exit(0);
}
if (!project || project.startsWith('--')) throw new Error('An explicit --project ID is required.');

let db;
if (args.includes('--firebase-cli')) ({ db } = await firebaseCliServices(project));
else {
  if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ projectId: project });
  db = getFirestore();
}

try {
  await db.runTransaction(async tx => {
    const settingsRef = db.collection('gameConfig').doc('current');
    const contentRef = db.collection('gameContent').doc(String(content.version));
    const mapRefs = maps.map(map => db.collection('gameMaps').doc(String(map.id)));
    const [settingsSnap, contentSnap, anyMapSnap, ...mapSnaps] = await Promise.all([
      tx.get(settingsRef), tx.get(contentRef), tx.get(db.collection('gameMaps').limit(1)), ...mapRefs.map(ref => tx.get(ref)),
    ]);
    const settings = settingsSnap.data() ?? {};
    const previousVersion = Number(settings.contentVersion ?? 0);
    if (contentSnap.exists && !isDeepStrictEqual(contentSnap.data(), contentWire(content))) throw new Error('CONTENT_VERSION_IMMUTABLE');
    if (resetCatalog && !anyMapSnap.empty) throw new Error('RESET_REQUIRES_EMPTY_GAME_MAPS');
    if (previousVersion && !resetCatalog) {
      const previous = (await tx.get(db.collection('gameContent').doc(String(previousVersion)))).data();
      if (previous?.levelCount > content.levelCount) throw new Error('CATALOG_CANNOT_SHRINK');
    }
    const resources = maps.map((map,i) => publishMapResource(mapSnaps[i].data(), authoredMaps[i], content));
    let changed = previousVersion !== content.version;
    if (!contentSnap.exists) { tx.create(contentRef, contentWire(content)); changed = true; }
    for (let i=0;i<resources.length;i++) if (!mapSnaps[i].exists || !isDeepStrictEqual(mapSnaps[i].data(), resources[i])) {
      tx.set(mapRefs[i], resources[i]); changed = true;
    }
    tx.set(settingsRef, {
      ...(!settingsSnap.exists ? { rewardedAdsEnabled: false } : {}),
      contentVersion: content.version,
      catalogRevision: (settings.catalogRevision ?? 0) + (changed ? 1 : 0),
      minClientVersion: '1.8.0',
    }, { merge: true });
  });
  console.log(`Published content v${content.version} and ${maps.length} map resources to ${project}.`);
} finally { await db.terminate(); }
