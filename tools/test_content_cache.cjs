const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {resolveSnapshot,saveSnapshot,loadSnapshot,defaultCacheDir,projectDir,cacheFileFor}=require('./sync_content_cache.cjs');
const config=require('../content/game-config.json');
const rawMaps=require('../content/game-maps.json');

const project='cache-test';

function tempDir(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'content-cache-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  return directory;
}

function readers(version=config.version) {
  const calls={config:0,content:0,maps:0};
  return {calls,
    readConfig:async()=>{calls.config++;return {contentVersion:version,minClientVersion:'1.4.0'};},
    readContent:async(v)=>{calls.content++;return {...config,version:v};},
    readMaps:async(v)=>{calls.maps++;return rawMaps.map(m=>({...m,contentVersion:v}));}};
}

test('first sync fetches server content, writes an atomic cache file and hashes the snapshot',async t=>{
  const directory=tempDir(t),r=readers();
  const snapshot=await resolveSnapshot({project,cacheDir:directory,readers:r,now:()=>new Date('2026-10-10T08:00:00Z')});
  assert.equal(snapshot.source,'server');
  assert.equal(snapshot.version,config.version);
  assert.equal(snapshot.maps.length,rawMaps.length);
  assert.equal(snapshot.checkedAt,'2026-10-10T08:00:00.000Z');
  assert.deepEqual(r.calls,{config:1,content:1,maps:1});
  const file=cacheFileFor(project,config.version,directory);
  assert.equal(snapshot.cacheFile,file);
  assert.ok(fs.existsSync(file));
  assert.deepEqual(fs.readdirSync(path.dirname(file)),[path.basename(file)]);
  const onDisk=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(onDisk.format,2);
  assert.equal(onDisk.hashes.snapshot,snapshot.hashes.snapshot);
  assert.match(snapshot.hashes.config,/^[0-9a-f]{64}$/);
  assert.match(snapshot.hashes.maps[snapshot.maps[0].id],/^[0-9a-f]{64}$/);
});

test('unchanged active version reuses the cache after a single pointer read',async t=>{
  const directory=tempDir(t);
  const first=await resolveSnapshot({project,cacheDir:directory,readers:readers(),now:()=>new Date('2026-10-10T08:00:00Z')});
  const secondReaders=readers();
  const second=await resolveSnapshot({project,cacheDir:directory,readers:secondReaders,now:()=>new Date('2026-10-10T09:30:00Z')});
  assert.deepEqual(secondReaders.calls,{config:1,content:0,maps:0});
  assert.equal(second.source,'cache');
  assert.equal(second.syncedAt,first.syncedAt);
  assert.equal(second.checkedAt,'2026-10-10T09:30:00.000Z');
  assert.equal(second.hashes.snapshot,first.hashes.snapshot);
});

test('a version change syncs the new version and keeps the previous cache files',async t=>{
  const directory=tempDir(t);
  await resolveSnapshot({project,cacheDir:directory,readers:readers(config.version),now:()=>new Date('2026-10-10T08:00:00Z')});
  const next=await resolveSnapshot({project,cacheDir:directory,readers:readers(config.version+1),now:()=>new Date('2026-10-11T08:00:00Z')});
  assert.equal(next.source,'server');
  assert.equal(next.version,config.version+1);
  assert.equal(next.maps[0].contentVersion,config.version+1);
  assert.deepEqual(fs.readdirSync(projectDir(project,directory)).sort(),[`v${config.version}.json`,`v${config.version+1}.json`]);
});

test('corrupt cache files are ignored and refetched without touching valid files',async t=>{
  const directory=tempDir(t);
  await resolveSnapshot({project,cacheDir:directory,readers:readers(),now:()=>new Date('2026-10-10T08:00:00Z')});
  const file=cacheFileFor(project,config.version,directory);
  fs.writeFileSync(file,'{not json');
  assert.equal(loadSnapshot(project,{cacheDir:directory}),null);
  const r=readers();
  const snapshot=await resolveSnapshot({project,cacheDir:directory,readers:r,now:()=>new Date('2026-10-10T10:00:00Z')});
  assert.equal(snapshot.source,'server');
  assert.deepEqual(r.calls,{config:1,content:1,maps:1});
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).version,config.version);
});

test('invalid published maps fail before any cache is written',async t=>{
  const directory=tempDir(t);
  const broken=readers();
  broken.readMaps=async(v)=>{broken.calls.maps++;const maps=rawMaps.map(m=>({...m,contentVersion:v}));maps[0].moves=0;return maps;};
  await assert.rejects(()=>resolveSnapshot({project,cacheDir:directory,readers:broken}),/INVALID_MAP/);
  assert.equal(fs.existsSync(projectDir(project,directory)),false);
});

