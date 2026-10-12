// node tools/retire_starter_items.mjs --project sword-puzzle --firebase-cli [--apply]
// Dry run by default. Only removes Thanh Phong/Nhat Kiem and the obsolete marker.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';
import { retirementChanges, hasRetirementChanges, retirePlayer } from './retired_starters.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const args = process.argv.slice(2), index = args.indexOf('--project'), project = args[index + 1];
if (index < 0 || !project || project.startsWith('--')) throw new Error('An explicit --project ID is required.');
const apply = args.includes('--apply');
const { FieldValue, FieldPath, getFirestore } = require('firebase-admin/firestore');
let db;
if (args.includes('--firebase-cli')) ({ db } = await firebaseCliServices(project));
else {
  if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
  require('firebase-admin/app').initializeApp({ projectId: project });
  db = getFirestore();
}
try {
  const summary = { project, applied: apply, scanned: 0, affected: 0, updated: 0 };
  let cursor;
  for (;;) {
    let query = db.collection('players').orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      summary.scanned++;
      if (hasRetirementChanges(retirementChanges(doc.data()))) summary.affected++;
      if (apply && await retirePlayer(db, doc.ref, FieldValue)) summary.updated++;
    }
    cursor = page.docs.at(-1);
  }
  console.log(JSON.stringify(summary, null, 2));
} finally { await db.terminate(); }
