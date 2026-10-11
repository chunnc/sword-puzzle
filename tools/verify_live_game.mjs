import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';

async function main() {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const project = process.argv[process.argv.indexOf('--project') + 1];
if (!process.argv.includes('--project') || project !== 'sword-puzzle') throw new Error('Specify --project sword-puzzle explicitly.');
const smoke = process.argv.includes('--smoke');
const base = `https://asia-southeast1-${project}.cloudfunctions.net/gameApi`;
const domain = require('./lib/domain/game');
const source = JSON.parse(fs.readFileSync(path.join(root, 'content/game-config.json'), 'utf8'));
const content = domain.validateContent(source);
const expectedMaps = JSON.parse(fs.readFileSync(path.join(root, 'content/game-maps.json'), 'utf8'));
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'content/game-content.json'), 'utf8'));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const { db, credential, request: cloudRequest } = await firebaseCliServices(project);
let uid, installationId, cleanupApp;
const results = { project, endpoint: base, smokeRequested: smoke };
async function http(route, body, token) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json();
  return { status: response.status, data };
}
try {
  const [health, bootstrap, historical, current, v4, maps, indexResponse] = await Promise.all([
    http('/health'), http('/v3/bootstrap'), http('/v2/content/3'),
    db.doc('gameConfig/current').get(), db.doc(`gameContent/${content.version}`).get(),
    db.collection('gameMaps').get(),
    cloudRequest({ url: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/gameMaps/indexes` })
  ]);
  check(health.status === 200 && health.data.ok === true, 'Health check failed');
  check(bootstrap.status === 200 && bootstrap.data.contentVersion === content.version && !('levels' in bootstrap.data.content), 'Bootstrap is not map-free content v4');
  check(historical.status === 200 && isDeepStrictEqual(historical.data, legacy), 'Historical v3 API changed');
  check(current.get('contentVersion') === content.version && current.get('minClientVersion') === '1.7.0', 'Current configuration pointer is incorrect');
  check(v4.exists && isDeepStrictEqual(v4.data(), domain.contentWire(content)), 'Published global configuration differs');
  const resources=maps.docs.filter(doc=>/^[1-9]\d*$/.test(doc.id));
  check(resources.length === expectedMaps.length, 'Published map count differs');
  const actualMaps = resources.map(doc => domain.mapResourceFromDocument(doc.data(), content)).sort((a,b) => a.id-b.id);
  const comparable = map => { const { contentVersion, ...payload } = map; return payload; };
  check(isDeepStrictEqual(actualMaps.map(comparable), expectedMaps.map((map,i)=>comparable(domain.versionMap(map,content,actualMaps[i].mapVersion)))), 'Latest published maps differ from the authoring catalog');
  check(resources.every(doc => doc.get('versions').every(map=>!('layout' in map)&&Array.isArray(map.layoutRows))), 'Firestore layout encoding is incorrect');
  check((indexResponse.data.indexes ?? []).some(index => index.state === 'READY' && index.fields.filter(f => f.fieldPath !== '__name__').map(f => f.fieldPath).join(',') === 'chapterId,orderInChapter'), 'Chapter index is not READY');
  const beforePath = path.join(root, '.balance-reports/deploy-preflight.json');
  if (fs.existsSync(beforePath)) {
    const { contentVersion, minClientVersion, catalogRevision, ...before } = JSON.parse(fs.readFileSync(beforePath, 'utf8')).previousConfig;
    const { contentVersion: version, minClientVersion: minimum, catalogRevision: revision, ...after } = current.data();
    check(isDeepStrictEqual(before, after), 'An unrelated game configuration setting changed');
  }
  Object.assign(results, { health: true, contentVersion: content.version, catalogRevision:current.get('catalogRevision'), maps: resources.length, chapters: content.chapters.length,
    indexReady: true, mapFreeBootstrap: true, historicalV3Preserved: true, configurationPreserved: true });
  if (smoke) {
    installationId = randomBytes(16).toString('hex');
    const created = await http('/v2/auth/device-session', { installationId, secret: randomBytes(32).toString('hex') });
    uid = created.data.uid;
    check(created.status === 200 && uid && created.data.idToken, 'Smoke guest creation failed');
    const token = created.data.idToken;
    const chapter = content.chapters[0];
    const list = await http(`/v4/chapters/${chapter.id}/maps`, undefined, token);
    check(list.status === 200 && list.data.maps.length === 10 && list.data.maps.every((map,i) => map.id === i+1 && !('layout' in map)), 'Chapter query returned incorrect maps');
    const locked = await http(`/v4/chapters/${content.chapters[1].id}/maps`, undefined, token);
    check(locked.status === 403, 'Locked chapter access was accepted');
    const body = { runId: randomUUID(), levelId: 1, previousRunId: null };
    const started = await http('/v4/runs/start', body, token);
    check(started.status === 200 && started.data.run.map.id === 1 && Array.isArray(started.data.run.map.layout), 'Run start failed');
    const repeated = await http('/v4/runs/start', body, token);
    check(repeated.status === 200 && isDeepStrictEqual(started.data, repeated.data), 'Repeated start changed the run');
    const report = { outcome: 'abandoned', movesUsed: 0, objectiveProgress: Object.fromEntries(started.data.run.map.objectives.map(o => [o.id,0])), extraMovesUsed: false };
    const finished = await http(`/v4/runs/${body.runId}/finish`, report, token);
    check(finished.status === 200 && finished.data.stars === 0, 'Run abandonment failed');
    const finishAgain = await http(`/v4/runs/${body.runId}/finish`, report, token);
    check(finishAgain.status === 200 && isDeepStrictEqual(finished.data, finishAgain.data), 'Repeated finish changed the receipt');
    const stats = await db.doc(`players/${uid}/mapStats/1`).get();
    check(stats.get('attemptsStarted') === 1 && stats.get('retryCount') === 0 && stats.get('abandoned') === 1 && stats.get('consecutiveFailures') === 0, 'Smoke retry statistics are incorrect');
    check(finished.data.profile.coins === 0 && finished.data.profile.totalExp === 0 && finished.data.profile.levels.length === 0, 'Smoke abandoned run granted progression');
    results.smokePassed = true;
  }
} finally {
  try {
    if (!uid && installationId) uid = (await db.doc(`installations/${installationId}`).get()).get('playerUid');
    if (uid) {
      const { initializeApp, deleteApp } = require('firebase-admin/app');
      const { getAuth } = require('firebase-admin/auth');
      cleanupApp = initializeApp({ projectId: project, credential }, 'deployment-smoke-cleanup');
      try {
        await getAuth(cleanupApp).deleteUser(uid);
        const remaining = await getAuth(cleanupApp).getUser(uid).catch(error => { if (error.code === 'auth/user-not-found') return null; throw error; });
        check(remaining === null, 'Smoke auth cleanup failed');
        await db.recursiveDelete(db.doc(`players/${uid}`));
        check(!(await db.doc(`players/${uid}`).get()).exists, 'Smoke profile cleanup failed');
      } finally { await deleteApp(cleanupApp); }
    }
    if (installationId) {
      await db.recursiveDelete(db.doc(`installations/${installationId}`));
      check(!(await db.doc(`installations/${installationId}`).get()).exists, 'Smoke installation cleanup failed');
    }
    results.smokeDataDeleted = !!uid && !!installationId;
  } finally { await db.terminate(); }
}
fs.mkdirSync(path.join(root, '.balance-reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.balance-reports/deployment-verification.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));

}
await main().catch(error => { console.error({ code: error.code ?? null, message: error.message }); process.exitCode = 1; });
