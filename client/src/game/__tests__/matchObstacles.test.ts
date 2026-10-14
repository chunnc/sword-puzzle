import { BoardEngine } from '../BoardEngine';
import { CONTENT, mapToLevel, tileId, validateMap, type SwordId, type TileKey } from '../domain';
import { boardSoundCues } from '../../audio/boardSoundCues';
import type { BoardResolutionStep, BoardSnapshot, Tile } from '../types';

type Tier = 4 | 5;
type Axis = 'horizontal' | 'vertical';
type Obstacle = 'rock' | 'seal';
type Kind = Exclude<TileKey, 'rock'>;
const tile = (kind: number, locked = false): Tile => ({ kind, chargeTier: 0, locked });
const kinds: Kind[] = ['sword', 'fire', 'lightning', 'spirit'];

function fixture(tier: Tier, axis: Axis, obstacle: Obstacle, kind: Kind = 'sword',
    options: { diagonal?: boolean; sword?: SwordId | null } = {}) {
    const matchedKind = tileId(kind, CONTENT);
    const others = CONTENT.normalTileIds.filter(id => id !== matchedKind);
    const line = Array.from({ length: tier }, (_, offset) => axis === 'horizontal' ? 21 + offset : offset * 7 + 3);
    const anchor = line[tier - 1];
    const from = anchor + (axis === 'horizontal' ? 7 : 1);
    const obstacleIndex = axis === 'horizontal'
        ? anchor - 7 + (options.diagonal ? 1 : 0)
        : anchor - 1 + (options.diagonal ? 7 : 0);
    const raw = structuredClone(require('../../../../content/game-maps.json')[0]);
    delete raw.tutorial;
    raw.layout = Array.from({ length: 7 }, () => Array(7).fill(-1));
    raw.layout[Math.floor(obstacleIndex / 7)][obstacleIndex % 7] = obstacle === 'rock' ? tileId('rock', CONTENT) : others[0];
    raw.initialSeals = obstacle === 'seal' ? [{ row: Math.floor(obstacleIndex / 7), column: obstacleIndex % 7 }] : [];
    raw.objectives = [
        { id: 'obstacle', type: obstacle === 'rock' ? 'BreakRocks' : 'BreakSeals', target: 1 },
        { id: 'collect', type: 'Collect', tileKind: matchedKind, target: 30 },
        { id: 'enemy', type: 'Battle', target: 100000, enemy: { id: 'test', name: 'Test', artKey: 'beast' } },
    ];
    raw.spawnPolicy.comboChance = raw.spawnPolicy.setupChance = 0;
    const level = mapToLevel(validateMap(raw, CONTENT), 12345, 0, CONTENT);
    const snapshot = new BoardEngine(level, null, { loadout: { sword: options.sword ?? null, skills: [] }, totalExp: 0 }).snapshot();
    snapshot.tiles = Array.from({ length: 49 }, (_, index) => tile(others[(index % 7 + 2 * Math.floor(index / 7)) % others.length]));
    for (const index of line) snapshot.tiles[index] = tile(matchedKind);
    snapshot.tiles[anchor] = tile(others[0]);
    snapshot.tiles[from] = tile(matchedKind);
    snapshot.tiles[obstacleIndex] = tile(obstacle === 'rock' ? tileId('rock', CONTENT) : others[0], obstacle === 'seal');
    const swap = [from % 7, Math.floor(from / 7), anchor % 7, Math.floor(anchor / 7)] as const;
    return { snapshot, swap, line, anchor, obstacleIndex, matchedKind, others };
}

function resolveFirst(test: ReturnType<typeof fixture>) {
    const engine = new BoardEngine(test.snapshot.level, test.snapshot);
    expect(engine.beginSwap(...test.swap)).not.toBeNull();
    return { engine, step: engine.nextResolutionStep()! };
}

function destination(step: BoardResolutionStep, index: number) {
    return step.falls.find(fall => !fall.spawned && fall.fromY === Math.floor(index / 7) && fall.index % 7 === index % 7)?.index ?? index;
}

function expectBroken(step: BoardResolutionStep, obstacle: Obstacle, index: number) {
    const match = step.effects.find(effect => effect.origin === 'match')!;
    expect(match.objectiveProgressAfter!.obstacle).toBe(1);
    expect(step.after.objectiveProgress.obstacle).toBe(1);
    expect(step.changed).toContain(index);
    expect(step.cleared).not.toContain(index);
    expect(match.brokenRocks).toEqual(obstacle === 'rock' ? [index] : []);
    const after = step.after.tiles[destination(step, index)];
    if (obstacle === 'rock') expect(after?.kind).not.toBe(tileId('rock', CONTENT));
    else expect(after).toEqual({ ...step.before.tiles[index], locked: false });
}

const cases = kinds.flatMap(kind => ([4, 5] as const).flatMap(tier =>
    (['horizontal', 'vertical'] as const).flatMap(axis =>
        (['rock', 'seal'] as const).map(obstacle => ({ kind, tier, axis, obstacle })))));

it.each(cases)('breaks $obstacle only beside retained $kind tier $tier ($axis)', ({ kind, tier, axis, obstacle }) => {
    const test = fixture(tier, axis, obstacle, kind);
    const { engine, step } = resolveFirst(test);
    expectBroken(step, obstacle, test.obstacleIndex);
    expect(step.cleared).toHaveLength(tier - 1);
    expect(step.cleared).not.toContain(test.anchor);
    expect(step.after.tiles[destination(step, test.anchor)]).toEqual({ kind: test.matchedKind, chargeTier: tier, locked: false });
    expect(engine.actionMetrics).toMatchObject({ chargesCreated: 1, chargesActivated: 0 });
    expect(step.effects).toHaveLength(1);
    const definition = CONTENT.tiles.find(def => def.id === test.matchedKind)!;
    expect(step.effects[0]).toMatchObject({ origin: 'match', damage: definition.damage * (tier - 1), qi: definition.qi * (tier - 1) });
    expect(step.after.objectiveProgress.collect).toBe(tier - 1);
    expect(step.after.score - step.before.score).toBe(10 * (tier - 1));
    expect(boardSoundCues(step).map(cue => cue.id)).toEqual(obstacle === 'rock' ? ['rock_break', 'match_spirit'] : ['match_spirit']);
});

