const {test}=require('node:test'),assert=require('node:assert/strict');
const game=require('../lib/domain/game'),runs=require('../lib/domain/runs');
const content=game.validateContent(require('../../content/game-config.json'));
const maps=require('../../content/game-maps.json').map(m=>game.validateMap(m,content));
test('all map documents round trip and config wire payload excludes map data',()=>{
 assert.equal(maps.length,content.levelCount);assert.equal(game.contentWire(content).levels,undefined);
 for(const map of maps)assert.deepEqual(game.mapFromDocument(game.mapToDocument(map),content),map);
});
test('the tutorial catalog contains the two ordered lessons with authored moves',()=>{
 assert.equal(maps[0].tutorial.type,'match-three');assert.equal(maps[0].objectives[0].target,3);
 assert.equal(maps[1].tutorial.type,'charged-lightning');assert.equal(maps[1].objectives[0].target,8);
 assert.equal(maps[1].tutorial.steps.length,2);
});
test('profile migration and normalization do not need map definitions',()=>{
 const p=game.profileFromLegacy([{levelId:1,stars:3},{levelId:2,stars:0}],content);
 assert.equal(p.totalExp,130);assert.equal(game.highestUnlocked(p.levels,content),3);
 assert.deepEqual(game.normalizeProfile(p,content),p);assert.deepEqual(content.levels,[]);
});
test('starts count retries, abandoning leaves failure streak intact, and assistance is capped',()=>{
 let stats=runs.emptyMapStats();stats=runs.startedStats(stats);assert.equal(stats.retryCount,0);
 stats.consecutiveFailures=3;stats=runs.abandonedStats(stats);stats=runs.startedStats(stats);
 assert.equal(stats.retryCount,1);assert.equal(stats.abandoned,1);assert.equal(stats.consecutiveFailures,3);
 assert.equal(runs.assistForFailures(maps[0],3),0);assert.equal(runs.assistForFailures(maps[0],100),0);
});
test('server grades results from moves used, retains best stars, and handles final failure after extra moves',()=>{
 const map=maps[0],run={runId:'run_test_0001',seed:1,map,assistReduction:.3,attempt:1,loadout:game.emptyProfile().loadout,totalExp:0};
 const report=runs.parseRunReport({outcome:'won',movesUsed:3,objectiveProgress:{main:map.objectives[0].target},extraMovesUsed:false},map);
 const result=runs.completeRun(run,report,runs.startedStats(runs.emptyMapStats()),game.emptyProfile(),content,content,100);
 assert.equal(result.receipt.stars,3);assert.equal(result.stats.firstWinAt,100);assert.equal(result.stats.consecutiveFailures,0);assert.equal(result.profile.levels[0].stars,3);
 const failed=runs.parseRunReport({outcome:'lost',movesUsed:map.moves+3,objectiveProgress:{main:0},extraMovesUsed:true},map);
 assert.equal(runs.completeRun(run,failed,result.stats,result.profile,content,content,200).stats.consecutiveFailures,1);
 assert.throws(()=>runs.parseRunReport({...failed,movesUsed:map.moves},map));
 assert.throws(()=>runs.parseRunReport({...report,objectiveProgress:{main:0}},map));
 const zero=runs.completeRun(run,{...report,movesUsed:map.moves},result.stats,result.profile,content,content,300);
 assert.equal(zero.receipt.stars,1);assert.equal(zero.profile.levels[0].stars,3);
});
test('server grades strict percentage cutoffs and counts rewarded swaps against the original budget',()=>{
 const base=maps[0],map={...base,moves:10,starThresholds:{mode:'percentage',threeStarBelowPercent:50,twoStarBelowPercent:75}};
 assert.deepEqual([4,5,7,8,10].map(used=>game.mapStars(map,used)),[3,2,2,1,1]);
 assert.equal(game.mapStars({...map,moves:8},9),1);
 const run={runId:'run_percentage_0001',seed:2,map,assistReduction:0,attempt:1,loadout:game.emptyProfile().loadout,totalExp:0};
 const report=runs.parseRunReport({outcome:'won',movesUsed:4,objectiveProgress:{main:map.objectives[0].target},extraMovesUsed:false},map);
 const result=runs.completeRun(run,report,runs.startedStats(runs.emptyMapStats()),game.emptyProfile(),content,content,100);
 assert.equal(result.receipt.stars,3);
 const bonusMap={...map,moves:8},bonusRun={...run,runId:'run_percentage_bonus_0001',map:bonusMap};
 const bonusReport=runs.parseRunReport({outcome:'won',movesUsed:9,objectiveProgress:{main:map.objectives[0].target},extraMovesUsed:true},bonusMap);
 const bonusResult=runs.completeRun(bonusRun,bonusReport,runs.startedStats(runs.emptyMapStats()),game.emptyProfile(),content,content,101);
 assert.equal(bonusResult.receipt.stars,1);
});
test('map revisions remain independent from config revisions and reject classic rules',()=>{
  const map=game.versionMap(maps[0],content,42),config={...content,version:content.version+1};
  assert.equal(game.validateMap(map,config).mapVersion,42);
  assert.equal(game.mapToLevel(map,1,0,config).configVersion,config.version);
  assert.equal(game.mapToLevel(map,1,0,config).contentVersion,config.version);
  const classic={...map,rulesMode:'classic'};
  assert.throws(()=>game.validateMap(classic,config),/INVALID_MAP/);
});
test('reward credits use amounts already paid across revisions without resetting first-win eligibility',()=>{
  const firstMap=game.versionMap(maps[0],content);
  const context={...content,levels:[game.mapToLevel(firstMap,1,0,content)]};
  const profile=game.applyOperation(game.emptyProfile(),{id:'reward_old',kind:'win',levelId:1,stars:2,objectiveProgress:{main:firstMap.objectives.find(o=>o.id==='main').target}},context).profile;
  assert.equal(profile.totalExp,80);
  const nextMap={...firstMap,mapVersion:firstMap.mapVersion+1,baseExp:200};
  const next={...content,version:content.version+1,levels:[game.mapToLevel(nextMap,2,0,content)]};
  const improved=game.applyOperation(profile,{id:'reward_new',kind:'win',levelId:1,stars:3,objectiveProgress:{main:firstMap.objectives.find(o=>o.id==='main').target}},next).profile;
  assert.equal(improved.totalExp,200);assert.equal(improved.coins-profile.coins,35);
  const replay=game.applyOperation(improved,{id:'reward_replay',kind:'win',levelId:1,stars:3,objectiveProgress:{main:firstMap.objectives.find(o=>o.id==='main').target}},next).profile;
  assert.equal(replay.totalExp,200);assert.equal(replay.coins-improved.coins,10);
  assert.deepEqual(game.normalizeProfile(replay,content).rewardCredits,replay.rewardCredits);
});