test('published map count and gaps are rejected',async t=>{
  const directory=tempDir(t);
  const short=readers();short.readMaps=async(v)=>{short.calls.maps++;return rawMaps.slice(0,-1).map(m=>({...m,contentVersion:v}));};
  await assert.rejects(()=>resolveSnapshot({project,cacheDir:directory,readers:short}),/PUBLISHED_MAP_COUNT/);
  const gap=readers();gap.readMaps=async(v)=>{gap.calls.maps++;const maps=rawMaps.map(m=>({...m,contentVersion:v}));maps[0]=structuredClone(maps[1]);return maps;};
  await assert.rejects(()=>resolveSnapshot({project,cacheDir:directory,readers:gap}),/PUBLISHED_MAP_GAP/);
  assert.equal(fs.existsSync(projectDir(project,directory)),false);
});

test('offline mode requires a cached snapshot and then serves it without readers',async t=>{
  const directory=tempDir(t);
  await assert.rejects(()=>resolveSnapshot({project,cacheDir:directory,offline:true}),/OFFLINE_CACHE_MISSING/);
  await resolveSnapshot({project,cacheDir:directory,readers:readers(),now:()=>new Date('2026-10-10T08:00:00Z')});
  const offline=await resolveSnapshot({project,cacheDir:directory,offline:true,now:()=>new Date('2026-10-11T08:00:00Z')});
  assert.equal(offline.source,'cache');
  assert.equal(offline.version,config.version);
  assert.equal(offline.checkedAt,'2026-10-11T08:00:00.000Z');
});

test('saveSnapshot can persist a built snapshot and loadSnapshot validates it back',async t=>{
  const directory=tempDir(t);
  const first=await resolveSnapshot({project,cacheDir:directory,readers:readers(),now:()=>new Date('2026-10-10T08:00:00Z')});
  fs.rmSync(path.dirname(cacheFileFor(project,config.version,directory)),{recursive:true,force:true});
  const saved=saveSnapshot(first,{cacheDir:directory});
  const loaded=loadSnapshot(project,{cacheDir:directory});
  assert.equal(saved,loaded.cacheFile);
  assert.equal(loaded.version,first.version);
  assert.equal(loaded.hashes.snapshot,first.hashes.snapshot);
  assert.deepEqual(loaded.maps.map(m=>m.id),first.maps.map(m=>m.id));
});

test('cache paths honour the BALANCE_CACHE_DIR override',t=>{
  const previous=process.env.BALANCE_CACHE_DIR;
  const directory=tempDir(t);
  process.env.BALANCE_CACHE_DIR=directory;
  t.after(()=>{ if(previous===undefined)delete process.env.BALANCE_CACHE_DIR;else process.env.BALANCE_CACHE_DIR=previous; });
  assert.equal(defaultCacheDir(),path.resolve(directory));
  assert.equal(projectDir('demo'),path.join(path.resolve(directory),'demo'));
});
test('map-only catalog revisions invalidate caches while retaining both snapshots',async t=>{
  const directory=tempDir(t);
  const r=readers();let revision=1;
  r.readConfig=async()=>{r.calls.config++;return {contentVersion:config.version,catalogRevision:revision};};
  const first=await resolveSnapshot({project,cacheDir:directory,readers:r});
  revision=2;
  r.readMaps=async()=>rawMaps.map((m,i)=>i?m:{...m,moves:m.moves+2});
  const second=await resolveSnapshot({project,cacheDir:directory,readers:r});
  assert.equal(first.version,second.version);assert.notEqual(first.hashes.snapshot,second.hashes.snapshot);
  assert.notEqual(first.cacheFile,second.cacheFile);assert.equal(second.maps[0].moves,rawMaps[0].moves+2);
  assert.equal(loadSnapshot(project,{cacheDir:directory,version:config.version,catalogRevision:1}).hashes.snapshot,first.hashes.snapshot);
});
test('sync retries publication races without caching a mixed catalog',async t=>{
  const directory=tempDir(t),r=readers();let reads=0;
  r.readConfig=async()=>({contentVersion:config.version,catalogRevision:++reads===1?1:2});
  const snapshot=await resolveSnapshot({project,cacheDir:directory,readers:r});
  assert.equal(snapshot.catalogRevision,2);assert.equal(r.calls.maps,2);
  assert.equal(fs.existsSync(cacheFileFor(project,config.version,directory,1)),false);
});
test('a validation failure during publication is retried only when the catalog changed',async t=>{
  const directory=tempDir(t),r=readers();let reads=0,attempts=0;
  r.readConfig=async()=>({contentVersion:config.version,catalogRevision:++reads===1?1:2});
  r.readMaps=async()=>{if(++attempts===1)throw new Error('INVALID_MAP');return rawMaps;};
  const snapshot=await resolveSnapshot({project,cacheDir:directory,readers:r});
  assert.equal(snapshot.catalogRevision,2);assert.equal(attempts,2);
});
