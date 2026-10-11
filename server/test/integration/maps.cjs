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
 for(const raw of require('../../../content/game-maps.json')){const map=game.validateMap(raw,content);batch.set(db.collection('gameMaps').doc(`${version}_${map.id}`),game.mapToDocument(map));}
 batch.set(db.collection('gameConfig').doc('current'),{contentVersion:version,minClientVersion:'1.6.0',rewardedAdsEnabled:false});await batch.commit();
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
 const next=await start(g,randomUUID(),1,null); // recover abandonment even if the local journal was lostassert.equal(next.status,200,JSON.stringify(next.data));
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
 const report={outcome:'won',movesUsed:run.map.starThresholds.threeStarMaxMovesUsed,objectiveProgress:{main:run.map.objectives[0].target},extraMovesUsed:false,stars:0};
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
