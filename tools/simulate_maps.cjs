const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { BoardEngine, installContent, validateContent, validateMap, mapToLevel, mapStars, tileId, assistForFailures, mapFromDocument, mapToDocument } = require('./game-runtime.cjs');
const {createHash}=require('node:crypto');
const { renderBalanceReport } = require('./render_balance_report.cjs');
const { resolveSnapshot, defaultProject, buildSnapshot } = require('./sync_content_cache.cjs');
const { PROFILES } = require('./map_generation.cjs');
let content = installContent(require('../content/game-config.json'));
let catalog = require('../content/game-maps.json').map(m => validateMap(m, content));
const BOT_MODEL = Object.freeze({
  version: 1,
  loadout: Object.freeze({ sword: null, skills: Object.freeze([]) }),
  mistakeRates: Object.freeze({ basic: .3, normal: .2, strategic: .1 }),
  mistakeCandidateLimit: 3,
  mistakeSelection: 'uniform-among-next-three-lower-ranked-moves'
});
const targets = Object.fromEntries(Object.entries(PROFILES).map(([difficulty, profile]) => [difficulty, {
  win: profile.win, three: profile.three,
  exclusiveWin: profile.exclusiveWin, exclusiveThree: profile.exclusiveThree
}]));
function installSnapshot(config, maps) {
  content = installContent(config);
  catalog = maps.map(map => validateMap(map, content));
  return { content, catalog };
}
function rng(seed) { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function seedFor(index, suite = 'validation') { return ((index+1)*2654435761 + (suite === 'training' ? 104729 : 13007)) >>> 0 || 1; }
function matched(snapshot, move) {
  const { width:w, height:h } = snapshot.level.board, tiles = snapshot.tiles.slice();
  const a = move[1]*w+move[0], b = move[3]*w+move[2];
  [tiles[a],tiles[b]] = [tiles[b],tiles[a]];
  const result = new Set(), rock = tileId('rock', content);
  for (const [start,step,len] of [...Array.from({length:h},(_,y)=>[y*w,1,w]), ...Array.from({length:w},(_,x)=>[x,w,h])]) {
    for (let i=0;i<len;) {
      const t = tiles[start+i*step]; let end=i+1;
      while (end<len && t && t.kind!==rock && tiles[start+end*step]?.kind===t.kind) end++;
      if (t && t.kind!==rock && end-i>=3) for(let n=i;n<end;n++) result.add(start+n*step);
      i=end;
    }
  }
  return { tiles, cells:[...result] };
}
function clearValue(snapshot, cells, tiles=snapshot.tiles) {
  const { width:w,height:h } = snapshot.level.board;
  let value=0;
  for(const i of cells) {
    const tile=tiles[i]; if(!tile)continue;
    value += .08 + (tile.chargeTier ? tile.chargeTier*.25 : 0);
    for(const o of snapshot.level.objectives) {
      if(snapshot.objectiveProgress[o.id]>=o.target)continue;
      if(o.type==='Collect' && tile.kind===o.tileKind)value+=1;
      if(o.type==='BreakSeals' && tile.locked)value+=1.4;
      if(o.type==='Battle'||o.type==='Boss')value+=(content.tiles.find(t=>t.id===tile.kind)?.damage??0)/10;
      if(o.type==='BreakRocks'||o.type==='BreakSeals')for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]) {
        const x=i%w+dx,y=Math.floor(i/w)+dy;
        if(x<0||x>=w||y<0||y>=h)continue;
        const neighbor=tiles[y*w+x];
        if(o.type==='BreakRocks'&&neighbor?.kind===tileId('rock',content)||o.type==='BreakSeals'&&neighbor?.locked)value+=1.4;
      }
    }
    value+=(content.tiles.find(t=>t.id===tile.kind)?.qi??0)*.08;
  }
  return value;
}
function chooseSwap(engine, bot, random) {
  const snapshot=engine.snapshot(), moves=engine.legalMoves();
  if(!moves.length)return {move:null,suboptimal:false};
  const ranked=moves.map(move=>{
    const {tiles,cells}=matched(snapshot,move);
    return {move,score:clearValue(snapshot,cells,tiles)+(cells.length>=4 ? .8*cells.length : 0)};
  }).sort((a,b)=>b.score-a.score);
  if(bot==='strategic') {
    // Independent samples prevent the bot from peeking at the actual run's future RNG.
    const sampleSeed=(random()*4294967295)>>>0||1;
    for(const candidate of ranked.slice(0,3)) {
      const sample={...snapshot,randomState:sampleSeed};
      const next=new BoardEngine(snapshot.level,sample);
      next.trySwap(...candidate.move);
      const after=next.snapshot();
      const delta=after.level.objectives.reduce((sum,o)=>sum+(after.objectiveProgress[o.id]-snapshot.objectiveProgress[o.id])/o.target,0);
      const future=next.legalMoves().map(m=>{const p=matched(after,m);return clearValue(after,p.cells,p.tiles);});
      candidate.score+=delta*5+Math.max(0,...future)*.25;
    }
    ranked.sort((a,b)=>b.score-a.score);
  }
  return selectRankedMove(ranked, BOT_MODEL.mistakeRates[bot], random);
}
function selectRankedMove(ranked, mistakeRate, random) {
  if(!ranked.length)return {move:null,suboptimal:false};
  const bestScore=ranked[0].score;
  const best=ranked.filter(candidate=>candidate.score===bestScore);
  const lower=ranked.filter(candidate=>candidate.score<bestScore).slice(0,BOT_MODEL.mistakeCandidateLimit);
  if(lower.length&&random()<mistakeRate) {
    const selected=lower[Math.floor(random()*lower.length)];
    return {move:selected.move,suboptimal:true};
  }
  const selected=best.length===1?best[0]:best[Math.floor(random()*best.length)];
  return {move:selected.move,suboptimal:false};
}
function play(map, seed, bot='normal', power='expected', assist=0, trace=false, context={}) {
  const random=rng(seed^0x5a17c9e3), totalExp=context.totalExp??(power==='minimum'?0:power==='strong'?(map.id-1)*100+1500:(map.id-1)*60);
  const level=mapToLevel(map,seed,assist,content);
  const engine=new BoardEngine(level,null,{loadout:{sword:null,skills:[]},totalExp});
  let waves=0,maxChain=0,actions=0,damage=0,suboptimalChoices=0;
  const waveCounts={},timeline=[],metrics={seeded:0,setups:0,setupAttempts:0,setupFallbacks:0,setupUsed:0,chargesCreated:0,chargesActivated:0,settlements:0};
  for(let action=0;action<map.moves*3+10&&!engine.won&&!engine.lost;action++) {
    const choice=chooseSwap(engine,bot,random);
    if(!choice.move||!engine.trySwap(...choice.move))break;
    if(choice.suboptimal)suboptimalChoices++;
    waves+=engine.animation?.steps.length??0;
    maxChain=Math.max(maxChain,...(engine.animation?.steps.map(s=>s.chain)??[0]));
    actions++;const count=engine.animation?.steps.length??0;waveCounts[count]=(waveCounts[count]??0)+1;
    for(const key of Object.keys(metrics))metrics[key]+=engine.actionMetrics[key];
    if(trace){damage+=engine.animation.steps.reduce((sum,s)=>sum+s.damage,0);timeline.push({movesUsed:engine.movesUsed,damage,kind:engine.animation.kind});}
  }
  const snapshot=engine.snapshot();
  return {won:engine.won,stars:engine.won?mapStars(map,engine.movesUsed):0,movesUsed:engine.movesUsed,waves,maxChain,reshuffles:snapshot.reshuffles??0,actions,suboptimalChoices,waveCounts,metrics,...(trace?{timeline}:{}),
    stalled:!engine.won&&!engine.lost,objectiveProgress:{...snapshot.objectiveProgress},
    progress:map.objectives.reduce((sum,o)=>sum+snapshot.objectiveProgress[o.id]/o.target,0)/map.objectives.length};
}
function summarize(map, results) {
  const won=results.filter(r=>r.won),lost=results.filter(r=>!r.won),histogram=[0,0,0,0];results.forEach(r=>histogram[r.stars]++);
  const moves=won.map(r=>r.movesUsed).sort((a,b)=>a-b),waveCounts={},metrics={};let actions=0,suboptimalChoices=0;
  for(const r of results){actions+=r.actions??0;suboptimalChoices+=r.suboptimalChoices??0;for(const [key,value]of Object.entries(r.waveCounts??{}))waveCounts[key]=(waveCounts[key]??0)+value;for(const [key,value]of Object.entries(r.metrics??{}))metrics[key]=(metrics[key]??0)+value;}
  return {mapHash:createHash('sha256').update(JSON.stringify(map)).digest('hex'),id:map.id,difficulty:map.difficulty,samples:results.length,winRate:won.length/results.length,starRates:histogram.map(n=>n/results.length),
    suboptimalChoices,suboptimalChoiceRate:actions?suboptimalChoices/actions:0,
    medianMoves:moves.length?(moves[Math.floor((moves.length-1)/2)]+moves[Math.floor(moves.length/2)])/2:null,actions,waveCounts,metrics,settlementRate:actions?(metrics.settlements??0)/actions:0,
    movesHistogram:Object.fromEntries(Array.from({length:map.moves+1},(_,n)=>[n,won.filter(r=>r.movesUsed===n).length]).filter(([,n])=>n)),
    averageMoves:won.length?won.reduce((s,r)=>s+r.movesUsed,0)/won.length:null,averageProgress:results.reduce((s,r)=>s+r.progress,0)/results.length,
    averageFailedProgress:lost.length?lost.reduce((s,r)=>s+r.progress,0)/lost.length:null,
    averageReshuffles:results.reduce((s,r)=>s+r.reshuffles,0)/results.length,averageWaves:results.reduce((s,r)=>s+r.waves,0)/results.length,maxChain:Math.max(...results.map(r=>r.maxChain))};
}
function simulateRetryChunk(map, start, count, playAttempt=play) {
  const maxAttempts=30, attempts=[], levels=[...new Set([0,...map.retryAssistPolicy.reductions])].sort((a,b)=>a-b);
  const byAssist=new Map(levels.map(assist=>[assist,{assist,samples:0,wins:0,losses:0,suboptimalChoices:0,starCounts:[0,0,0,0]}]));
  const byAttempt=Array.from({length:maxAttempts},(_,i)=>({attempt:i+1,assist:assistForFailures(map,i),samples:0,wins:0,losses:0,suboptimalChoices:0}));
  let unfinished=0;
  for(let i=start;i<start+count;i++) {
    let done=false;
    for(let attempt=0;attempt<maxAttempts;attempt++) {
      const assist=assistForFailures(map,attempt);
      const result=playAttempt(map,seedFor(i*31+attempt,'retry'),'normal','expected',assist);
      const bucket=byAssist.get(assist), step=byAttempt[attempt];
      bucket.samples++;step.samples++;
      bucket.suboptimalChoices+=result.suboptimalChoices??0;step.suboptimalChoices+=result.suboptimalChoices??0;
      bucket.starCounts[result.won?result.stars:0]++;
      if(result.won) { bucket.wins++;step.wins++;attempts.push(attempt+1);done=true;break; }
      bucket.losses++;step.losses++;
    }
    if(!done)unfinished++;
  }
  return {attempts,unfinished,byAssist:[...byAssist.values()],byAttempt};
}
function mergeRetryChunks(chunks) {
  const byAssist=new Map(),byAttempt=[],attempts=[];
  let unfinished=0;
  for(const chunk of chunks) {
    unfinished+=chunk.unfinished;
    attempts.push(...chunk.attempts);
    for(const bucket of chunk.byAssist) {
      const target=byAssist.get(bucket.assist)??{assist:bucket.assist,samples:0,wins:0,losses:0,suboptimalChoices:0,starCounts:[0,0,0,0]};
      target.samples+=bucket.samples;target.wins+=bucket.wins;target.losses+=bucket.losses;target.suboptimalChoices+=bucket.suboptimalChoices??0;
      bucket.starCounts.forEach((value,index)=>{target.starCounts[index]+=value;});
      byAssist.set(bucket.assist,target);
    }
    chunk.byAttempt.forEach((step,index)=>{
      if(!byAttempt[index])byAttempt[index]={attempt:step.attempt,assist:step.assist,samples:0,wins:0,losses:0,suboptimalChoices:0};
      byAttempt[index].samples+=step.samples;byAttempt[index].wins+=step.wins;byAttempt[index].losses+=step.losses;byAttempt[index].suboptimalChoices+=step.suboptimalChoices??0;
    });
  }
  return {attempts,unfinished,byAssist:[...byAssist.values()].sort((a,b)=>a.assist-b.assist),byAttempt};
}
function spawnAssistMechanisms(map) {
  if(map.tutorial||(map.contentVersion??0)<8||!map.retryAssistPolicy.reductions.some(a=>a>0))return [];
  const p=map.spawnPolicy,mechanisms=[];
  if(p.comboChance<1)mechanisms.push('directMatch');
  if((p.setupChance??0)<1)mechanisms.push('preparedCombo');
  if(map.objectives.some(o=>o.type==='Collect')&&p.collectionPressure>0)mechanisms.push('collectionWeights');
  if(p.candidates>1&&p.obstaclePressure>0&&(map.initialSeals.length>0||map.layout.flat().some(id=>id===tileId('rock',content))))mechanisms.push('obstacleCandidates');
  return mechanisms;
}
function finalizeRetries(map, count, merged) {
  const {attempts}=merged,maxAttempts=30;
  let cumulativeWins=0;
  const assistMechanisms=spawnAssistMechanisms(map);
  return {id:map.id,bot:'normal',power:'expected',botModel:BOT_MODEL,samples:count,completed:attempts.length,unfinished:merged.unfinished,maxAttempts,
    averageAttempts:attempts.length?attempts.reduce((a,b)=>a+b,0)/attempts.length:null,
    totalAttempts:merged.byAttempt.reduce((sum,r)=>sum+r.samples,0),
    suboptimalChoices:merged.byAttempt.reduce((sum,r)=>sum+(r.suboptimalChoices??0),0),
    hasSpawnPressure:assistMechanisms.length>0,assistMechanisms,
    attemptsHistogram:Object.fromEntries(Array.from({length:maxAttempts},(_,n)=>[n+1,attempts.filter(a=>a===n+1).length]).filter(([,n])=>n)),
    byAssist:merged.byAssist.map(({starCounts,...r})=>({...r,suboptimalChoiceRate:r.samples?r.suboptimalChoices/r.samples:null,winRate:r.samples?r.wins/r.samples:null,starRates:r.samples?starCounts.map(n=>n/r.samples):[0,0,0,0]})),
    byAttempt:merged.byAttempt.map(r=>{cumulativeWins+=r.wins;return {...r,suboptimalChoiceRate:r.samples?r.suboptimalChoices/r.samples:null,winRate:r.samples?r.wins/r.samples:null,cumulativeWinRate:count?cumulativeWins/count:null};})};
}
function simulateRetries(map, count, playAttempt=play) {
  return finalizeRetries(map, count, mergeRetryChunks([simulateRetryChunk(map, 0, count, playAttempt)]));
}
function executeTask(task) {
  const map=catalog[task.id-1];
  if(task.kind==='simulate')return {results:Array.from({length:task.count},(_,index)=>play(map,seedFor(task.start+index,task.suite),task.bot,task.power))};
  if(task.kind==='assist')return {results:[0,.1,.2,.3].map(assist=>({assist,wins:Array.from({length:task.count},(_,index)=>play(map,seedFor(task.start+index), 'normal','expected',assist)).filter(r=>r.won).length}))};
  return {chunk:simulateRetryChunk(map,task.start,task.count)};
}