const obstacleCases = ([4, 5] as const).flatMap(tier =>
    (['rock', 'seal'] as const).map(obstacle => ({ tier, obstacle })));

it.each(obstacleCases)('counts shared $obstacle once when creating tier $tier with Phá Quân', ({ tier, obstacle }) => {
    const test = fixture(tier, 'horizontal', obstacle, 'sword', { sword: 'pha-quan' });
    const { step } = resolveFirst(test);
    expectBroken(step, obstacle, test.obstacleIndex);
    expect(step.changed.filter(index => index === test.obstacleIndex)).toHaveLength(1);
});

it.each(obstacleCases.flatMap(test => [false, true].map(phaQuan => ({ ...test, phaQuan }))))(
    'handles diagonal $obstacle at tier $tier only with Phá Quân (equipped=$phaQuan)', ({ tier, obstacle, phaQuan }) => {
        const test = fixture(tier, 'horizontal', obstacle, 'sword', { diagonal: true, sword: phaQuan ? 'pha-quan' : null });
        const { step } = resolveFirst(test);
        if (phaQuan) expectBroken(step, obstacle, test.obstacleIndex);
        else {
            expect(step.after.objectiveProgress.obstacle).toBe(0);
            expect(step.after.tiles[test.obstacleIndex]).toEqual(test.snapshot.tiles[test.obstacleIndex]);
            expect(step.changed).not.toContain(test.obstacleIndex);
            expect(step.effects[0].brokenRocks).toEqual([]);
        }
    });

it.each([4, 5] as const)('retains a matched cell unsealed by the tier %s anchor earlier in the same wave', tier => {
    const test = fixture(tier, 'horizontal', 'seal');
    test.snapshot.tiles[test.obstacleIndex]!.locked = false;
    for (const index of test.line) test.snapshot.tiles[index] = tile(test.matchedKind);
    const anchor = test.line[0], sealed = test.line[1];
    test.snapshot.tiles[anchor] = tile(test.others[0]);
    test.snapshot.tiles[anchor + 7] = tile(test.matchedKind);
    test.snapshot.tiles[sealed]!.locked = true;
    const engine = new BoardEngine(test.snapshot.level, test.snapshot);
    expect(engine.beginSwap(0, 4, 0, 3)).not.toBeNull();
    const step = engine.nextResolutionStep()!;
    expectBroken(step, 'seal', sealed);
    expect(step.cleared).not.toContain(anchor);
    expect(step.cleared).toHaveLength(tier - 2);
    expect(step.after.tiles[destination(step, anchor)]?.chargeTier).toBe(tier);
    expect(step.after.objectiveProgress.collect).toBe(tier - 2);
});

it.each(obstacleCases)('breaks $obstacle next to a retained tier $tier in a cascade', ({ tier, obstacle }) => {
    const test = fixture(tier, 'horizontal', obstacle);
    const cascade = test.snapshot.tiles.map(value => value ? { ...value } : null);
    cascade[test.obstacleIndex] = tile(test.others[0]);
    cascade[14] = tile(obstacle === 'rock' ? tileId('rock', CONTENT) : test.others[0], obstacle === 'seal');
    for (const index of test.line) cascade[index] = tile(test.matchedKind);
    const initial = test.snapshot.tiles.map((_, index) => tile(test.others[(index % 7 + 2 * Math.floor(index / 7)) % test.others.length]));
    initial[14] = { ...cascade[14]! };
    initial[0] = initial[1] = initial[9] = tile(test.matchedKind);
    initial[2] = tile(test.others[0]);
    const snapshot: BoardSnapshot = { ...test.snapshot, tiles: initial };
    const engine = new BoardEngine(snapshot.level, snapshot);
    // Supply a known next match at the refill boundary; the resolver itself is real.
    jest.spyOn(engine as any, 'refill').mockImplementationOnce(() => {
        (engine as any).tiles = cascade;
        return [];
    });
    expect(engine.beginSwap(2, 1, 2, 0)).not.toBeNull();
    expect(engine.nextResolutionStep()!.chain).toBe(1);
    const step = engine.nextResolutionStep()!;
    expect(step.chain).toBe(2);
    expectBroken(step, obstacle, 14);
    expect(step.cleared).not.toContain(test.line[0]);
    expect(step.after.tiles[destination(step, test.line[0])]?.chargeTier).toBe(tier);
});

it.each(obstacleCases)('keeps synchronous and incremental resolution identical for tier $tier beside $obstacle', ({ tier, obstacle }) => {
    const test = fixture(tier, 'horizontal', obstacle);
    const sync = new BoardEngine(test.snapshot.level, test.snapshot);
    const live = new BoardEngine(test.snapshot.level, test.snapshot);
    expect(sync.trySwap(...test.swap)).toBe(true);
    expect(live.beginSwap(...test.swap)).not.toBeNull();
    const steps: BoardResolutionStep[] = [];
    let step: BoardResolutionStep | null;
    while ((step = live.nextResolutionStep())) steps.push(step);
    expect(steps).toEqual(sync.animation!.steps);
    expect(live.snapshot()).toEqual(sync.snapshot());
});
