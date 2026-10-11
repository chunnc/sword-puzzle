const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const enabled=process.env.MAP_EMULATOR_TEST==='1';
let server,base,db,version;
before(async()=>{
 if(!enabled)return;
 if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Local emulators required');
 process.env.GCLOUD_PROJECT='demo-kiem-khai';process.env.GAME_AUTH_API_KEY='demo';
 const {app}=require('../../lib/index');
 db=require('firebase-admin/firestore').getFirestore();
 const game=require('../../lib/domain/game'),content=game.validateContent(require('../../../content/game-config.json'));
 version=content.version;
  const batch=db.batch();batch.set(db.collection('gameContent').doc(String(version)),game.contentWire(content));
  batch.set(db.collection('gameContent').doc('3'),require('../../../content/game-content.json'));
  const oldV4={...content,version:4};batch.set(db.collection('gameContent').doc('4'),game.contentWire(oldV4));
  const {publishMapResource}=require('../../../tools/map_resources.cjs');
  for(const raw of require('../../../content/game-maps.json')){const map=game.validateMap(raw,content);batch.set(db.collection('gameMaps').doc(`${version}_${map.id}`),game.mapToDocument(map));batch.set(db.collection('gameMaps').doc(String(map.id)),publishMapResource(undefined,raw,content));}
  const archived={...structuredClone(require('../../../content/game-maps.json')[0]),contentVersion:4,
    starThresholds:{threeStarMaxMovesUsed:2,twoStarMaxMovesUsed:4},objectives:[{id:'main',type:'Collect',tileKind:1,target:36}],
    spawnPolicy:{...require('../../../content/game-maps.json')[0].spawnPolicy,comboPressure:.25}};
  delete archived.spawnPolicy.comboChance;delete archived.spawnPolicy.setupChance;
  batch.set(db.collection('gameMaps').doc('4_1'),game.mapToDocument({...archived,layout:archived.layout}));
  batch.set(db.collection('gameConfig').doc('current'),{contentVersion:version,catalogRevision:1,minClientVersion:'1.7.0',rewardedAdsEnabled:false});await batch.commit();
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
async function guest(){const r=await request('/v2/auth/device-session',{installationId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('hex')});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const start=(g,runId,levelId=1,previousRunId=null)=>request('/v3/runs/start',{runId,levelId,previousRunId,contentVersion:version},g.idToken);
test('bootstrap excludes maps and chapter endpoint returns only one ordered chapter', {skip:!enabled},async()=>{
 const boot=await request('/v3/bootstrap');assert.equal(boot.status,200);assert.equal(boot.data.content.levels,undefined);assert.equal(boot.data.content.chapters.length,4);
 const g=await guest(),list=await request(`/v3/chapters/chapter-1/maps?contentVersion=${version}`,undefined,g.idToken);
 assert.equal(list.status,200,JSON.stringify(list.data));assert.deepEqual(list.data.maps.map(m=>m.id),[1,2,3,4,5,6,7,8,9,10]);assert.equal(list.data.maps[0].layout,undefined);
 assert.equal((await request(`/v3/chapters/chapter-2/maps?contentVersion=${version}`,undefined,g.idToken)).status,403);
});
test('repeated/concurrent starts count once, abandoned runs do not grant support and new seeds differ', {skip:!enabled},async()=>{
 const g=await guest(),id=randomUUID(),[a,b]=await Promise.all([start(g,id),start(g,id)]);
 assert.equal(a.status,200,JSON.stringify(a.data));assert.deepEqual(a.data,b.data);
 const next=await start(g,randomUUID(),1,null); // recover abandonment even if the local journal was lost
 assert.equal(next.status,200,JSON.stringify(next.data));
 assert.notEqual(next.data.run.seed,a.data.run.seed);assert.equal(next.data.run.assistReduction,0);
 const stats=(await db.collection('players').doc(g.uid).collection('mapStats').doc('1').get()).data();assert.equal(stats.attemptsStarted,2);assert.equal(stats.retryCount,1);assert.equal(stats.abandoned,1);assert.equal(stats.consecutiveFailures,0);
 const stored=(await db.collection('players').doc(g.uid).collection('runs').doc(next.data.run.runId).get()).data();assert.equal(stored.map.layout,undefined);assert.ok(stored.map.layoutRows);
});
test('loss retries are idempotent, support is capped, and win rewards are graded by server', {skip:!enabled},async()=>{
 const g=await guest();let previous=null,run;
 for(let i=0;i<8;i++){
  const r=await start(g,randomUUID(),1,previous);assert.equal(r.status,200,JSON.stringify(r.data));run=r.data.run;
  assert.equal(run.assistReduction,i>=7?.3:i>=5?.2:i>=3?.1:0);
  const report={outcome:'lost',movesUsed:run.map.moves,objectiveProgress:{main:0},extraMovesUsed:false};
  const finish=await request(`/v3/runs/${run.runId}/finish`,report,g.idToken);assert.equal(finish.status,200,JSON.stringify(finish.data));
  assert.deepEqual((await request(`/v3/runs/${run.runId}/finish`,report,g.idToken)).data,finish.data);previous=run.runId;
 }
 run=(await start(g,randomUUID(),1,previous)).data.run;
 const report={outcome:'won',movesUsed:Math.ceil(run.map.moves*.5)-1,objectiveProgress:{main:run.map.objectives[0].target},extraMovesUsed:false,stars:0};
 const finished=await request(`/v3/runs/${run.runId}/finish`,report,g.idToken);assert.equal(finished.status,200,JSON.stringify(finished.data));assert.equal(finished.data.stars,3);
 assert.deepEqual((await request(`/v3/runs/${run.runId}/finish`,report,g.idToken)).data,finished.data);
 const stats=(await db.collection('players').doc(g.uid).collection('mapStats').doc('1').get()).data();assert.equal(stats.losses,8);assert.equal(stats.wins,1);assert.equal(stats.consecutiveFailures,0);
 const conflict=await request(`/v3/runs/${run.runId}/finish`,{...report,movesUsed:run.map.moves},g.idToken);assert.equal(conflict.status,409);
});
test('pins a started run and its start receipt across catalog changes; legacy results remain accepted', {skip:!enabled},async()=>{
 const g=await guest(),id=randomUUID(),initial=await start(g,id);assert.equal(initial.status,200,JSON.stringify(initial.data));
 const c=structuredClone(require('../../../content/game-config.json'));c.version=version+1;
 await db.collection('gameContent').doc(String(version+1)).set(c);await db.collection('gameConfig').doc('current').update({contentVersion:version+1});
 try {
  assert.deepEqual((await start(g,id)).data,initial.data);
  const run=initial.data.run,won=await request(`/v3/runs/${id}/finish`,{outcome:'won',movesUsed:run.map.moves,objectiveProgress:{main:run.map.objectives[0].target},extraMovesUsed:false},g.idToken);
  assert.equal(won.status,200,JSON.stringify(won.data));assert.equal(won.data.stars,1);
  const legacy=await request('/v2/profile/sync',{contentVersion:3,operations:[{id:randomUUID(),kind:'win',levelId:1,stars:0,objectiveProgress:{main:18}}]},g.idToken);
  assert.equal(legacy.status,200,JSON.stringify(legacy.data));assert.equal(legacy.data.acknowledged.length,1);
 }finally{await db.collection('gameConfig').doc('current').update({contentVersion:version});}
});
test('versionless starts select latest, retries remain pinned and old results use the run snapshot', {skip:!enabled},async()=>{
 const game=require('../../lib/domain/game'),{publishMapResource}=require('../../../tools/map_resources.cjs');
 const config=game.validateContent(require('../../../content/game-config.json'));
 const ref=db.doc('gameMaps/1'),original=(await ref.get()).data(),settings=(await db.doc('gameConfig/current').get()).data();
 const g=await guest(),id=randomUUID(),body={runId:id,levelId:1,previousRunId:null};
 const initial=await request('/v4/runs/start',body,g.idToken);assert.equal(initial.status,200,JSON.stringify(initial.data));
 assert.equal(initial.data.run.mapVersion,original.latestVersion);assert.equal(initial.data.run.configVersion,version);
 const nextVersion=version+100,nextConfig={...config,version:nextVersion,qiCap:200};
 const edited={...require('../../../content/game-maps.json')[0],moves:10,objectives:[{id:'main',type:'Collect',tileKind:1,target:20}]};
 const next=publishMapResource(original,edited,nextConfig);
 const batch=db.batch();batch.set(ref,next);batch.set(db.doc(`gameContent/${nextVersion}`),game.contentWire(nextConfig));
 batch.set(db.doc('gameConfig/current'),{...settings,contentVersion:nextVersion,catalogRevision:settings.catalogRevision+1});await batch.commit();
 try {
  const repeat=await request('/v4/runs/start',body,g.idToken);assert.deepEqual(repeat.data,initial.data);
  // The catalog can disappear temporarily; a granted run still completes from its trusted snapshot.
  await ref.delete();
  const report={outcome:'won',movesUsed:2,objectiveProgress:{main:30},extraMovesUsed:false};
  const finish=await request(`/v4/runs/${id}/finish`,report,g.idToken);assert.equal(finish.status,200,JSON.stringify(finish.data));
  assert.equal(finish.data.mapVersion,original.latestVersion);assert.equal(finish.data.configVersion,version);
  await db.doc(`players/${g.uid}/runs/${id}`).update({report:{objectiveProgress:report.objectiveProgress,extraMovesUsed:report.extraMovesUsed,movesUsed:report.movesUsed,outcome:report.outcome}});
  assert.deepEqual((await request(`/v4/runs/${id}/finish`,report,g.idToken)).data,finish.data);
  await ref.set(next);
  const fresh=await request('/v4/runs/start',{runId:randomUUID(),levelId:1,previousRunId:id},g.idToken);
  assert.equal(fresh.status,200,JSON.stringify(fresh.data));assert.equal(fresh.data.run.mapVersion,next.latestVersion);
  assert.equal(fresh.data.run.configVersion,nextVersion);assert.equal(fresh.data.config.qiCap,200);
  const list=await request('/v4/chapters/chapter-1/maps',undefined,g.idToken);
  assert.equal(list.status,200,JSON.stringify(list.data));assert.equal(list.data.maps[0].mapVersion,next.latestVersion);
  assert.equal(list.data.maps[0].versions,undefined);
 } finally {await ref.set(original);await db.doc('gameConfig/current').set(settings);}
});
test('concurrent versionless starts and publication serialize into one coherent run', {skip:!enabled},async()=>{
 const game=require('../../lib/domain/game'),{publishMapResource}=require('../../../tools/map_resources.cjs');
 const config=game.validateContent(require('../../../content/game-config.json'));
 const ref=db.doc('gameMaps/1'),original=(await ref.get()).data(),settings=(await db.doc('gameConfig/current').get()).data();
 const g=await guest(),id=randomUUID(),body={runId:id,levelId:1,previousRunId:null};
 const next=publishMapResource(original,{...require('../../../content/game-maps.json')[0],moves:10},config);
 try {
  const batch=db.batch();batch.set(ref,next);batch.set(db.doc('gameConfig/current'),{...settings,catalogRevision:settings.catalogRevision+1});
  const [a,b]=await Promise.all([request('/v4/runs/start',body,g.idToken),request('/v4/runs/start',body,g.idToken),batch.commit()]);
  assert.equal(a.status,200,JSON.stringify(a.data));assert.deepEqual(a.data,b.data);
  assert.ok([original.latestVersion,next.latestVersion].includes(a.data.run.mapVersion));
  assert.equal(a.data.run.map.moves,a.data.run.mapVersion===next.latestVersion?10:8);
  assert.deepEqual((await request('/v4/runs/start',body,g.idToken)).data,a.data);
  const stats=(await db.doc(`players/${g.uid}/mapStats/1`).get()).data();assert.equal(stats.attemptsStarted,1);assert.equal(stats.abandoned,0);
 } finally {await ref.set(original);await db.doc('gameConfig/current').set(settings);}
});
test('migration dry-run, apply and verified cleanup are idempotent and preserve active runs', {skip:!enabled},async()=>{
 const {execFile}=require('node:child_process'),{promisify}=require('node:util'),path=require('node:path');
 const execute=promisify(execFile),script=path.resolve(__dirname,'../../../tools/migrate_game_maps.mjs');
 const g=await guest(),id=randomUUID(),started=await request('/v4/runs/start',{runId:id,levelId:1,previousRunId:null},g.idToken);
 assert.equal(started.status,200,JSON.stringify(started.data));
 const dry=await execute(process.execPath,[script,'--project','demo-kiem-khai'],{env:process.env});
 assert.equal(JSON.parse(dry.stdout).applied,false);assert.ok(JSON.parse(dry.stdout).legacyDocuments>=40);
 const applied=await execute(process.execPath,[script,'--project','demo-kiem-khai','--apply','--cleanup'],{env:process.env});
 assert.equal(JSON.parse(applied.stdout).applied,true);
 assert.ok((await db.collection('gameMaps').get()).docs.every(doc=>/^[1-9]\d*$/.test(doc.id)));
 const again=await execute(process.execPath,[script,'--project','demo-kiem-khai','--apply','--cleanup'],{env:process.env});
 assert.equal(JSON.parse(again.stdout).changed,0);assert.equal(JSON.parse(again.stdout).legacyDocuments,0);
 assert.deepEqual((await request('/v4/runs/start',{runId:id,levelId:1,previousRunId:null},g.idToken)).data,started.data);
 const run=started.data.run,finish=await request(`/v4/runs/${id}/finish`,{outcome:'lost',movesUsed:run.map.moves,objectiveProgress:{main:0},extraMovesUsed:false},g.idToken);
 assert.equal(finish.status,200,JSON.stringify(finish.data));
 assert.equal((await request(`/v3/chapters/chapter-1/maps?contentVersion=${version}`,undefined,g.idToken)).status,200);
 const publish=path.resolve(__dirname,'../../../tools/seed_game_content.mjs');
 const beforeRevision=(await db.doc('gameConfig/current').get()).data().catalogRevision;
 await execute(process.execPath,[publish,'--project','demo-kiem-khai','--apply'],{env:process.env});
 await execute(process.execPath,[publish,'--project','demo-kiem-khai','--apply'],{env:process.env});
 assert.equal((await db.doc('gameConfig/current').get()).data().catalogRevision,beforeRevision);
 assert.ok((await db.collection('gameMaps').get()).docs.every(doc=>/^[1-9]\d*$/.test(doc.id)));
});
test('an upgraded client recovers a committed legacy start with explicit revision metadata', {skip:!enabled},async()=>{
 const game=require('../../lib/domain/game'),config=game.validateContent(require('../../../content/game-config.json'));
 const g=await guest(),id=randomUUID(),created=await start(g,id);assert.equal(created.status,200,JSON.stringify(created.data));
 const ref=db.doc(`players/${g.uid}/runs/${id}`),stored=(await ref.get()).data();
 const {mapVersion,configVersion,...legacy}=stored;
 await ref.set({...legacy,map:game.mapToDocument(game.validateMap(require('../../../content/game-maps.json')[0],config))});
 const recovered=await request('/v4/runs/start',{runId:id,levelId:1,previousRunId:null},g.idToken);
 assert.equal(recovered.status,200,JSON.stringify(recovered.data));
 assert.deepEqual(recovered.data,created.data);
 const stats=(await db.doc(`players/${g.uid}/mapStats/1`).get()).data();assert.equal(stats.attemptsStarted,1);
});
