import { BoardEngine } from '../BoardEngine';
import { installContent, mapToLevel, validateMap, versionMap } from '../domain';
const config = require('../../../../content/game-config.json');
const sources = require('../../../../content/game-maps.json');
const v5 = require('../../../../content/balance/fixtures/v5.json');
const legacy = require('../../../../content/game-content.json');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function engine(seed = 24680, assist = 0) {
    const content = installContent(config), map = clone(sources[0]);
    map.moves = 14;
    map.objectives = [{ id: 'main', type: 'Battle', target: 100000, enemy: { id: 'test', name: 'Test', artKey: 'beast' } }];
    return new BoardEngine(mapToLevel(validateMap(map, content), seed, assist, content));
}
afterEach(() => installContent(legacy));
it('decays seeded probability, applies spawn assistance, and never seeds after wave 3', () => {
    const b = engine(123, .3) as any;
    b.level.mapDefinition.spawnPolicy.comboChance = .1;
    expect([1,2,3,4,5].map(n => b.refillChance(n))).toEqual([.4,.2,.1,0,0]);
});
it('requires finite setupChance for v6 while retaining v5 maps without it', () => {
    const c = installContent(config);
    for (const value of [undefined, -.1, 1.1, NaN, Infinity]) {
        const map = clone(sources[0]); map.spawnPolicy.setupChance = value;
        expect(() => validateMap(map, c)).toThrow('INVALID_MAP');
    }
    expect(() => validateMap(v5.maps[0], installContent(v5.config))).not.toThrow();
});
it('requires both Collect objectives and restores their independent progress', () => {
    const c=installContent(config),map=validateMap(sources[2],c);
    const b=new BoardEngine(mapToLevel(map,1234,0,c));
    b.objectiveProgress={main:30,secondary:29};expect(b.won).toBe(false);
    const restored=new BoardEngine(b.levelDefinition,b.snapshot());
    expect(restored.objectiveProgress).toEqual({main:30,secondary:29});
    const secondary=map.objectives[1];
    if(secondary.type==='Collect')(restored as any).advance('Collect',1,secondary.tileKind);
    expect(restored.won).toBe(true);expect(restored.objectiveProgress.main).toBe(30);
});
it('leaves the board and RNG alone when setup is disabled, and bounds failed setup search', () => {
    const b=engine(),internal=b as any;
    internal.level.mapDefinition.spawnPolicy.setupChance=0;
    const before=b.snapshot();internal.prepareCombo(new Set([28,29,30,31]));
    expect(b.snapshot()).toEqual(before);
    internal.level.mapDefinition.spawnPolicy.setupChance=1;
    const tiles=b.snapshot().tiles;let attempts=0;
    internal.findGroups=()=>{attempts++;return [[0,1,2]];};
    internal.prepareCombo(new Set(Array.from({length:49},(_,i)=>i)));
    expect(attempts).toBeLessThanOrEqual(64);
    expect(b.snapshot().tiles).toEqual(tiles);expect(b.actionMetrics.setupFallbacks).toBe(1);
});
it('caps swaps and skills at four waves and shows the final settled snapshot', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const b = engine(seed, .3), internal = b as any;
        internal.level.mapDefinition.spawnPolicy.comboChance = 1;
        for (let turn = 0; turn < 5; turn++) {
            expect(b.trySwap(...b.legalMoves()[0])).toBe(true);
            expect(b.animation!.steps.length).toBeLessThanOrEqual(4);
            expect(internal.findGroups()).toEqual([]);
            expect(b.legalMoves().length).toBeGreaterThan(0);
            expect(b.animation!.steps.at(-1)!.after).toEqual(b.snapshot());
        }
        internal.swordQi = 100;
        expect(b.trySkill('nhat-kiem', [{ x: 0, y: 3 }])).toBe(true);
        expect(b.animation!.steps.length).toBeLessThanOrEqual(4);
        expect(internal.findGroups()).toEqual([]);
    }
});
it('stabilizes a charged match without granting rewards or dropping charges/barriers', () => {
    const b = engine(), internal = b as any;
    internal.tiles = Array.from({ length: 49 }, (_,i) => ({ kind: (i%7+2*Math.floor(i/7))%4+1, chargeTier: 0, locked: false }));
    for (const i of [21,22,23]) internal.tiles[i] = { kind: 1, chargeTier: 5, locked: false };
    internal.tiles[0] = { kind: 5, chargeTier: 0, locked: false };
    internal.tiles[48] = { kind: 2, chargeTier: 0, locked: true };
    const before = b.snapshot();
    internal.stabilize(new Set());
    const after = b.snapshot();
    expect(internal.findGroups()).toEqual([]);
    expect(b.legalMoves().length).toBeGreaterThan(0);
    expect(after.tiles.filter(t => t?.chargeTier).map(t => [t!.kind,t!.chargeTier,t!.locked])).toEqual([[1,5,false],[1,5,false],[1,5,false]]);
    expect(after.tiles[0]).toEqual(before.tiles[0]); expect(after.tiles[48]).toEqual(before.tiles[48]);
    for (const key of ['score','swordQi','moves','objectiveProgress'] as const) expect(after[key]).toEqual(before[key]);
});
it('repairs the captured NO_PLAYABLE_BOARD seed from a naive four-wave cap', () => {
    const fixture = require('../../../../content/balance/fixtures/cascade-cap-regression.json');
    const c = installContent(config), snapshot = clone(fixture.snapshot);
    snapshot.contentVersion = c.version; snapshot.configVersion = c.version;
    snapshot.level.mapDefinition.contentVersion = 6; snapshot.level.mapDefinition.spawnPolicy.setupChance = .3;
    const map = versionMap(snapshot.level.mapDefinition, c, 6);
    snapshot.level=mapToLevel(map,fixture.seed,0,c);snapshot.mapVersion=6;
    const b = new BoardEngine(mapToLevel(map, fixture.seed, 0, c), snapshot), internal = b as any;
    const before = b.snapshot();
    expect(() => internal.stabilize(new Set())).not.toThrow();
    expect(internal.findGroups()).toEqual([]);
    expect(b.legalMoves().length).toBeGreaterThan(0);
    expect(b.snapshot().tiles.filter(t=>t?.chargeTier)).toEqual(before.tiles.filter(t=>t?.chargeTier));
    expect(b.objectiveProgress).toEqual(before.objectiveProgress);
});
it('prepares a legal four/five match without an immediate match and only edits spawned ordinary cells', () => {
    const b = engine(), internal = b as any;
    internal.level.mapDefinition.spawnPolicy.setupChance = 1;
    const before = b.snapshot(), spawned = new Set(Array.from({ length: 21 }, (_,i) => i+28));
    internal.prepareCombo(spawned);
    expect(b.actionMetrics.setups).toBe(1);
    expect(internal.findGroups()).toEqual([]);
    b.snapshot().tiles.forEach((t,i) => { if (!spawned.has(i)) expect(t).toEqual(before.tiles[i]); });
    const move = b.actionMetrics.setupMove!;
    expect(b.legalMoves()).toContainEqual(move);
    expect(b.trySwap(...move)).toBe(true);
    expect(b.actionMetrics.chargesCreated).toBeGreaterThan(0);
    expect(b.actionMetrics.setupUsed).toBe(1);
});
it('falls back from a five-piece setup to four when the board cannot fit a five-cell line', () => {
    const c=installContent(config),map=clone(sources[0]);
    map.layout=Array.from({length:3},()=>[-1,-1,-1,-1]);map.moves=14;
    map.objectives=[{id:'main',type:'Battle',target:100000,enemy:{id:'test',name:'Test',artKey:'beast'}}];
    map.spawnPolicy.setupChance=1;
    const b=new BoardEngine(mapToLevel(validateMap(map,c),24680,0,c)),internal=b as any;
    const random=internal.nextIndex.bind(internal);
    internal.nextIndex=(max:number)=>max===1000000?900000:random(max);
    internal.prepareCombo(new Set(Array.from({length:12},(_,i)=>i)));
    expect(b.actionMetrics.setups).toBe(1);expect(internal.findGroups()).toEqual([]);
    expect(b.trySwap(...b.actionMetrics.setupMove!)).toBe(true);
    expect(b.actionMetrics.chargesCreated).toBeGreaterThan(0);
});
it('keeps v5 seeded RNG/gameplay golden results and deterministic v6 restoration', () => {
    const c = installContent(v5.config);
    for (const golden of v5.golden) {
        const b = new BoardEngine(mapToLevel(validateMap(v5.maps[golden.id-1], c), 24680, 0, c));
        for (let turn=0;turn<3&&!b.won&&!b.lost;turn++) b.trySwap(...b.legalMoves()[0]);
        const s=b.snapshot();
        expect({ id: golden.id, randomState:s.randomState,tiles:s.tiles,progress:s.objectiveProgress,moves:s.moves }).toEqual(golden);
    }
    const a = engine(9981,.2);a.trySwap(...a.legalMoves()[0]);
    const restored = new BoardEngine(a.levelDefinition,a.snapshot()),move=a.legalMoves()[0];
    a.trySwap(...move);restored.trySwap(...move);
    expect(restored.snapshot()).toEqual(a.snapshot());
});
