import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'server/package.json'));
const {validateContent}=require('./lib/domain/game');
const content=validateContent(JSON.parse(fs.readFileSync(path.join(root,'content/game-content.json'),'utf8')));
const args=process.argv.slice(2), project=args[args.indexOf('--project')+1];
if(!args.includes('--apply')) {console.log(`Validated content v${content.version}: ${content.levelCount} maps. Dry run; no database writes.`);process.exit(0);}
if(!args.includes('--project') || !project || project.startsWith('--'))throw new Error('An explicit --project ID is required.');
if(project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Demo projects require FIRESTORE_EMULATOR_HOST.');
const {initializeApp}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:project});const db=getFirestore(), ref=db.collection('gameContent').doc(String(content.version)), config=db.collection('gameConfig').doc('current');
await db.runTransaction(async tx=>{
 const [existing,settings]=await Promise.all([tx.get(ref),tx.get(config)]);
 if(existing.exists && !isDeepStrictEqual(existing.data(),content))throw new Error('Published content is immutable. Increment its version instead.');
 if(!existing.exists)tx.create(ref,content);
 tx.set(config,{...(!settings.exists?{rewardedAdsEnabled:false}:{}),contentVersion:content.version,minClientVersion:'1.3.0'},{merge:true});
});
console.log(`Published content v${content.version} to ${project}.`);
