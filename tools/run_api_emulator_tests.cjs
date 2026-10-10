const {spawn}=require('node:child_process');
const path=require('node:path');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Run inside firebase emulators:exec --project demo-kiem-khai --only auth,firestore');
process.env.GCLOUD_PROJECT='demo-kiem-khai';process.env.GAME_AUTH_API_KEY='demo';
const root=path.resolve(__dirname,'..'),express=require('../server/node_modules/express');
const {app}=require('../server/lib/index');
const host=express();host.use('/demo-kiem-khai/local',app);
const server=host.listen(0,'127.0.0.1');
(async()=>{
 await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/demo-kiem-khai/local`;
 for(const file of ['maps.cjs','identity.cjs','integration.cjs']) {
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--test',`server/test/integration/${file}`],{cwd:root,stdio:'inherit',env:{...process.env,API_BASE_URL:base,MAP_EMULATOR_TEST:'1'}});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${file} failed: ${code}`)));
  });
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>server.close());
