import { BoardEngine } from '../BoardEngine';
import { getLevel } from '../levels';
import { TileKind, GoalKind, type BoardSnapshot, type Tile } from '../types';
import { SKILLS, SWORDS, installContent, mapToLevel, validateMap, type SkillId } from '../domain';
const currentConfig = require('../../../../content/game-config.json');
const currentMaps = require('../../../../content/game-maps.json');
const normalKinds: number[] = currentConfig.normalTileIds;
const rockKind: number = currentConfig.tiles.find((t: { key: string }) => t.key === 'rock').id;
const tile = (kind: number, chargeTier: 0 | 4 | 5 = 0): Tile => ({ kind: kind >= 0 && kind < 4 ? normalKinds[kind] : kind === TileKind.Rock ? rockKind : kind, chargeTier, locked: false });
function fixture(): BoardSnapshot { const s = new BoardEngine(getLevel(5)).snapshot(); s.tiles = Array.from({ length: 49 }, (_, i) => tile((i % 7 + 2 * Math.floor(i / 7)) % 4)); s.level = { ...s.level, objectives: [{ id: 'main', type: 'Battle', target: 100000, enemy: { id: 'test', name: 'Test', artKey: 'beast' } }] }; s.objectiveProgress = { main: 0 }; s.swordQi = 100; s.loadout = { sword: 'thanh-phong', skills: ['nhat-kiem'] }; return s; }
function matching(size: number, kind: TileKind, tier: 0 | 4 | 5 = 0) {
    const s = fixture(), others = [0, 1, 2, 3].filter(k => k !== kind);
    s.tiles = Array.from({ length: 49 }, (_, i) => tile(others[(i % 7 + 2 * Math.floor(i / 7)) % 3]));
    for (let x = 0; x < size; x++)
        s.tiles[3 * 7 + x] = tile(kind);
    s.tiles[3 * 7 + size - 1] = tile(others[0]);
    s.tiles[4 * 7 + size - 1] = tile(kind);
    if (tier)
        s.tiles[3 * 7] = tile(kind, tier);
    const b = new BoardEngine(getLevel(5), s);
    expect(b.trySwap(size - 1, 4, size - 1, 3)).toBe(true);
    return b;
}
describe('board rules v2', () => {
    it('resolves incrementally with identical waves and RNG across all stages', () => {
        for (let id = 1; id <= 40; id++) {
            const sync = new BoardEngine(getLevel(id));
            const live = new BoardEngine(getLevel(id), sync.snapshot());
            for (let turn = 0; turn < 5 && !sync.won && !sync.lost; turn++) {
                const move = sync.legalMoves()[0];
                if (!move) break;
                sync.trySwap(...move);
                const start = live.beginSwap(...move)!;
                expect(start.swappedBoard).toEqual(sync.animation!.swappedBoard);
                expect(live.snapshot()).toEqual(start.swappedBoard);
                expect(live.animation).toBeNull();
                const steps = [];
                let step;
                while ((step = live.nextResolutionStep())) steps.push(step);
                expect(steps).toEqual(sync.animation!.steps);
                expect(live.snapshot()).toEqual(sync.snapshot());
                expect(live.nextResolutionStep()).toBeNull();
            }
        }
    });
    it('begins skills without resolving their effects and keeps rejected actions unchanged', () => {
        const snapshot = fixture();
        const sync = new BoardEngine(snapshot.level, snapshot);
        sync.trySkill('nhat-kiem', [{ x: 0, y: 3 }]);
        const live = new BoardEngine(snapshot.level, snapshot);
        const before = live.snapshot();
        expect(live.beginSwap(0, 0, 2, 0)).toBeNull();
        expect(live.snapshot()).toEqual(before);
        const start = live.beginSkill('nhat-kiem', [{ x: 0, y: 3 }])!;
        expect(live.snapshot()).toEqual(start.swappedBoard);
        expect(live.score).toBe(before.score);
        expect(() => live.beginSkill('nhat-kiem', [{ x: 0, y: 3 }])).toThrow('BOARD_ACTION_IN_PROGRESS');
        const steps = [];
        let step;
        while ((step = live.nextResolutionStep())) steps.push(step);
        expect(steps).toEqual(sync.animation!.steps);
        expect(live.snapshot()).toEqual(sync.snapshot());
    });
    it('generates all four types with a legal move in the 40-stage rule fixture', () => { for (let id = 1; id <= 40; id++) {
        const b = new BoardEngine(getLevel(id));
        expect(new Set(b.snapshot().tiles.filter(t => t!.kind !== rockKind).map(t => t!.kind)).size).toBe(4);
        expect(b.legalMoves().length).toBeGreaterThan(0);
        expect(b.snapshot().swordQi).toBe(0);
    } });
    it('restores the complete snapshot and deterministic RNG', () => { const a = new BoardEngine(getLevel(5)); const snap = a.snapshot(); const b = new BoardEngine(getLevel(5), snap); expect(b.snapshot()).toEqual(snap); const move = a.legalMoves()[0]; a.trySwap(...move); b.trySwap(...move); expect(a.snapshot()).toEqual(b.snapshot()); expect(a.animation).toEqual(b.animation); });
    it('rejects invalid and non-matching swaps without changes, even with a charged piece', () => { const s = fixture(); s.tiles[0]!.chargeTier = 5; const b = new BoardEngine(getLevel(5), s); const old = b.snapshot(); expect(b.trySwap(0, 0, 2, 0)).toBe(false); expect(b.trySwap(0, 0, 1, 0)).toBe(false); expect(b.snapshot()).toEqual(old); });
    it.each([0, 1, 2, 3])('match 3 type %i has no elemental effect', (kind) => { const b = matching(3, kind); expect(b.animation!.steps[0].effects.every(e => e.kind === 'skill')).toBe(true); expect(b.animation!.steps[0].cleared.length).toBe(3); });
    it.each([0, 1, 2, 3])('match 4 type %i retains a charged piece', (kind) => { const b = matching(4, kind); expect(b.animation!.steps[0].after.tiles.some(t => t!.kind === normalKinds[kind] && t!.chargeTier === 4)).toBe(true); expect(b.animation!.steps[0].cleared.length).toBe(3); });
    it.each([0, 1, 2, 3])('match 5 type %i retains tier 5', (kind) => { const b = matching(5, kind); expect(b.animation!.steps[0].after.tiles.some(t => t!.kind === normalKinds[kind] && t!.chargeTier === 5)).toBe(true); });
    it.each([[0, 4, 'slash'], [0, 5, 'cross'], [1, 4, 'fire'], [1, 5, 'fire'], [2, 4, 'lightning'], [2, 5, 'lightning'], [3, 4, 'spirit'], [3, 5, 'spirit']] as const)('matched charge %i/%i activates %s', (kind, tier, effect) => { const b = matching(3, kind, tier); expect(b.animation!.steps[0].effects.some(e => e.kind === effect)).toBe(true); expect(b.animation!.steps[0].after.tiles.some(t => t!.chargeTier > 0 && t!.kind === normalKinds[kind])).toBe(false); });
    it('fire tier 5 has thirteen distinct targets at board center', () => { const s = fixture(); s.tiles[24] = tile(1, 5); const b = new BoardEngine(getLevel(5), s); expect(b.trySkill('nhat-kiem', [{ x: 0, y: 3 }])).toBe(true); const fire = b.animation!.steps[0].effects.find(e => e.kind === 'fire')!; expect(fire.cells).toHaveLength(13); });
    it.each([4, 5] as const)('marks only charged sword activation with tier %s, preserving its target geometry', tier => {
        const s = fixture(); s.tiles[24] = tile(TileKind.Sword, tier);
        const b = new BoardEngine(s.level, s);
        expect(b.trySkill('nhat-kiem', [{ x: 0, y: 3 }])).toBe(true);
        const traces = b.animation!.steps[0].effects;
        expect(traces[0].kind).toBe('slash');
        expect(traces[0].swordChargeTier).toBeUndefined();
        const sword = traces.find(trace => trace.swordChargeTier === tier)!;
        expect(sword).toMatchObject({ kind: tier === 5 ? 'cross' : 'slash', source: 24 });
        const row = [21, 22, 23, 24, 25, 26, 27];
        expect(sword.cells).toEqual(tier === 4 ? row : [...new Set([...row, 3, 10, 17, 24, 31, 38, 45])]);
        expect(traces.filter(trace => trace.swordChargeTier)).toHaveLength(1);
    });
    it('chains sword → fire → lightning in queue order, with unique clears', () => { const s = fixture(); s.tiles[21] = tile(0, 4); s.tiles[24] = tile(1, 4); s.tiles[31] = tile(2, 5); const b = new BoardEngine(getLevel(5), s); b.trySkill('nhat-kiem', [{ x: 0, y: 3 }]); const step = b.animation!.steps[0]; expect(step.effects.slice(1).filter(e => e.source === 21 || e.source === 24 || e.source === 31).map(e => e.kind)).toEqual(['slash', 'fire', 'lightning']); expect(new Set(step.cleared).size).toBe(step.cleared.length); });
    it('activated spirit grants Ngung Khi and never contributes damage', () => { const s = fixture(); s.tiles[21] = tile(3, 5); const b = new BoardEngine(getLevel(5), s); b.trySkill('nhat-kiem', [{ x: 0, y: 3 }]); expect(b.animation!.steps[0].effects.find(e => e.kind === 'spirit')!.damage).toBe(0); expect(b.snapshot().condensed).toBe(true); });
    it.each([4, 5] as const)('retains consumed orb tier %s after an earlier trace removed the source', tier => {
        const s = fixture(); s.tiles[21] = tile(TileKind.SpiritOrb, tier);
        const b = new BoardEngine(s.level, s);
        expect(b.trySkill('nhat-kiem', [{ x: 0, y: 3 }])).toBe(true);
        const step = b.animation!.steps[0];
        expect(step.effects[0].cells).toContain(21);
        expect(step.effects[0].spiritChargeTier).toBeUndefined();
        expect(step.effects.find(trace => trace.kind === 'spirit')).toMatchObject({ source: 21, cells: [], spiritChargeTier: tier, damage: 0 });
        expect(step.after.condensed).toBe(tier === 5);
        expect(matching(4, TileKind.SpiritOrb).animation!.steps[0].effects.every(trace => !trace.spiritChargeTier)).toBe(true);
    });
    it('locked charges are unlocked rather than activated in that wave', () => { const s = fixture(); s.tiles[21] = { ...tile(1, 5), locked: true }; const b = new BoardEngine(getLevel(5), s); b.trySkill('nhat-kiem', [{ x: 0, y: 3 }]); expect(b.animation!.steps[0].effects.some(e => e.kind === 'fire')).toBe(false); });
    it('casts at most once until a successful paid swap, without counting skills as moves', () => { const s = fixture(); s.loadout.skills = ['ngu-kiem', 'nhat-kiem']; s.condensed = true; const b = new BoardEngine(getLevel(5), s); const old = b.snapshot(); expect(b.trySkill('ngu-kiem', [{ x: 0, y: 0 }, { x: 3, y: 0 }])).toBe(false); expect(b.snapshot()).toEqual(old); const movesBeforeSkill=b.movesUsed; expect(b.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(true); expect(b.movesUsed).toBe(movesBeforeSkill); expect(b.trySkill('nhat-kiem', [{ x: 0, y: 1 }])).toBe(false); const move = b.legalMoves()[0]; b.trySwap(...move); expect(b.snapshot().skillUsed).toBe(false); });
    it.each([0, 100])('loses at zero moves with %i qi and rejects skills without spending', swordQi => {
        const s = fixture(); s.moves = 0; s.swordQi = swordQi;
        const b = new BoardEngine(s.level, s), before = b.snapshot();
        expect(b.lost).toBe(true);
        expect(b.availableSkills()).toEqual([]);
        expect(b.trySwap(0, 0, 1, 0)).toBe(false);
        expect(b.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(false);
        expect(b.snapshot()).toEqual(before);
        expect(b.grantExtraMoves()).toBe(true);
        expect(b.moves).toBe(3);
        expect(b.lost).toBe(false);
        expect(b.availableSkills()).toEqual(swordQi ? ['nhat-kiem'] : []);
        expect(b.grantExtraMoves()).toBe(false);
    });
    it('settles the final paid swap and loses even when a skill is still affordable', () => {
        const s = fixture(); s.moves = 1;
        s.tiles[0] = tile(0); s.tiles[1] = tile(0); s.tiles[2] = tile(1); s.tiles[9] = tile(0);
        const b = new BoardEngine(s.level, s);
        expect(b.availableSkills()).toEqual(['nhat-kiem']);
        expect(b.trySwap(2, 1, 2, 0)).toBe(true);
        expect(b.moves).toBe(0);
        expect(b.won).toBe(false);
        expect(b.lost).toBe(true);
        expect(b.swordQi).toBeGreaterThanOrEqual(b.cost('nhat-kiem'));
        expect(b.animation!.finalBoard).toEqual(b.snapshot());
        expect(b.snapshot().tiles.every(Boolean)).toBe(true);
    });
    it('supports every active skill with valid targets', () => { for (const skill of SKILLS.filter(skill => skill.kind !== 'passive')) {
        const s = fixture();
        s.loadout.skills = [skill.id];
        if (skill.id === 'lien-kiem') {
            s.tiles[0]!.chargeTier = 4;
            s.tiles[1]!.chargeTier = 5;
        }
        if (skill.id === 'pha-chuong')
            s.tiles[0] = tile(4);
        const b = new BoardEngine(getLevel(5), s);
        const targets = skill.id === 'ngu-kiem' || skill.id === 'lien-kiem' ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : skill.id === 'dan-loi' ? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }] : [{ x: 0, y: 0 }];
        expect(b.trySkill(skill.id, targets)).toBe(true);
        expect(b.snapshot().skillUsed).toBe(true);
        expect(b.moves).toBe(s.moves);
    } });
    it('does not allow passive skills to be cast', () => { for (const skill of SKILLS.filter(skill => skill.kind === 'passive')) {
        const s = fixture(); s.loadout.skills = [skill.id]; const b = new BoardEngine(getLevel(5), s);
        expect(b.trySkill(skill.id, [{ x: 0, y: 0 }])).toBe(false);
    } });
    it('spirit has no base damage and only receives explicit flat weapon bonuses', () => { for (const sword of SWORDS) {
        const s = fixture();
        s.loadout.sword = sword.id;
        s.tiles = Array.from({ length: 49 }, (_, i) => tile(i < 7 ? 3 : (i % 7 + 2 * Math.floor(i / 7)) % 4));
        const b = new BoardEngine(getLevel(5), s);
        b.trySkill('nhat-kiem', [{ x: 0, y: 0 }]);
        expect(b.animation!.steps[0].damage).toBe((currentConfig.swords.find((entry: { id: string }) => entry.id === sword.id)?.flatDamage ?? 0) * 7);
    } });
    describe('combo seeding', () => {
        const modernContent = currentConfig;
        const modern = (id = 1, chance = 1) => {
            const content = installContent(JSON.parse(JSON.stringify(modernContent)));
            const raw = JSON.parse(JSON.stringify(currentMaps[Math.min(id - 1, currentMaps.length - 1)]));
            delete raw.tutorial;
            raw.objectives = [{ id: 'main', type: 'Battle', target: 100000, enemy: { id: 'test', name: 'Test', artKey: 'beast' } }];
            raw.spawnPolicy.comboChance = chance;
            return new BoardEngine(mapToLevel(validateMap(raw, content), 24680, 0, content));
        };
        const carve = (engine: BoardEngine, rows: number) => {
            const internals = engine as any, board = engine.snapshot().level.board;
            for (let y = board.height - rows; y < board.height; y++) for (let x = 0; x < board.width; x++) {
                const index = y * board.width + x;
                if (board.activeCells[index]) internals.tiles[index] = null;
            }
            return internals;
        };
        afterEach(() => installContent(currentConfig));
        it('seeds a combo among spawned tiles when comboChance is 1', () => {
            const engine = modern(1, 1), internals = carve(engine, 3);
            const falls = internals.refill(1);
            const spawned = new Set(falls.filter((f: any) => f.spawned).map((f: any) => f.index));
            const groups = internals.findGroups();
            expect(spawned.size).toBeGreaterThanOrEqual(3);
            expect(groups.length).toBeGreaterThan(0);
            expect(groups.every((g: number[]) => g.some(i => spawned.has(i)))).toBe(true);
        });
        it('does not seed combos when comboChance is 0', () => {
            const engine = modern(1, 0), internals = carve(engine, 3);
            let seeded = 0;
            internals.seededRefill = () => { seeded++; return null; };
            internals.refill(1);
            expect(seeded).toBe(0);
        });
        it('creates a seeded run long enough for a tier-5 piece when the roll favors size 5', () => {
            const engine = modern(1, 1), internals = carve(engine, 3);
            internals.comboLength = () => 5;
            const falls = internals.refill(1);
            const spawned = new Set(falls.filter((f: any) => f.spawned).map((f: any) => f.index));
            expect(internals.findGroups().some((g: number[]) => g.length >= 5 && g.some(i => spawned.has(i)))).toBe(true);
        });
        it('boosts the seeding chance on chains and stops at the injected chain limit', () => {
            const internals = modern(1, .4) as any;
            expect(internals.refillChance(1)).toBeCloseTo(.4);
            expect(internals.refillChance(2)).toBeCloseTo(.2);
            expect(internals.refillChance(3)).toBeCloseTo(.1);
            expect(internals.refillChance(4)).toBe(0);
        });
        it('caps injected cascades at the chain limit and settles the board', () => {
            const engine = modern(1, 1);
            expect(engine.trySwap(...engine.legalMoves()[0])).toBe(true);
            expect(engine.animation!.steps.length).toBeLessThanOrEqual(4);
            expect(engine.snapshot().tiles.some(t => t === null)).toBe(false);
        });
    });
});
