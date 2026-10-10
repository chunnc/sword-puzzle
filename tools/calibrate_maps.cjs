// Offline authoring tool. Training seeds never overlap validation seeds.
// Only --apply writes the source catalog; published Firestore versions remain immutable.
const fs=require('node:fs'),path=require('node:path');
const {play,seedFor,summarize,targets}=require('./simulate_maps.cjs');
const source=require('../content/game-maps.json');
const count=Number(process.env.CALIBRATION_SEEDS||150),output=[];
const index=process.argv.indexOf('--maps'),ids=index<0?null:process.argv[index+1].split(',').map(Number);
for(const original of source.slice(0,10).filter(m=>!ids||ids.includes(m.id))) {
  const target=targets[original.difficulty],center=(target.win[0]+target.win[1])/2;
  let best=null;
  const type=original.objectives[0].type;
  const preferred={easy:14,medium:16,hard:18,'very-hard':20}[original.difficulty];
  const pocket=type==='BreakSeals'||type==='BreakRocks';
  for(const moves of pocket ? Array.from({length:19},(_,i)=>i+6) : [preferred,preferred-2,preferred+2]) {
    let low=type==='Collect'?18:type==='Battle'||type==='Boss'?150:4;
    let high=type==='Collect'?250:type==='Battle'||type==='Boss'?4000:type==='BreakSeals'?32:30;
    if(pocket)low=high=original.objectives[0].target;
    while(low<=high) {
      const goal=Math.floor((low+high)/2),map=structuredClone(original);
      map.moves=moves;map.objectives[0].target=goal;
      map.starThresholds={threeStarMaxMovesUsed:1,twoStarMaxMovesUsed:moves-1};
      let results;
      try{results=Array.from({length:count},(_,i)=>play(map,seedFor(i,'training')));}catch(error){console.error(`Skipped invalid map ${map.id} goal ${goal}: ${error.message}`);high=goal-1;continue;}
      const report=summarize(map,results),loss=Math.abs(report.winRate-center)+Math.abs(moves-preferred)*.001;
      if(!best||loss<best.loss)best={map,results,report,loss};
      if(report.winRate>center)low=goal+1;else high=goal-1;
    }
    if(best.loss<.015)break;
  }
  if(!best)throw new Error(`No playable candidate for map ${original.id}`);
  const {map,results}=best,t3=(target.three[0]+target.three[1])/2;
  const rate=n=>results.filter(r=>r.won&&r.movesUsed<=n).length/count;
  let three=1;
  for(let n=2;n<map.moves;n++)if(Math.abs(rate(n)-t3)<Math.abs(rate(three)-t3))three=n;
  const two=Math.min(map.moves,Math.max(three+1,Math.round((three+map.moves)/2)));
  map.starThresholds={threeStarMaxMovesUsed:three,twoStarMaxMovesUsed:two};
  output.push(map);
  console.log(`Map ${map.id}: ${map.moves} moves, target=${map.objectives[0].target}, win=${best.report.winRate.toFixed(3)}, 3star<=${three} (${rate(three).toFixed(3)})`);
}
if(process.argv.includes('--apply'))fs.writeFileSync(path.join(__dirname,'../content/game-maps.json'),JSON.stringify(source.map(m=>output.find(n=>n.id===m.id)??m),null,2)+'\n');
