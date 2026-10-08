const {test}=require('node:test');
const {randomBytes,randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const base=process.env.API_BASE_URL;
if(base && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(base))throw new Error('Integration tests only run against local emulators.');
if(base){ process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'; process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'; }
const seed=require('../../../content/game-content.json');
const win=(id,levelId,stars)=>({id,kind:'win',levelId,stars,objectiveProgress:Object.fromEntries(seed.levels[levelId-1].objectives.map(o=>[o.id,o.target]))});
async function request(path,method='GET',body,token){
 const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,data:await response.json(),headers:response.headers};
}
const sync=(token,operations,contentVersion=3)=>request('/v2/profile/sync','POST',{contentVersion,operations},token);
const guest=async()=>{const secret=randomBytes(32).toString('hex'),installationId=randomBytes(16).toString('hex');const r=await request('/v2/auth/device-session','POST',{installationId,secret});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,secret};};
const change=(g,path,body={})=>request('/v2/auth/'+path,'POST',{installationId:g.installationId,secret:g.secret,operationId:randomUUID(),expectedBindingVersion:g.bindingVersion,...body});

test('health, remote catalog and full guest profile are available immediately',{skip:!base},async()=>{
 const health=await request('/health');assert.equal(health.status,200);assert.equal(health.data.ok,true);assert.equal(health.headers.get('cache-control'),'no-store');
 const bootstrap=await request('/v2/bootstrap');assert.equal(bootstrap.data.contentVersion,3);assert.equal(bootstrap.data.content.levels.length,40);assert.equal('effect' in bootstrap.data.content.skills[0],false);assert.equal('target' in bootstrap.data.content.skills[0],false);
 const g=await guest(),profile=await request('/v2/profile','GET',undefined,g.idToken);assert.equal(profile.status,200);assert.deepEqual(profile.data.loadout,{sword:'thanh-phong',skills:['nhat-kiem']});
 const {initializeApp,getApps}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore');if(!getApps().length)initializeApp({projectId:'demo-kiem-khai'});
 const stored=(await getFirestore().collection('players').doc(g.uid).get()).data();assert.ok(stored.profileV2);assert.ok(stored.createdAt);assert.equal(stored.refreshToken,undefined);
 const direct=await fetch(`http://127.0.0.1:8080/v1/projects/demo-kiem-khai/databases/(default)/documents/players/${g.uid}`,{headers:{authorization:`Bearer ${g.idToken}`}});assert.equal(direct.status,403);
});
test('guest registration preserves UID and progress, login and refresh restore them',{skip:!base},async()=>{
 const g=await guest();assert.equal((await sync(g.idToken,[win('register_win01',1,2),win('register_win02',2,1)])).status,200);
 const email=`player-${Date.now()}@example.test`,password='a-long-test-password';const registered=await change(g,'register',{email,password});assert.equal(registered.status,200);assert.equal(registered.data.uid,g.uid);
 const login=await change(await guest(),'login',{email,password,confirmedDiscardGuest:true});assert.equal(login.status,200);const refreshed=await request('/v2/auth/refresh','POST',{refreshToken:login.data.refreshToken});assert.equal(refreshed.status,200);assert.equal(refreshed.data.uid,g.uid);
 const p=await request('/v2/profile','GET',undefined,refreshed.data.idToken);assert.deepEqual(p.data.levels,[{levelId:1,stars:2},{levelId:2,stars:1}]);
});
test('zero-star rewards, upgrades, purchases and retries are authoritative',{skip:!base},async()=>{
 const g=await guest(),token=g.idToken,op=win('integration_zero01',1,0);let r=await sync(token,[op]);assert.equal(r.status,200);assert.equal(r.data.profile.totalExp,30);assert.equal(r.data.profile.coins,100);
 const retry=await sync(token,[op]);assert.equal(retry.data.profile.coins,100);assert.deepEqual(retry.data.rewards,r.data.rewards);
 const changed=await sync(token,[{...op,stars:3}]);assert.equal(changed.data.rejected[0].reason,'OPERATION_CONFLICT');
 r=await sync(token,[win('integration_up01',1,3),win('integration_win02',2,3),win('integration_win03',3,3),{id:'integration_buy01',kind:'purchase',category:'skill',itemId:'ngu-kiem'}]);assert.equal(r.data.profile.totalExp,300);assert.equal(r.data.profile.coins,310);assert.ok(r.data.profile.ownedSkills.includes('ngu-kiem'));
 const duplicate=await sync(token,[{id:'integration_buy02',kind:'purchase',category:'skill',itemId:'ngu-kiem'}]);assert.equal(duplicate.data.rejected[0].reason,'ALREADY_OWNED');assert.equal(duplicate.data.profile.coins,310);
 const invalid=await sync(token,[win('integration_skip01',6,3)]);assert.equal(invalid.data.rejected[0].reason,'LEVEL_LOCKED');
});
test('offline imports and retired progress writes are rejected',{skip:!base},async()=>{
 const g=await guest();const old=await sync(g.idToken,[win('legacy_win_01',1,3)],2);assert.equal(old.status,409);
 const imported=await sync(g.idToken,[{id:'legacy_import01',kind:'importProgress',levels:[{levelId:1,stars:3}]}]);assert.equal(imported.status,400);
 assert.equal((await request('/v1/progress','PUT',{levels:[{levelId:1,stars:3}]},g.idToken)).status,426);
 assert.equal((await request('/v2/profile','GET',undefined,'bad-token')).status,401);
 assert.equal((await request('/v2/auth/refresh','POST',{refreshToken:'invalid'})).status,401);
});
test('competing device purchases cannot overdraw the wallet',{skip:!base},async()=>{
 const g=await guest(),token=g.idToken;const operations=Array.from({length:8},(_,i)=>win(`compete_win_${i+1}`,i+1,0));operations.push({id:'compete_buy001',kind:'purchase',category:'sword',itemId:'trong-nhac'},{id:'compete_buy002',kind:'purchase',category:'sword',itemId:'hoa-van'},{id:'compete_buy003',kind:'purchase',category:'skill',itemId:'ngu-kiem'});assert.equal((await sync(token,operations)).data.profile.coins,250);
 const [a,b]=await Promise.all([sync(token,[{id:'compete_deviceA',kind:'purchase',category:'skill',itemId:'hoa-lien'}]),sync(token,[{id:'compete_deviceB',kind:'purchase',category:'skill',itemId:'dan-loi'}])]);assert.equal(a.data.acknowledged.length+b.data.acknowledged.length,1);assert.equal(a.data.rejected.length+b.data.rejected.length,1);assert.ok((await request('/v2/profile','GET',undefined,token)).data.coins>=0);
});
test('switching a guest requires confirmation and never merges its wallet',{skip:!base},async()=>{
 const email=`switch-${Date.now()}@example.test`,password='a-long-test-password';
 const a=await guest();const linked=await change(a,'register',{email,password});assert.equal(linked.status,200);
 await sync(linked.data.idToken,[win('switch_account01',1,2)]);
 const g=await guest();await sync(g.idToken,[win('switch_guest_01',1,3)]);
 assert.equal((await change(g,'login',{email,password})).data.error,'GUEST_DISCARD_CONFIRMATION_REQUIRED');
 const switched=await change(g,'login',{email,password,confirmedDiscardGuest:true});assert.equal(switched.status,200);
 const p=await request('/v2/profile','GET',undefined,switched.data.idToken);assert.equal(p.data.coins,125);assert.equal(p.data.totalExp,80);
 assert.equal((await request('/v2/profile','GET',undefined,g.idToken)).status,401);
});
test('multiple objectives are required and pinned content survives a catalog switch',{skip:!base},async()=>{
 const {getFirestore}=require('firebase-admin/firestore'),db=getFirestore();const v4=structuredClone(seed);v4.version=4;v4.levels[0].objectives=[{id:'collect',type:'Collect',tileKind:0,target:18},{id:'boss',type:'Boss',target:360,enemy:{id:'test-boss',name:'Boss',artKey:'beast'}}];
 await db.collection('gameContent').doc('4').set(v4);
 const g=await guest(),token=g.idToken;const purchase={id:'version_buy001',kind:'purchase',category:'skill',itemId:'ngu-kiem'};
 await sync(token,[win('version_win001',1,3),win('version_win002',2,3),win('version_win003',3,3),purchase]);
 await db.collection('gameConfig').doc('current').set({contentVersion:4},{merge:true});
 try {
  const c=await request('/v2/content/3');assert.equal(c.data.version,3);assert.equal((await request('/v2/bootstrap')).data.contentVersion,4);
  const missing=await sync(token,[{id:'multi_missing01',kind:'win',levelId:1,stars:3,objectiveProgress:{collect:18}}],4);assert.equal(missing.data.rejected[0].reason,'INCOMPLETE_OBJECTIVES');
  const alive=await sync(token,[{id:'multi_liveboss1',kind:'win',levelId:1,stars:3,objectiveProgress:{collect:18,boss:359}}],4);assert.equal(alive.data.rejected[0].reason,'INCOMPLETE_OBJECTIVES');
  const complete=await sync(token,[{id:'multi_complete1',kind:'win',levelId:1,stars:3,objectiveProgress:{collect:18,boss:360}}],4);assert.deepEqual(complete.data.acknowledged,['multi_complete1']);
  assert.deepEqual((await sync(token,[win('pinned_old_run1',1,0)],3)).data.acknowledged,['pinned_old_run1']);
  assert.deepEqual((await sync(token,[purchase],3)).data.acknowledged,[purchase.id]);
  const stale=await sync(token,[{id:'stale_purchase1',kind:'purchase',category:'sword',itemId:'trong-nhac'}],3);assert.equal(stale.data.rejected[0].reason,'CONTENT_MISMATCH');
 } finally {await db.collection('gameConfig').doc('current').set({contentVersion:3},{merge:true});}
});
