// Deletes published map catalog data and user-derived data from a Firestore
// project. Local authoring files (content/*) are never touched: regenerate
// maps there and re-publish with tools/seed_game_content.mjs.
//
//   node tools/wipe_map_data.mjs --project <id> [--apply] [--firebase-cli]
//     [--keep-content-version current|<n>|none]   default: current
//     [--include-ad-data]                          adIntents/adTransactions/authThrottle
//     [--confirm-wipe <id>]                        required for --apply on live projects
//
// Dry run by default. `gameConfig/current` is preserved and its catalogRevision
// is bumped so tools caches keyed on it are invalidated.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const flag = name => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const args = process.argv.slice(2), project = flag('--project'), apply = args.includes('--apply');
const keepRaw = flag('--keep-content-version') ?? 'current';
const confirm = flag('--confirm-wipe');
if (!args.includes('--project') || !project || project.startsWith('--')) throw new Error('An explicit --project ID is required.');
const live = !(project.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST);
if (apply && live && confirm !== project) throw new Error(`Refusing to wipe ${project}: pass --confirm-wipe ${project} with --apply.`);
let db;
if (args.includes('--firebase-cli')) ({ db } = await firebaseCliServices(project));
else {
  if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
  const { initializeApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ projectId: project });
  db = getFirestore();
}
try {
  const settingsRef = db.doc('gameConfig/current');
  const settings = (await settingsRef.get()).data() ?? {};
  if (keepRaw === 'current' && !settings.contentVersion) throw new Error('CONTENT_NOT_CONFIGURED');
  let keepVersion;
  if (keepRaw === 'current') keepVersion = Number(settings.contentVersion);
  else if (keepRaw === 'none') keepVersion = null;
  else keepVersion = Number(keepRaw);
  if (keepVersion !== null && (!Number.isSafeInteger(keepVersion) || keepVersion < 3)) throw new Error(`INVALID_KEEP_CONTENT_VERSION: ${keepRaw}`);
  const keepId = keepVersion === null ? null : String(keepVersion);
  const collections = [
    { name: 'gameMaps', keep: () => false },
    { name: 'players', keep: () => false },
    { name: 'installations', keep: () => false },
    { name: 'gameContent', keep: id => id === keepId }
  ];
  if (args.includes('--include-ad-data')) collections.push({ name: 'adIntents', keep: () => false }, { name: 'adTransactions', keep: () => false }, { name: 'authThrottle', keep: () => false });
  const doomed = [];
  for (const collection of collections) {
    const refs = (await db.collection(collection.name).listDocuments()).filter(ref => !collection.keep(ref.id));
    doomed.push({ name: collection.name, refs });
  }
  const subcollections = {};
  for (const name of ['runs', 'mapStats', 'operations']) {
    const snap = await db.collectionGroup(name).select().get();
    subcollections[name] = snap.size;
  }
  const summary = {
    project, applied: apply, live,
    keptContentVersion: keepId, previousContentVersion: settings.contentVersion ?? null,
    catalogRevisionBefore: settings.catalogRevision ?? 0,
    deleted: Object.fromEntries(doomed.map(entry => [entry.name, entry.refs.length])),
    deletedSubcollections: subcollections,
    keptGameContent: keepId === null ? [] : [keepId],
    totalDocuments: doomed.reduce((sum, entry) => sum + entry.refs.length, 0) + Object.values(subcollections).reduce((sum, n) => sum + n, 0)
  };
  if (!apply) {
    console.log(JSON.stringify({ ...summary, note: 'Dry run; no database writes. Re-run with --apply' + (live ? ` --confirm-wipe ${project}` : '') + ' to delete.' }, null, 2));
  } else {
    for (const entry of doomed) for (const ref of entry.refs) await db.recursiveDelete(ref);
    await settingsRef.set({ catalogRevision: (settings.catalogRevision ?? 0) + 1 }, { merge: true });
    console.log(JSON.stringify({ ...summary, catalogRevisionAfter: (settings.catalogRevision ?? 0) + 1 }, null, 2));
  }
  if (apply && keepId === null) console.warn('WARNING: --keep-content-version none left gameConfig/current pointing at missing content; bootstrap returns 409 until api:seed republishes a catalog.');
} finally { await db.terminate(); }
