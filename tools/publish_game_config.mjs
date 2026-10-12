// Publish configuration only. Never creates, updates or deletes map documents.
// node tools/publish_game_config.mjs --project sword-puzzle --firebase-cli [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateContent, contentWire } = require('./game-runtime.cjs');
const content = contentWire(validateContent(JSON.parse(fs.readFileSync(path.join(root, 'content/game-config.json'), 'utf8'))));
const args = process.argv.slice(2), index = args.indexOf('--project'), project = args[index + 1];
if (index < 0 || !project || project.startsWith('--')) throw new Error('An explicit --project ID is required.');
const apply = args.includes('--apply');
const { db } = await firebaseCliServices(project);
try {
  const summary = await db.runTransaction(async tx => {
    const settingsRef = db.doc('gameConfig/current'), contentRef = db.doc(`gameContent/${content.version}`);
    const [settingsSnap, targetSnap] = await Promise.all([tx.get(settingsRef), tx.get(contentRef)]);
    const settings = settingsSnap.data();
    if (!settings?.contentVersion) throw new Error('CONTENT_NOT_CONFIGURED');
    const previous = (await tx.get(db.doc(`gameContent/${settings.contentVersion}`))).data();
    if (!previous) throw new Error('CURRENT_CONTENT_MISSING');
    if (content.version < settings.contentVersion) throw new Error('CONTENT_VERSION_REGRESSION');
    if (!isDeepStrictEqual(content.chapters, previous.chapters) || content.levelCount !== previous.levelCount || !isDeepStrictEqual(content.levelBaseExp, previous.levelBaseExp) || !isDeepStrictEqual(content.tiles, previous.tiles) || !isDeepStrictEqual(content.normalTileIds, previous.normalTileIds) || !isDeepStrictEqual(content.layoutCodes, previous.layoutCodes)) throw new Error('CONFIG_ONLY_REQUIRES_UNCHANGED_MAP_CATALOG');
    if (targetSnap.exists && !isDeepStrictEqual(targetSnap.data(), content)) throw new Error('CONTENT_VERSION_IMMUTABLE');
    const changed = settings.contentVersion !== content.version || !targetSnap.exists;
    if (apply && changed) {
      if (!targetSnap.exists) tx.create(contentRef, content);
      tx.update(settingsRef, { contentVersion: content.version, catalogRevision: (settings.catalogRevision ?? 0) + 1 });
    }
    return { project, applied: apply, previousVersion: settings.contentVersion, contentVersion: content.version, changed, mapWrites: 0 };
  });
  console.log(JSON.stringify(summary, null, 2));
} finally { await db.terminate(); }
