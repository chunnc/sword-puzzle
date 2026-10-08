// Evaluate an acceptance action in the actual Hermes runtime of a simulator.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const WebSocket = require('ws');
const args=process.argv.slice(2),flag=name=>args[args.indexOf(name)+1];
const port=args.includes('--port')?flag('--port'):'8097';
if(!/^\d{4,5}$/.test(port))throw new Error('Invalid local Metro port');
const origin=`http://127.0.0.1:${port}`;
const pages=await fetch(origin+'/json/list').then(r=>r.json());
if(args.includes('--list')){console.log(JSON.stringify(pages.map(p=>({id:p.id,title:p.title,description:p.description,deviceName:p.deviceName,webSocketDebuggerUrl:p.webSocketDebuggerUrl})),null,2));process.exit(0);}
const selector=flag('--device'),expression=flag('--expression');
if(!selector||!expression)throw new Error('Required: --device <page id or device name> --expression <JavaScript>');
const page=pages.find(p=>p.id===selector||p.deviceName===selector||p.description?.includes(selector)||p.title?.includes(selector));
if(!page)throw new Error('Simulator runtime unavailable. Use --list.');
const ws=new WebSocket(page.webSocketDebuggerUrl,{origin});await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=event=>reject(new Error(event.message || 'Hermes WebSocket unavailable'));});
let sequence=0;const pending=new Map();
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}};
const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||JSON.stringify(r.exceptionDetails));return r.result?.value;};
try{
 await evaluate(`globalThis.__swordAcceptanceTask={done:false};Promise.resolve().then(()=>eval(${JSON.stringify(expression)})).then(value=>globalThis.__swordAcceptanceTask={done:true,value},error=>globalThis.__swordAcceptanceTask={done:true,error:String(error)});'started'`);
 const end=Date.now()+45000;
 while(Date.now()<end){const raw=await evaluate('globalThis.__swordAcceptanceTask.done?JSON.stringify(globalThis.__swordAcceptanceTask):null');if(raw){const result=JSON.parse(raw);if(result.error)throw new Error(result.error);console.log(JSON.stringify(result.value,null,2));process.exitCode=0;break;}await new Promise(r=>setTimeout(r,250));}
 if(Date.now()>=end)throw new Error('Acceptance action timed out');
}finally{ws.close();}
