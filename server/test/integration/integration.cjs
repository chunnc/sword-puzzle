const {test,before}=require('node:test');
const {randomBytes,randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const base=process.env.API_BASE_URL;
if(base && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(base))throw new Error('Integration tests only run against local emulators.');
if(base){process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST||='127.0.0.1:9099';}
const config=require('../../../content/game-config.json'),maps=require('../../../content/game-maps.json');
before(async()=>{if(base){const {initializeApp,getApps}=require('firebase-admin/app');if(!getApps().length)initializeApp({projectId:'demo-kiem-khai'});const db=require('firebase-admin/firestore').getFirestore();await db.recursiveDelete(db.collection('authThrottle'));const game=require('../../lib/domain/game'),{publishMapResource}=require('../../../tools/map_resources.cjs'),batch=db.batch();batch.set(db.collection('gameContent').doc(String(config.version)),game.contentWire(game.validateContent(config)));for(const map of maps)batch.set(db.collection('gameMaps').doc(String(map.id)),publishMapResource(undefined,map,game.validateContent(config)));batch.set(db.collection('gameConfig').doc('current'),{contentVersion:config.version,minClientVersion:'1.8.0',rewardedAdsEnabled:false},{merge:true});await batch.commit();}});
async function request(path,body,token){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
const guest=async()=>{const installationId=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex'),result=await request('/v2/auth/device-session',{installationId,secret});assert.equal(result.status,200,JSON.stringify(result.data));return {...result.data,installationId,secret};};
const identity=(session,operationId=randomUUID(),extra={})=>({installationId:session.installationId,secret:session.secret,operationId,expectedBindingVersion:session.bindingVersion,...extra});

test('bootstrap and the only authored chapter expose two map summaries',{skip:!base},async()=>{
 const health=await request('/health');assert.equal(health.status,200);assert.equal(health.data.ok,true);
 const bootstrap=await request('/v3/bootstrap');assert.equal(bootstrap.status,200);assert.equal(bootstrap.data.contentVersion,8);assert.equal(bootstrap.data.levelCount,2);assert.equal(bootstrap.data.content.levels,undefined);
 const session=await guest(),chapter=await request('/v4/chapters/chapter-1/maps',undefined,session.idToken);
 assert.equal(chapter.status,200,JSON.stringify(chapter.data));assert.deepEqual(chapter.data.maps.map(map=>map.id),[1,2]);
});

test('registration and login preserve one UID with server-owned profile data',{skip:!base},async()=>{
 const session=await guest(),email=`catalog-${randomUUID()}@example.test`,password='a-long-test-password';
 const registered=await request('/v2/auth/register',identity(session,randomUUID(),{email,password}));
 assert.equal(registered.status,200,JSON.stringify(registered.data));assert.equal(registered.data.uid,session.uid);
 const other=await guest(),login=await request('/v2/auth/login',identity(other,randomUUID(),{email,password,confirmedDiscardGuest:true}));
 assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.uid,session.uid);
 const profile=await request('/v2/profile',undefined,login.data.idToken);
 assert.equal(profile.status,200);assert.deepEqual(profile.data.levels,[]);assert.equal(profile.data.coins,0);
});
