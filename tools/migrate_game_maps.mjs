import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {firebaseCliServices} from './firebase_cli_credentials.mjs';
const require=createRequire(import.meta.url);
const {validateContent}=require('./game-runtime.cjs');
const {migrateMapResource,migrateLegacyMapEntry}=require('./map_resources.cjs');
const args=process.argv.slice(2),project=args[args.indexOf('--project')+1],apply=args.includes('--apply'),cleanup=args.includes('--cleanup');
if(!args.includes('--project')||!project||project.startsWith('--'))throw new Error('An explicit --project ID is required.');
if(cleanup&&!apply)throw new Error('--cleanup requires --apply');
let db;
if(args.includes('--firebase-cli'))({db}=await firebaseCliServices(project));
else {
  const serverRequire=createRequire(new URL('../server/package.json',import.meta.url));
  const {initializeApp}=serverRequire('firebase-admin/app');
  const {getFirestore}=serverRequire('firebase-admin/firestore');
  if(project.startsWith('demo-')&&!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
  initializeApp({projectId:project});db=getFirestore();
}
try {
  const summary=await db.runTransaction(async tx=>{
    const settingsRef=db.doc('gameConfig/current'),settings=await tx.get(settingsRef);
    const [configs,maps]=await Promise.all([tx.get(db.collection('gameContent')),tx.get(db.collection('gameMaps'))]);
    const contentByVersion=new Map(configs.docs.map(doc=>{const c=validateContent(doc.data());return [c.version,c];}));
    const current=contentByVersion.get(settings.data()?.contentVersion);
    if(!current)throw new Error('CONTENT_NOT_CONFIGURED');
    const groups=new Map(),numeric=new Map();
    for(const doc of maps.docs) {
      if(/^[1-9]\d*$/.test(doc.id)){
        if(doc.data().id!==Number(doc.id))throw new Error(`INVALID_MAP_ID: ${doc.id}`);
        numeric.set(Number(doc.id),doc);continue;
      }
      const match=/^(\d+)_(\d+)$/.exec(doc.id);if(!match)throw new Error(`UNRECOGNIZED_MAP_DOCUMENT: ${doc.id}`);
      const content=contentByVersion.get(Number(match[1]));if(!content)throw new Error(`CONFIG_NOT_FOUND: ${doc.id}`);
      const map=migrateLegacyMapEntry(doc.data(),content,Number(match[2]));
      const entries=groups.get(map.id)??[];entries.push({map,content,ref:doc.ref});groups.set(map.id,entries);
    }
    const output=[];
    for(let id=1;id<=current.levelCount;id++) {
      const resource=migrateMapResource(numeric.get(id)?.data(),groups.get(id)??[],current);
      output.push({id,resource,changed:!isDeepStrictEqual(numeric.get(id)?.data(),resource)});
    }
    if(apply) {
      for(const item of output)if(item.changed)tx.set(db.doc(`gameMaps/${item.id}`),item.resource);
      if(output.some(item=>item.changed)||cleanup&&groups.size)tx.set(settingsRef,{catalogRevision:(settings.data()?.catalogRevision??0)+1},{merge:true});
      if(cleanup)for(const entries of groups.values())for(const entry of entries)tx.delete(entry.ref);
    }
    return {project,applied:apply,cleanup,maps:output.length,changed:output.filter(x=>x.changed).length,
      versions:output.reduce((sum,x)=>sum+x.resource.versions.length,0),legacyDocuments:[...groups.values()].reduce((sum,x)=>sum+x.length,0)};
  });
  console.log(JSON.stringify(summary,null,2));
} finally {await db.terminate();}
