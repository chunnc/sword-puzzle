// Local-only test control. Never forwards to production or writes application source.
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:'demo-kiem-khai'});
const db=require('firebase-admin/firestore').getFirestore(),auth=require('firebase-admin/auth').getAuth();
const target='http://127.0.0.1:5001/demo-kiem-khai/asia-southeast1/gameApi';
let offline=false,faults=[];const events=[];
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),body=raw.length?JSON.parse(raw.toString()):{};
  if(req.url==='/__control/legacy'&&req.method==='POST'){
   const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
   const x=await r.json();return json(res,{uid:x.localId,idToken:x.idToken,refreshToken:x.refreshToken,expiresIn:Number(x.expiresIn),isGuest:true});
  }
  if(req.url==='/__control'){
   if(req.method==='GET')return json(res,{offline,faults,events});
   if(body.action==='reset'){offline=false;faults=[];events.length=0;await db.recursiveDelete(db.collection('authThrottle'));}
   else if(body.action==='offline')offline=Boolean(body.value);
   else if(body.action==='fault')faults.push({path:body.path,status:body.status||401,error:body.error||'INVALID_SESSION',drop:!!body.drop,remaining:body.remaining||1});
   else if(body.action==='account'){
    if(typeof body.uid!=='string')throw new Error('UID required');
    if(body.mode==='disable')await auth.updateUser(body.uid,{disabled:true});
    else if(body.mode==='enable')await auth.updateUser(body.uid,{disabled:false});
    else if(body.mode==='delete')await auth.deleteUser(body.uid);
    else if(body.mode==='revoke'){await auth.revokeRefreshTokens(body.uid);const records=await db.collection('installations').where('playerUid','==',body.uid).get();await Promise.all(records.docs.map(d=>d.ref.update({authValidAfter:0})));}
    else throw new Error('Unknown account mode');
   } else if(body.action==='profile'){
    const ref=db.collection('players').doc(body.uid),snap=await ref.get();if(!snap.exists)throw new Error('Profile missing');
    const profile={...snap.data().profileV2,coins:body.coins??1000,levels:Array.from({length:body.levels??8},(_,i)=>({levelId:i+1,stars:3})),revision:(snap.data().profileV2.revision||0)+1};
    await ref.update({profileV2:profile});
   } else throw new Error('Unknown control action');
   return json(res,{ok:true});
  }
  if(offline)return json(res,{error:'NETWORK_ERROR'},503);
  const fault=faults.find(x=>x.remaining>0&&x.path===req.url);if(fault)fault.remaining--;
  if(fault&&!fault.drop){events.push({path:req.url,status:fault.status,injected:true});return json(res,{error:fault.error},fault.status);}
  const headers={'content-type':'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{})};
  const upstream=await fetch(target+req.url,{method:req.method,headers,body:raw.length?raw:undefined});
  const payload=await upstream.text();events.push({path:req.url,status:upstream.status,injected:!!fault});if(events.length>300)events.shift();
  if(fault?.drop){res.destroy();return;}
  res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')||'application/json','cache-control':'no-store'});res.end(payload);
 }catch(error){json(res,{error:'CONTROL_ERROR',message:error.message},500);}
}).listen(8787,'127.0.0.1',()=>console.log('Acceptance proxy ready on 127.0.0.1:8787 (demo emulator only)'));
