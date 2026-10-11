const {test}=require('node:test'),assert=require('node:assert/strict');
const {publishMapResource,checkSize,MAX_RESOURCE_BYTES}=require('./map_resources.cjs');
const game=require('./game-runtime.cjs');
const content=game.validateContent(require('../content/game-config.json'));
const raw=require('../content/game-maps.json')[0];

test('publishing a tutorial map is idempotent and a new explicit revision is immutable',()=>{
  const first=publishMapResource(undefined,raw,content);
  assert.equal(first.latestVersion,1);
  assert.deepEqual(publishMapResource(first,raw,content),first);
  const edited={...raw,mapVersion:undefined,moves:raw.moves+2};
  const second=publishMapResource(first,edited,content);
  assert.equal(second.latestVersion,2);assert.equal(second.versions.length,2);
  assert.deepEqual(second.versions[0],first.versions[0]);
  assert.deepEqual(publishMapResource(second,edited,content),second);
  assert.throws(()=>publishMapResource(second,{...edited,mapVersion:1},content),/IMMUTABLE_MAP_VERSION/);
});

test('map resources preserve stable identity, summary and encoded layouts',()=>{
  const resource=publishMapResource(undefined,raw,content);
  const map=game.mapResourceFromDocument(resource,content);
  assert.equal(map.id,1);assert.equal(map.tutorial.type,'match-three');
  assert.equal('layout' in resource.versions[0],false);
  assert.deepEqual(resource.versions[0].layoutRows.map(row=>row.cells),raw.layout);
  assert.equal(resource.latestSummary.id,1);
  assert.throws(()=>publishMapResource(resource,{...raw,chapterId:'other'},content),/MAP_IDENTITY_CHANGED/);
});

test('Firestore document size uses numeric storage cost, not JSON byte length',()=>{
  assert.throws(()=>checkSize({id:1,padding:'x'.repeat(MAX_RESOURCE_BYTES)}),/MAP_RESOURCE_TOO_LARGE/);
  const numeric={id:1,cells:Array(130000).fill(1)};
  assert.ok(Buffer.byteLength(JSON.stringify(numeric))<MAX_RESOURCE_BYTES);
  assert.throws(()=>checkSize(numeric),/MAP_RESOURCE_TOO_LARGE/);
});