function evaluateChecks(reports, count, enabled) {
  const tolerance=count<1000?.12:0, results=[];
  const below=(a,b)=>a<b-1e-12;
  const outside=(rate,range,exclusiveLower)=>exclusiveLower
    ? rate<=range[0]-tolerance+1e-12||rate>range[1]+tolerance+1e-12
    : rate<range[0]-tolerance-1e-12||rate>range[1]+tolerance+1e-12;
  for(const r of reports.filter(r=>r.bot==='normal'&&r.power==='expected')) {
    const t=targets[r.difficulty], failures=[];
    if(outside(r.winRate,t.win,t.exclusiveWin))failures.push(`Map ${r.id}: tỷ lệ thắng nằm ngoài khoảng kiểm tra.`);
    if(outside(r.starRates[3],t.three,t.exclusiveThree))failures.push(`Map ${r.id}: tỷ lệ 3 sao nằm ngoài khoảng kiểm tra.`);
    if(content.version>=8){
      if(r.maxChain>4)failures.push(`Map ${r.id}: cascade vượt 4 wave.`);
    }
    results.push({id:r.id,bot:r.bot,power:r.power,gate:'difficulty',passed:!failures.length,failures});
  }
  for(const r of reports.filter(r=>r.bot==='strategic'&&r.power==='expected')) {
    const basic=reports.find(b=>b.id===r.id&&b.bot==='basic'&&b.power===r.power);
    if(basic) {
      const failures=below(r.winRate,basic.winRate)||below(r.starRates[3],basic.starRates[3])?[`Map ${r.id}: strategic kém basic về win hoặc 3 sao.`]:[];
      results.push({id:r.id,bot:r.bot,power:r.power,gate:'strategy',passed:!failures.length,failures});
    }
  }
  const failures=results.flatMap(r=>r.failures);
  for(const r of reports)if(r.maxChain>4)failures.push(`Map ${r.id} ${r.bot}/${r.power}: cascade vượt 4 wave.`);
  return {enabled,tolerance,results,failures,status:!enabled?'not-run':!results.length?'not-applicable':failures.length?'failed':'passed'};
}

