import { BoardEngine } from '../BoardEngine';
import { installContent, mapToLevel, validateMap, versionMap } from '../domain';
const config = require('../../../../content/game-config.json');
const sources = require('../../../../content/game-maps.json');
const legacy = require('../../../../content/game-config.json');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function engine(seed = 24680, assist = 0) {
    const content = installContent(config), map = clone(sources[0]);
    delete map.tutorial;
    map.moves = 14;
    map.objectives = [{ id: 'main', type: 'Battle', target: 100000, enemy: { id: 'test', name: 'Test', artKey: 'beast' } }];
    return new BoardEngine(mapToLevel(validateMap(map, content), seed, assist, content), null, { loadout: { sword: null, skills: ['nhat-kiem'] }, totalExp: 0 });
}
afterEach(() => installContent(legacy));
it('decays seeded probability, applies spawn assistance, and never seeds after wave 3', () => {
    const b = engine(123, .3) as any;
    b.level.mapDefinition.spawnPolicy.comboChance = .1;
    expect([1,2,3,4,5].map(n => b.refillChance(n))).toEqual([.4,.2,.1,0,0]);
});
it('requires finite setupChance on every current map', () => {
    const c = installContent(config);
    for (const value of [undefined, -.1, 1.1, NaN, Infinity]) {
        const map = clone(sources[0]); map.spawnPolicy.setupChance = value;
        expect(() => validateMap(map, c)).toThrow('INVALID_MAP');
    }
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
