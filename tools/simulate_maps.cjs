const fs = require('node:fs');
const path = require('node:path');
const { BoardEngine, installContent, validateMap, mapToLevel, mapStars, tileId, assistForFailures } = require('./game-runtime.cjs');
const {createHash}=require('node:crypto');
const content = installContent(require('../content/game-config.json'));
const catalog = require('../content/game-maps.json').map(m => validateMap(m, content));
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
  if(!moves.length)return null;
  if(bot==='basic' && random()<.65)return moves[Math.floor(random()*moves.length)];
  const ranked=moves.map(move=>{
    const {tiles,cells}=matched(snapshot,move);
    return {move,score:clearValue(snapshot,cells,tiles)+(cells.length>=4 ? .8*cells.length : 0)+random()*.25};
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
  return ranked[0].move;
}
function cast(engine,bot,random) {
  if(!engine.availableSkills().includes('nhat-kiem') || bot==='basic'&&random()<.55)return false;
  const snapshot=engine.snapshot(),{width:w,height:h}=snapshot.level.board;
  const rows=Array.from({length:h},(_,y)=>({y,cells:Array.from({length:w},(_,x)=>y*w+x)}));
  rows.sort((a,b)=>clearValue(snapshot,b.cells)-clearValue(snapshot,a.cells));
  const row=rows[0];const x=row.cells.find(i=>snapshot.level.board.activeCells[i])%w;
  return engine.trySkill('nhat-kiem',[{x,y:row.y}]);
}
function play(map, seed, bot='normal', power='expected', assist=0) {
  const random=rng(seed^0x5a17c9e3), totalExp=power==='minimum'?0:power==='strong'?(map.id-1)*100+1500:(map.id-1)*60;
  const level=mapToLevel(map,seed,assist,content);
  const engine=new BoardEngine(level,null,{loadout:{sword:'thanh-phong',skills:['nhat-kiem']},totalExp});
  let waves=0,maxChain=0;
  for(let action=0;action<map.moves*3+10&&!engine.won&&!engine.lost;action++) {
    if(cast(engine,bot,random))continue;
    const move=chooseSwap(engine,bot,random);
    if(!move||!engine.trySwap(...move))break;
    waves+=engine.animation?.steps.length??0;
    maxChain=Math.max(maxChain,...(engine.animation?.steps.map(s=>s.chain)??[0]));
  }
  const snapshot=engine.snapshot();
  return {won:engine.won,stars:engine.won?mapStars(map,engine.movesUsed):0,movesUsed:engine.movesUsed,waves,maxChain,reshuffles:snapshot.reshuffles??0,
    progress:map.objectives.reduce((sum,o)=>sum+snapshot.objectiveProgress[o.id]/o.target,0)/map.objectives.length};
}
function summarize(map, results) {
  const won=results.filter(r=>r.won),histogram=[0,0,0,0];results.forEach(r=>histogram[r.stars]++);
  return {mapHash:createHash('sha256').update(JSON.stringify(map)).digest('hex'),id:map.id,difficulty:map.difficulty,samples:results.length,winRate:won.length/results.length,starRates:histogram.map(n=>n/results.length),
    movesHistogram:Object.fromEntries(Array.from({length:map.moves+1},(_,n)=>[n,won.filter(r=>r.movesUsed===n).length]).filter(([,n])=>n)),
    averageMoves:won.length?won.reduce((s,r)=>s+r.movesUsed,0)/won.length:null,averageProgress:results.reduce((s,r)=>s+r.progress,0)/results.length,
    averageReshuffles:results.reduce((s,r)=>s+r.reshuffles,0)/results.length,averageWaves:results.reduce((s,r)=>s+r.waves,0)/results.length,maxChain:Math.max(...results.map(r=>r.maxChain))};
}
const targets={easy:{win:[.85,.95],three:[.35,.60]},medium:{win:[.50,.70],three:[.15,.30]},hard:{win:[.15,.30],three:[.03,.10]},'very-hard':{win:[.05,.15],three:[.01,.05]}};
if(require.main===module) {
  const args=process.argv.slice(2),option=(key,def)=>{const i=args.indexOf(key);return i<0?def:args[i+1];};
  const count=Number(option('--seeds',100)),suite=option('--suite','validation'),bots=option('--bots','basic,normal,strategic').split(','),powers=option('--powers','expected').split(',');
  const ids=option('--maps','1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
  const reports=[];
  for(const id of ids)for(const bot of bots)for(const power of powers) {
    const map=catalog[id-1],results=Array.from({length:count},(_,i)=>play(map,seedFor(i,suite),bot,power));
    const report={...summarize(map,results),bot,power};reports.push(report);
    console.log(`Map ${id} ${bot}/${power}: win ${(report.winRate*100).toFixed(1)}%, 3★ ${(report.starRates[3]*100).toFixed(1)}%`);
  }
  const retryCount=Number(option('--retry-seeds',0)), retries=[];
  for(const id of ids)if(retryCount) {
    const map=catalog[id-1],attempts=[];let unfinished=0;
    for(let i=0;i<retryCount;i++) {
      let done=false;
      for(let attempt=0;attempt<30;attempt++)if(play(map,seedFor(i*31+attempt,'retry'),'normal','expected',assistForFailures(map,attempt)).won){attempts.push(attempt+1);done=true;break;}
      if(!done)unfinished++;
    }
    retries.push({id,samples:retryCount,unfinished,averageAttempts:attempts.reduce((a,b)=>a+b,0)/(attempts.length||1)});
  }
  const output=option('--output',null);
  const report={contentVersion:content.version,suite,seeds:count,targets,reports,retries};
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  if(args.includes('--check')) {
    const failures=[];
    for(const r of reports.filter(r=>r.bot==='normal'&&r.power==='expected')) {
      const t=targets[r.difficulty],tolerance=count<1000?.12:0;
      if(count>=1000&&r.starRates.slice(1).some(rate=>rate===0))failures.push(`map ${r.id}: an earned star tier was never observed`);
      if(r.winRate<t.win[0]-tolerance||r.winRate>t.win[1]+tolerance||r.starRates[3]<t.three[0]-tolerance||r.starRates[3]>t.three[1]+tolerance)failures.push(`map ${r.id}: outside target bands`);
    }
    for(const r of reports.filter(r=>r.bot==='strategic'&&r.power==='expected')) {
      const basic=reports.find(b=>b.id===r.id&&b.bot==='basic'&&b.power===r.power);
      if(basic && r.winRate+.1<basic.winRate)failures.push(`map ${r.id}: strategic bot underperforms basic`);
    }
    if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
  }
}
module.exports={play,summarize,seedFor,targets,catalog};
