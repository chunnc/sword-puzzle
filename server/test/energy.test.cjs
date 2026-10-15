const test=require('node:test'),assert=require('node:assert/strict');
const game=require('../lib/domain/game');
const content=game.installContent(require('../../content/game-config.json'));
const runs=require('../lib/domain/runs');

test('energy starts full, recovers every 30 minutes, caps at five, and keeps the running interval on another loss',()=>{
 const start=1_800_000_000_000,full=game.fullEnergy(start);
 const first=game.consumeEnergy(full,start);
 assert.deepEqual(first,{current:4,nextRecoveryAt:start+game.ENERGY_RECOVERY_MS,asOf:start});
 const second=game.consumeEnergy(first,start+5*60_000);
 assert.equal(second.current,3);assert.equal(second.nextRecoveryAt,first.nextRecoveryAt);
 const one=game.advanceEnergy(second,start+game.ENERGY_RECOVERY_MS);
 assert.equal(one.current,4);assert.equal(one.nextRecoveryAt,start+2*game.ENERGY_RECOVERY_MS);
 const fullAgain=game.advanceEnergy(one,start+10*game.ENERGY_RECOVERY_MS);
 assert.deepEqual(fullAgain,{current:5,nextRecoveryAt:null,asOf:start+10*game.ENERGY_RECOVERY_MS});
 assert.deepEqual(game.consumeEnergy(fullAgain,start+11*game.ENERGY_RECOVERY_MS),{
  current:4,nextRecoveryAt:start+11*game.ENERGY_RECOVERY_MS+game.ENERGY_RECOVERY_MS,asOf:start+11*game.ENERGY_RECOVERY_MS
 });
});

test('finishing the same lost run after the immediate charge does not spend another energy',()=>{
 const map=game.mapToLevel(game.validateMap(require('../../content/game-maps.json')[0],content),24680,0,content);
 const now=1_800_000_000_000,profile={...game.emptyProfile(),energy:game.consumeEnergy(game.fullEnergy(now),now)};
 const run={runId:'energy_loss_run_0001',seed:24680,map,assistReduction:0,attempt:1,loadout:profile.loadout,totalExp:0,energyConsumedAt:now};
 const report=runs.parseRunReport({outcome:'lost',movesUsed:map.moves,objectiveProgress:Object.fromEntries(map.objectives.map(o=>[o.id,0])),extraMovesUsed:false},map);
 const result=runs.completeRun(run,report,runs.startedStats(runs.emptyMapStats()),profile,content,content,now+1);
 assert.equal(result.profile.energy.current,4);assert.equal(result.energyConsumedAt,now);
});
