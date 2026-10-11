// Training-only authoring calibration. No validation seed participates in selection.
const fs=require('node:fs'),path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {play,seedFor,targets}=require('./simulate_maps.cjs');
const source=require('../content/game-maps.json');
const count=Number(process.env.CALIBRATION_SEEDS||150);
if(!Number.isSafeInteger(count)||count<1)throw new Error('CALIBRATION_SEEDS must be a positive integer');
function assess(map,results,strict=true) {
  const band=targets[map.difficulty],won=results.filter(r=>r.won),moves=won.map(r=>r.movesUsed).sort((a,b)=>a-b);
  const win=won.length/results.length,median=moves.length?(moves[Math.floor((moves.length-1)/2)]+moves[Math.floor(moves.length/2)])/2:null;
  const collect=map.objectives.every(o=>o.type==='Collect');
  if(strict&&(win<band.win[0]||win>band.win[1]||collect&&(median<6||median>10)))return null;
  const rate=n=>won.filter(r=>r.movesUsed<=n).length/results.length,t3=(band.three[0]+band.three[1])/2;
  let stars=null;
  for(let three=1;three<map.moves;three++)for(let two=three+1;two<=map.moves;two++) {
    const rates=[1-win,win-rate(two),rate(two)-rate(three),rate(three)];
    if(strict&&(rates.some(r=>r===0)||rates[3]<band.three[0]||rates[3]>band.three[1]))continue;
    const loss=Math.abs(rate(three)-t3)+.001*Math.abs(two-(three+map.moves)/2);
    if(!stars||loss<stars.loss)stars={three,two,rates,loss};
  }
  if(!stars)return null;
  return {win,median,starRates:stars.rates,thresholds:{threeStarMaxMovesUsed:stars.three,twoStarMaxMovesUsed:stars.two},
    loss:Math.abs(win-(band.win[0]+band.win[1])/2)+(collect?.02*Math.abs((median??0)-8):0)+.001*Math.abs(map.moves-(collect?12:{easy:14,medium:16,hard:18,'very-hard':20}[map.difficulty]))+stars.loss*.1};
}
function sample(map,n=count){const probe=structuredClone(map);probe.starThresholds={threeStarMaxMovesUsed:1,twoStarMaxMovesUsed:map.moves-1};return Array.from({length:n},(_,i)=>play(probe,seedFor(i,'training')));}
function calibrate(original) {
  let best=null,evaluated=0;
  const consider=(map,results)=>{evaluated++;const report=assess(map,results);if(report&&(!best||report.loss<best.report.loss))best={map:structuredClone(map),report};};
  if(original.objectives.every(o=>o.type==='Collect')) {
    const shortlist=[];
    for(const chance of [.05,.1,.15])for(const pressure of [0,.15,.3,.45,.6])for(let moves=8;moves<=14;moves++) {
      const map=structuredClone(original);map.moves=moves;map.spawnPolicy.comboChance=chance;map.spawnPolicy.collectionPressure=pressure;
      const coarse=assess(map,sample(map,Math.min(40,count)),false);
      const band=targets[map.difficulty];
      if(coarse&&coarse.win>=band.win[0]-.1&&coarse.win<=band.win[1]+.1&&coarse.median>=5&&coarse.median<=11)shortlist.push({map,loss:coarse.loss});
    }
    shortlist.sort((a,b)=>a.loss-b.loss);
    // Refine the best training candidates; expand only if no feasible candidate exists.
    for(let i=0;i<shortlist.length;i++) {if(i>=20&&best)break;consider(shortlist[i].map,sample(shortlist[i].map));}
  } else if(['Battle','Boss'].includes(original.objectives[0].type)) {
    // With no Collect/obstacles, normal-bot decisions and spawn weights do not
    // depend on target HP or director pressure. Reuse high-HP damage prefixes.
    if(original.initialSeals.length||original.layout.flat().includes(5))throw new Error('Damage-prefix calibration requires an obstacle-free map');
    const preferred={easy:14,medium:16,hard:18,'very-hard':20}[original.difficulty];
    const probe=structuredClone(original);probe.moves=preferred+2;probe.objectives[0].target=original.objectives[0].type==='Boss'?20000:12000;
    const traces=Array.from({length:count},(_,i)=>play(probe,seedFor(i,'training'),'normal','expected',0,true));
    for(const moves of [preferred-6,preferred-4,preferred-2,preferred,preferred+2]) {
      const timelines=traces.map(r=>r.timeline.filter(t=>t.kind==='swap'?t.movesUsed<=moves:t.movesUsed<moves));
      const ends=timelines.map(t=>t.at(-1)?.damage??0);
      const goals=[...new Set(ends.flatMap(d=>[d,d+1]))].filter(d=>d>=150&&d<=probe.objectives[0].target).sort((a,b)=>a-b);
      for(const target of goals) {
        const map=structuredClone(original);map.moves=moves;map.objectives[0].target=target;
        consider(map,timelines.map(t=>{const finish=t.find(s=>s.damage>=target);return {won:!!finish,movesUsed:finish?.movesUsed??moves};}));
      }
    }
    // Confirm the selected prefix candidate using real runs before authoring it.
    if(best){const confirmed=assess(best.map,sample(best.map));if(!confirmed)throw new Error(`Map ${original.id}: prefix candidate failed real-run confirmation`);best.report=confirmed;}
  } else {
    for(let moves=3;moves<=24;moves++){const map=structuredClone(original);map.moves=moves;consider(map,sample(map));}
  }
  if(!best)throw new Error(`Map ${original.id}: no candidate satisfies training win/star and Collect median gates; constraints were not relaxed`);
  best.map.starThresholds=best.report.thresholds;
  return {...best,evaluated,trainingSeeds:count};
}
async function main(){
  const args=process.argv.slice(2),at=args.indexOf('--maps'),ids=at<0?null:args[at+1].split(',').map(Number);
  const selected=source.slice(0,10).filter(m=>!ids||ids.includes(m.id));
  if(!selected.length||ids?.some(id=>!Number.isInteger(id)||id<1||id>10))throw new Error('--maps must select pilot IDs 1–10');
  const {results,failures}=await new Promise((resolve,reject)=>{
    const queue=[...selected],active=new Set(),done=[],failures=[];
    const drain=()=>{while(queue.length&&active.size<4){const map=queue.shift();const worker=new Worker(__filename,{workerData:{map,count}});active.add(worker);
      worker.on('message',message=>{if(message.error){failures.push({id:map.id,error:message.error});console.error(message.error);return;}done.push(message);console.log(`Map ${message.map.id}: ${message.map.moves} moves, targets ${message.map.objectives.map(o=>o.target)}, win ${message.report.win.toFixed(3)}, median ${message.report.median}, 3star ${message.report.starRates[3].toFixed(3)}`);});
      worker.on('error',reject);worker.on('exit',code=>{active.delete(worker);if(code!==0){reject(new Error(`Calibration worker exited ${code}`));return;}if(!queue.length&&!active.size)resolve({results:done.sort((a,b)=>a.map.id-b.map.id),failures});else drain();});
    }};drain();
  });
  const directory=path.join(__dirname,'../content/balance');
  fs.writeFileSync(path.join(directory,'calibration-v6.json'),JSON.stringify({suite:'training',status:failures.length?'failed':'passed',trainingSeeds:count,coarseSeeds:Math.min(40,count),results,failures},null,2)+'\n');
  if(args.includes('--apply'))fs.writeFileSync(path.join(__dirname,'../content/game-maps.json'),JSON.stringify(source.map(m=>results.find(r=>r.map.id===m.id)?.map??m),null,2)+'\n');
  if(failures.length)process.exitCode=1;
}
if(!isMainThread){try{parentPort.postMessage(calibrate(workerData.map));}catch(error){parentPort.postMessage({error:error.message});}}
else if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={assess,calibrate};
