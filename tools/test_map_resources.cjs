const {test}=require('node:test'),assert=require('node:assert/strict');
const {publishMapResource,migrateMapResource,migrateLegacyMapEntry,checkSize,MAX_RESOURCE_BYTES}=require('./map_resources.cjs');
const game=require('./game-runtime.cjs');
const content=game.validateContent(require('../content/game-config.json'));
const raw=require('../content/game-maps.json')[0];
test('publishing changes only the edited map revision and is idempotent',()=>{
  const first=publishMapResource(undefined,raw,content);
  assert.equal(first.latestVersion,raw.contentVersion);
  assert.deepEqual(publishMapResource(first,raw,content),first);
  const edited={...raw,moves:raw.moves+2};
  const second=publishMapResource(first,edited,content);
  assert.equal(second.latestVersion,first.latestVersion+1);assert.equal(second.versions.length,2);
  assert.deepEqual(second.versions[0],first.versions[0]);
  assert.deepEqual(publishMapResource(second,edited,content),second);
  assert.throws(()=>publishMapResource(second,{...edited,mapVersion:first.latestVersion},content),/IMMUTABLE_MAP_VERSION/);
});
test('config-only changes do not republish a map and registry remapping cannot reinterpret a historical map',()=>{
  const first=publishMapResource(undefined,raw,content);
  const config={...content,version:content.version+1,qiCap:200};
  assert.deepEqual(publishMapResource(first,{...raw,contentVersion:config.version},config),first);
  assert.equal(game.mapToLevel(game.mapResourceFromDocument(first,config),1,0,config).configVersion,config.version);
  const changed={...config,tiles:config.tiles.map(t=>({...t,id:t.id===1?2:t.id===2?1:t.id}))};
  assert.throws(()=>game.mapResourceFromDocument(first,changed),/INVALID_MAP/);
});
test('migration preserves historical entries, is idempotent and rejects conflicting revisions',()=>{
  const entries=[{map:game.validateMap(raw,content),content}];
  const resource=migrateMapResource(undefined,entries,content);
  assert.deepEqual(migrateMapResource(resource,entries,content),resource);
  assert.throws(()=>migrateMapResource(resource,[{map:{...raw,moves:12},content}],content),/IMMUTABLE_MAP_VERSION/);
  assert.throws(()=>game.mapResourceFromDocument({...resource,versions:[...resource.versions,...resource.versions]},content),/INVALID_MAP_RESOURCE/);
  assert.throws(()=>checkSize({id:1,padding:'x'.repeat(MAX_RESOURCE_BYTES)}),/MAP_RESOURCE_TOO_LARGE/);
  const numeric={id:1,cells:Array(130000).fill(1)};
  assert.ok(Buffer.byteLength(JSON.stringify(numeric))<MAX_RESOURCE_BYTES);
  assert.throws(()=>checkSize(numeric),/MAP_RESOURCE_TOO_LARGE/);
});
test('migration preserves the active catalog and intentional numeric rollback pointers',()=>{
  const future={...content,version:content.version+1};
  const entries=[{map:game.validateMap(raw,content),content},{map:{...raw,contentVersion:future.version,moves:raw.moves+2},content:future}];
  const resource=migrateMapResource(undefined,entries,content);
  assert.equal(resource.versions.length,2);assert.equal(resource.latestVersion,content.version);
  assert.deepEqual(migrateMapResource(resource,entries,future),resource);
});
test('v4 comboPressure maps and Collect 36 are archived without losing their legacy rule data',()=>{
  const v4={...content,version:4};
  const old={...structuredClone(raw),contentVersion:4,starThresholds:{threeStarMaxMovesUsed:2,twoStarMaxMovesUsed:4},
    objectives:[{id:'main',type:'Collect',tileKind:1,target:36}],spawnPolicy:{...raw.spawnPolicy,comboPressure:.25}};
  delete old.spawnPolicy.comboChance;delete old.spawnPolicy.setupChance;
  const entry=migrateLegacyMapEntry(game.mapToDocument(old),v4,old.id);
  assert.equal(entry.mapVersion,4);assert.equal(entry.rulesMode,'classic');
  assert.equal(entry.objectives[0].target,36);assert.equal(entry.spawnPolicy.comboChance,0);
  assert.equal(entry.spawnPolicy.comboPressure,.25);
  const resource=migrateMapResource(undefined,[{map:entry,content:v4}],v4);
  assert.equal(resource.latestVersion,4);
  assert.equal(game.mapResourceFromDocument(resource,v4).objectives[0].target,36);
});