function parseOptions(args) {
  const values={}, flags=new Set(['--check','--offline']);
  const options=new Set(['--seeds','--suite','--bots','--powers','--maps','--retry-seeds','--assist-seeds','--source','--output','--html-output','--project','--jobs']);
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(flags.has(key)){values[key]=true;continue;}
    if(!options.has(key))throw new Error(`Unknown option: ${key}`);
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${key}`);
    values[key]=args[++i];
  }
  const count=Number(values['--seeds']??100),retryCount=Number(values['--retry-seeds']??0);
  if(!Number.isSafeInteger(count)||count<1)throw new Error('--seeds must be a positive integer');
  if(!Number.isSafeInteger(retryCount)||retryCount<0)throw new Error('--retry-seeds must be a non-negative integer');
  const assistCount=Number(values['--assist-seeds']??0),source=values['--source']??'server';
  if(!Number.isSafeInteger(assistCount)||assistCount<0)throw new Error('--assist-seeds must be a non-negative integer');
  if(!['local','server'].includes(source))throw new Error('--source must be local or server');
  if(source==='local'&&values['--offline'])throw new Error('--offline applies to server cache, not --source local');
  const jobs=values['--jobs']===undefined?os.availableParallelism():Number(values['--jobs']);
  if(!Number.isSafeInteger(jobs)||jobs<1)throw new Error('--jobs must be a positive integer');
  const list=(key, fallback, valid)=>{
    const entries=[...new Set((values[key]??fallback).split(',').map(s=>s.trim()))];
    if(entries.some(s=>!valid(s)))throw new Error(`Invalid value for ${key}`);
    return entries;
  };
  const suite=values['--suite']??'validation';
  if(!['training','validation'].includes(suite))throw new Error('--suite must be training or validation');
  return {count,retryCount,assistCount,source,suite,check:values['--check']===true,offline:values['--offline']===true,project:values['--project']??defaultProject(),jobs,
    ids:list('--maps',Array.from({length:catalog.length},(_,index)=>String(index+1)).join(','),s=>/^\d+$/.test(s)&&Number(s)>=1&&Number(s)<=catalog.length).map(Number),
    bots:list('--bots','basic,normal,strategic',s=>['basic','normal','strategic'].includes(s)),
    powers:list('--powers','expected',s=>['minimum','expected','strong'].includes(s)),
    output:values['--output']??null,htmlOutput:values['--html-output']??null};
}

function createWorkerPool(size, workerData) {
  const workerPath=path.join(__dirname,'simulate_maps_worker.cjs');
  const workers=new Set(),idle=[],queue=[],pending=new Map();
  let sequence=0,failure=null,closing=false;
  const fail=error=>{
    if(failure||closing)return;
    failure=error;
    for(const entry of pending.values())entry.reject(error);
    pending.clear();
    for(const entry of queue)entry.reject(error);
    queue.length=0;
  };
  const drain=()=>{
    while(!failure&&queue.length&&idle.length) {
      const worker=idle.pop(),entry=queue.shift(),key=sequence++;
      pending.set(key,entry);
      worker.postMessage({key,task:entry.task});
    }
  };
  for(let index=0;index<size;index++) {
    const worker=new Worker(workerPath,{workerData});
    workers.add(worker);idle.push(worker);
    worker.on('message',message=>{
      if(failure)return;
      if(message.error){fail(new Error(message.error));return;}
      const entry=pending.get(message.key);
      if(!entry)return;
      pending.delete(message.key);
      entry.resolve(message.payload);
      idle.push(worker);
      drain();
    });
    worker.on('error',fail);
    worker.on('exit',code=>{if(!closing&&code!==0)fail(new Error(`Simulation worker exited with code ${code}.`));});
  }
  return {
    run(task){
      if(failure)return Promise.reject(failure);
      return new Promise((resolve,reject)=>{queue.push({task,resolve,reject});drain();});
    },
    async close(){
      closing=true;
      for(const entry of queue)entry.reject(new Error('Simulation cancelled.'));
      queue.length=0;
      await Promise.all([...workers].map(worker=>worker.terminate()));
    }
  };
}

async function main(args) {
  const options=parseOptions(args),startedAt=new Date();
  const runId=startedAt.toISOString().replace(/[:.]/g,'-')+`-${process.pid}`;
  const directory=path.resolve(__dirname,'../.balance-reports');
  const jsonPath=path.resolve(options.output??path.join(directory,`maps-${runId}.json`));
  const htmlPath=path.resolve(options.htmlOutput??path.join(path.dirname(jsonPath),`maps-${runId}.html`));
  if(jsonPath===htmlPath)throw new Error('--output and --html-output must point to different files');
  const localConfig=options.source==='local'?JSON.parse(fs.readFileSync(path.join(__dirname,'../content/game-config.json'),'utf8')):null;
  const snapshot=options.source==='local'
    ? {...buildSnapshot({project:options.project,config:localConfig,maps:JSON.parse(fs.readFileSync(path.join(__dirname,'../content/game-maps.json'),'utf8')).map(m=>mapFromDocument(mapToDocument(m),validateContent(localConfig))),syncedAt:new Date().toISOString()}),source:'local'}
    : await resolveSnapshot({project:options.project,offline:options.offline});
  installSnapshot(snapshot.config,snapshot.maps);
  for(const id of options.ids)if(id<1||id>content.levelCount)throw new Error(`Map ${id} is not in published content v${content.version} (${content.levelCount} maps)`);
  console.log(`Content v${content.version} · ${snapshot.source==='local'?'local authoring':snapshot.source==='server'?'synced from server':'local cache'} · ${snapshot.project}${snapshot.cacheFile?` · ${path.relative(process.cwd(),snapshot.cacheFile)}`:''}`);
  const reportSlots=[],retrySlots=[],assistSlots=[],tasks=[];
  const seedChunk=Math.max(1,Math.ceil(options.count/(options.jobs*4)));
  for(const id of options.ids)for(const bot of options.bots)for(const power of options.powers) {
    const slot={id,bot,power,chunks:new Map(),total:0};reportSlots.push(slot);
    for(let start=0;start<options.count;start+=seedChunk) {slot.total++;tasks.push({slot,kind:'simulate',id,bot,power,suite:options.suite,start,count:Math.min(seedChunk,options.count-start)});}
  }
  if(options.retryCount) {
    const retryChunk=Math.max(1,Math.ceil(options.retryCount/(options.jobs*4)));
    for(const id of options.ids) {
      const slot={id,chunks:new Map(),total:0};retrySlots.push(slot);
      for(let start=0;start<options.retryCount;start+=retryChunk) {slot.total++;tasks.push({slot,kind:'retry',id,start,count:Math.min(retryChunk,options.retryCount-start)});}
    }
  }
  if(options.assistCount)for(const id of options.ids.filter(id=>{
    const map=catalog[id-1];return map&&!map.tutorial&&map.retryAssistPolicy.reductions.some(reduction=>reduction>0);
  })) {
    const slot={id,chunks:new Map(),total:0};assistSlots.push(slot);
    const chunk=Math.max(1,Math.ceil(options.assistCount/(options.jobs*4)));
    for(let start=0;start<options.assistCount;start+=chunk){slot.total++;tasks.push({slot,kind:'assist',id,start,count:Math.min(chunk,options.assistCount-start)});}
  }
  const collect=(task,payload)=>{
    task.slot.chunks.set(task.start,payload);
    if(task.slot.chunks.size<task.slot.total)return;
    if(task.kind==='simulate') {
      const results=[...task.slot.chunks.entries()].sort((a,b)=>a[0]-b[0]).flatMap(([,value])=>value.results);
      const report={...summarize(catalog[task.slot.id-1],results),bot:task.slot.bot,power:task.slot.power};
      task.slot.report=report;
      console.log(`Map ${task.slot.id} ${task.slot.bot}/${task.slot.power}: win ${(report.winRate*100).toFixed(1)}%, 3★ ${(report.starRates[3]*100).toFixed(1)}%`);
    } else if(task.kind==='retry') {
      const map=catalog[task.slot.id-1];
      const chunks=[...task.slot.chunks.entries()].sort((a,b)=>a[0]-b[0]).map(([,value])=>value.chunk);
      const retry=finalizeRetries(map,options.retryCount,mergeRetryChunks(chunks));
      task.slot.retry=retry;
      console.log(`Map ${task.slot.id} retry: ${retry.completed}/${retry.samples} completed, average ${retry.averageAttempts?.toFixed(2)??'—'} attempts`);
    } else {
      const rates=[0,.1,.2,.3].map((assist,i)=>({assist,samples:options.assistCount,wins:[...task.slot.chunks.values()].reduce((sum,v)=>sum+v.results[i].wins,0)})).map(r=>({...r,winRate:r.wins/r.samples}));
      const failures=[];
      if(rates[3].winRate-rates[0].winRate<.05-1e-12)failures.push(`Map ${task.slot.id}: assist 30% tăng win dưới 5 điểm phần trăm.`);
      for(let i=1;i<rates.length;i++)if(rates[i].winRate<rates[i-1].winRate-.02-1e-12)failures.push(`Map ${task.slot.id}: assist không tăng đều trong dung sai 2 điểm phần trăm.`);
      task.slot.report={id:task.slot.id,rates,passed:!failures.length,failures};
      console.log(`Map ${task.slot.id} paired assist: ${rates.map(r=>(r.winRate*100).toFixed(1)+'%').join(' / ')}`);
    }
  };
  const pool=options.jobs>1&&tasks.length>1?createWorkerPool(Math.min(options.jobs,tasks.length),{config:snapshot.config,maps:snapshot.maps}):null;
  let error=null;
  try {
    const settled=await Promise.allSettled(tasks.map(task=>(pool?pool.run(task):Promise.resolve().then(()=>executeTask(task))).then(payload=>collect(task,payload))));
    for(const result of settled)if(result.status==='rejected')throw result.reason;
  } catch(cause) { error=cause?.message??String(cause); }
  finally { if(pool)await pool.close(); }
  const reports=reportSlots.filter(slot=>slot.report).map(slot=>slot.report);
  const retries=retrySlots.filter(slot=>slot.retry).map(slot=>slot.retry);
  const finishedAt=new Date(),checks=evaluateChecks(reports,options.count,options.check);
  const assistReports=assistSlots.filter(s=>s.report).map(s=>s.report);
  checks.failures.push(...assistReports.flatMap(r=>r.failures));
  if(checks.enabled&&checks.failures.length)checks.status='failed';
  const report={contentVersion:content.version,configHash:snapshot.hashes.config,engineHash:createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../client/src/game/BoardEngine.ts'))).digest('hex'),
    botModel:BOT_MODEL,
    source:{kind:snapshot.source,project:snapshot.project,version:snapshot.version,syncedAt:snapshot.syncedAt,checkedAt:snapshot.checkedAt,
      cacheFile:snapshot.cacheFile?path.relative(process.cwd(),snapshot.cacheFile):null,hashes:snapshot.hashes},
    suite:options.suite,seeds:options.count,targets,reports,retries,assistReports,checks,
    run:{id:runId,startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),durationSeconds:(finishedAt-startedAt)/1000,
      command:['node','tools/simulate_maps.cjs',...args].map(s=>/^[\w./,=-]+$/.test(s)?s:JSON.stringify(s)).join(' '),
      maps:options.ids,bots:options.bots,powers:options.powers,retrySeeds:options.retryCount,jobs:options.jobs,status:error?'error':'completed',error},
    maps:options.ids.map(id=>{const m=catalog[id-1];return {id:m.id,name:m.name,difficulty:m.difficulty,moves:m.moves,objectives:m.objectives,
      starThresholds:m.starThresholds,spawnPolicy:m.spawnPolicy,retryAssistPolicy:m.retryAssistPolicy,tutorial:!!m.tutorial};})};
  for(const [filename,body]of[[jsonPath,JSON.stringify(report,null,2)+'\n'],[htmlPath,renderBalanceReport(report)]]) {
    fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,body);
  }
  console.log(`HTML report: ${path.relative(process.cwd(),htmlPath)}`);
  console.log(`JSON report: ${path.relative(process.cwd(),jsonPath)}`);
  if(error)console.error(error);
  if(options.check&&checks.failures.length)console.error(checks.failures.join('\n'));
  if(error||options.check&&checks.failures.length)process.exitCode=1;
  return report;
}

if(require.main===module) {
  main(process.argv.slice(2)).catch(error=>{ console.error(error.message);process.exitCode=1; });
}
module.exports={BOT_MODEL,play,summarize,seedFor,targets,catalog,simulateRetries,evaluateChecks,parseOptions,main,installSnapshot,executeTask,simulateRetryChunk,mergeRetryChunks,finalizeRetries,spawnAssistMechanisms,chooseSwap,selectRankedMove};
