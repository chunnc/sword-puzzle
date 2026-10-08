const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {createHash}=require('node:crypto');
const base=process.env.API_BASE_URL;
if(base && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/demo-[^/]+\//.test(base))throw new Error('Identity tests require a local demo emulator.');
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const {initializeApp,getApps}=require('firebase-admin/app');
if(!getApps().length)initializeApp({projectId:'demo-kiem-khai'});
const db=require('firebase-admin/firestore').getFirestore();
const auth=require('firebase-admin/auth').getAuth();
before(async()=>{if(base)await db.recursiveDelete(db.collection('authThrottle'));});
async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
const device=()=>({installationId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('hex')});
async function start(d=device()){const r=await request('/v2/auth/device-session',d);assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,...d};}
const op=(g,extra={})=>({installationId:g.installationId,secret:g.secret,operationId:randomUUID(),expectedBindingVersion:g.bindingVersion,...extra});
const password='test-password-123';
async function account(){const g=await start(),email=`identity-${randomUUID()}@example.test`;const r=await request('/v2/auth/register',op(g,{email,password}));assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,secret:g.secret,email};}
test('concurrent initialization and retry preserve one UID; wrong keys never recover it',{skip:!base},async()=>{
 const d=device();const [a,b]=await Promise.all([start(d),start(d)]);assert.equal(a.uid,b.uid);
 assert.equal((await start(d)).uid,a.uid);
 assert.equal((await request('/v2/auth/device-session',{...d,secret:'0'.repeat(64)})).data.error,'DEVICE_KEY_INVALID');
 const stored=(await db.collection('installations').doc(d.installationId).get()).data();assert.equal(stored.secret,undefined);assert.equal(stored.playerUid,a.uid);
});
test('recovery mints a same-owner session and refresh retains per-device claims',{skip:!base},async()=>{
 const g=await start(),r=await start({installationId:g.installationId,secret:g.secret});assert.equal(r.uid,g.uid);
 const refreshed=await request('/v2/auth/refresh',{refreshToken:r.refreshToken});assert.equal(refreshed.status,200);assert.equal(refreshed.data.installationId,g.installationId);assert.equal(refreshed.data.bindingVersion,1);
});
test('idempotent registration, login and logout cannot repeat or resurrect an old binding',{skip:!base},async()=>{
 const g=await start(),email=`retry-${randomUUID()}@example.test`,registration=op(g,{email,password});
 const a=await request('/v2/auth/register',registration),again=await request('/v2/auth/register',registration);assert.equal(a.status,200);assert.equal(again.data.bindingVersion,a.data.bindingVersion);assert.equal(a.data.uid,g.uid);
 const other=await account(),input=op({...a.data,secret:g.secret},{email:other.email,password});
 const b=await request('/v2/auth/login',input),retry=await request('/v2/auth/login',input);assert.equal(b.status,200);assert.equal(retry.data.bindingVersion,b.data.bindingVersion);
 const logout=op({...b.data,secret:g.secret}),c=await request('/v2/auth/logout',logout);assert.equal(c.status,200);assert.equal(c.data.isGuest,true);assert.notEqual(c.data.uid,other.uid);
 assert.equal((await request('/v2/auth/logout',logout)).data.uid,c.data.uid);
 assert.equal((await request('/v2/auth/login',input)).data.error,'OPERATION_SUPERSEDED');
 assert.equal((await request('/v2/profile',undefined,b.data.idToken)).status,401);
});
test('two installations share an account; logout on one leaves the other active',{skip:!base},async()=>{
 const a=await account(),g=await start();const b=await request('/v2/auth/login',op(g,{email:a.email,password,confirmedDiscardGuest:true}));assert.equal(b.status,200);assert.equal(b.data.uid,a.uid);
 const changed=await request('/v2/auth/logout',op(a));assert.equal(changed.status,200);
 assert.equal((await request('/v2/profile',undefined,a.idToken)).status,401);
 assert.equal((await request('/v2/profile',undefined,b.data.idToken)).status,200);
 assert.equal((await start({installationId:g.installationId,secret:g.secret})).uid,a.uid);
});
test('pending owner protection rejects an account switch before rebinding',{skip:!base},async()=>{
 const a=await account(),g=await start();const r=await request('/v2/auth/login',op(g,{email:a.email,password,confirmedDiscardGuest:true,preserveOwnerId:g.uid}));
 assert.equal(r.data.error,'PROFILE_OWNER_MISMATCH');assert.equal((await start({installationId:g.installationId,secret:g.secret})).uid,g.uid);
});
test('disabled, deleted and revoked accounts cannot be restored by a device key',{skip:!base},async()=>{
 const a=await account(),input={installationId:a.installationId,secret:a.secret};
 await auth.updateUser(a.uid,{disabled:true});assert.equal((await request('/v2/auth/device-session',input)).data.error,'ACCOUNT_DISABLED');
 await auth.updateUser(a.uid,{disabled:false});
 // Set a future revocation baseline to avoid Auth emulator second precision.
 await db.collection('installations').doc(a.installationId).update({authValidAfter:0});
 assert.equal((await request('/v2/auth/device-session',input)).data.error,'DEVICE_REAUTH_REQUIRED');
 const reauth=await request('/v2/auth/login',op(a,{email:a.email,password}));assert.equal(reauth.status,200);
 await auth.deleteUser(a.uid);assert.equal((await request('/v2/auth/device-session',input)).data.error,'ACCOUNT_DELETED');
 assert.equal((await auth.getUser(a.uid).catch(()=>null)),null);
});
test('legacy sessions are adopted without changing UID, but protected APIs reject unbound tokens',{skip:!base},async()=>{
 const raw=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
 const legacy=await raw.json();assert.ok(legacy.idToken);
 assert.equal((await request('/v2/profile',undefined,legacy.idToken)).status,426);
 const d=device(),m=await request('/v2/auth/device-session',d,legacy.idToken);assert.equal(m.status,200);assert.equal(m.data.uid,legacy.localId);
 assert.equal((await request('/v2/profile',undefined,m.data.idToken)).status,200);
 assert.equal((await request('/v1/auth/login',{email:'old@example.test',password})).status,426);
});
test('verified legacy migration is not blocked by the new-guest IP quota',{skip:!base},async()=>{
 const raw=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
 const legacy=await raw.json();
 const refs=['127.0.0.1','::ffff:127.0.0.1','::1'].map(ip=>db.collection('authThrottle').doc(createHash('sha256').update(`device:${ip}:`).digest('hex')));
 await Promise.all(refs.map(ref=>ref.set({startsAt:Date.now(),count:30,expiresAt:new Date(Date.now()+3600000)})));
 try {
   const r=await request('/v2/auth/device-session',device(),legacy.idToken);
   assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.uid,legacy.localId);
 } finally {await Promise.all(refs.map(ref=>ref.delete()));}
});
