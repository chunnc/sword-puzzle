import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const { validateContent, validateMap, mapToDocument, contentWire } = require('./lib/domain/game');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'));
const legacy = validateContent(read('game-content.json'));
const content = validateContent(read('game-config.json'));
const maps = read('game-maps.json').map(raw => validateMap(raw, content));
if (maps.length !== content.levelCount || maps.some((map,i) => map.id !== i+1)) throw new Error('Incomplete map catalog');
// Offline preflight only. The deployed API does not run the client engine.
const runtime = require('../tools/game-runtime.cjs');
runtime.installContent(contentWire(content));
for (const map of maps) for (const seed of [1, 104729, 2654435761, 0x12345678]) {
  new runtime.BoardEngine(runtime.mapToLevel(map, seed, 0));
}
const documents = [
  ['gameContent', String(legacy.version), legacy],
  ['gameContent', String(content.version), contentWire(content)],
  ...maps.map(map => ['gameMaps', `${content.version}_${map.id}`, mapToDocument(map)])
];
const args = process.argv.slice(2), project = args[args.indexOf('--project')+1];
if (!args.includes('--apply')) {
  console.log(`Validated config v${content.version}, ${maps.length} maps and historical v${legacy.version}. Dry run; no database writes.`);
  process.exit(0);
}
if (!args.includes('--project') || !project || project.startsWith('--')) throw new Error('An explicit --project ID is required.');
if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
let db;
if (args.includes('--firebase-cli')) ({ db } = await firebaseCliServices(project));
else {
  const { initializeApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ projectId: project });
  db = getFirestore();
}
const config = db.collection('gameConfig').doc('current');
// Publish all map documents and switch the pointer in one transaction.
try { await db.runTransaction(async tx => {
  const refs = documents.map(([collection,id]) => db.collection(collection).doc(id));
  const [settings, ...existing] = await Promise.all([tx.get(config), ...refs.map(ref => tx.get(ref))]);
  for (let i=0; i<documents.length; i++) {
    const expected = documents[i][2];
    if (existing[i].exists && !isDeepStrictEqual(existing[i].data(), expected)) throw new Error(`Published content is immutable: ${refs[i].path}`);
    if (!existing[i].exists) tx.create(refs[i], expected);
  }
  tx.set(config, { ...(!settings.exists ? { rewardedAdsEnabled: false } : {}), contentVersion: content.version, minClientVersion: '1.7.0' }, { merge: true });
}); } finally { await db.terminate(); }
console.log(`Published config v${content.version} and ${maps.length} maps to ${project}.`);
