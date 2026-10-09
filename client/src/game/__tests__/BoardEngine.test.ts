import { BoardEngine } from '../BoardEngine';
import { getLevel } from '../levels';
import { TileKind, GoalKind, type BoardSnapshot, type Tile } from '../types';
import { SKILLS, SWORDS, type SkillId } from '../domain';
const tile = (kind: number, chargeTier: 0 | 4 | 5 = 0): Tile => ({ kind, chargeTier, locked: false });
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
    it('generates all four types with a legal move in all 40 stages', () => { for (let id = 1; id <= 40; id++) {
        const b = new BoardEngine(getLevel(id));
        expect(new Set(b.snapshot().tiles.filter(t => t!.kind !== TileKind.Rock).map(t => t!.kind)).size).toBe(4);
        expect(b.legalMoves().length).toBeGreaterThan(0);
        expect(b.snapshot().swordQi).toBe(0);
    } });
    it('restores the complete snapshot and deterministic RNG', () => { const a = new BoardEngine(getLevel(5)); const snap = a.snapshot(); const b = new BoardEngine(getLevel(5), snap); expect(b.snapshot()).toEqual(snap); const move = a.legalMoves()[0]; a.trySwap(...move); b.trySwap(...move); expect(a.snapshot()).toEqual(b.snapshot()); expect(a.animation).toEqual(b.animation); });
    it('rejects invalid and non-matching swaps without changes, even with a charged piece', () => { const s = fixture(); s.tiles[0]!.chargeTier = 5; const b = new BoardEngine(getLevel(5), s); const old = b.snapshot(); expect(b.trySwap(0, 0, 2, 0)).toBe(false); expect(b.trySwap(0, 0, 1, 0)).toBe(false); expect(b.snapshot()).toEqual(old); });
    it.each([0, 1, 2, 3])('match 3 type %i has no elemental effect', (kind) => { const b = matching(3, kind); expect(b.animation!.steps[0].effects.every(e => e.kind === 'skill')).toBe(true); expect(b.animation!.steps[0].cleared.length).toBe(3); });
    it.each([0, 1, 2, 3])('match 4 type %i retains a charged piece', (kind) => { const b = matching(4, kind); expect(b.animation!.steps[0].after.tiles.some(t => t!.kind === kind && t!.chargeTier === 4)).toBe(true); expect(b.animation!.steps[0].cleared.length).toBe(3); });
    it.each([0, 1, 2, 3])('match 5 type %i retains tier 5', (kind) => { const b = matching(5, kind); expect(b.animation!.steps[0].after.tiles.some(t => t!.kind === kind && t!.chargeTier === 5)).toBe(true); });
    it.each([[0, 4, 'slash'], [0, 5, 'cross'], [1, 4, 'fire'], [1, 5, 'fire'], [2, 4, 'lightning'], [2, 5, 'lightning'], [3, 4, 'spirit'], [3, 5, 'spirit']] as const)('matched charge %i/%i activates %s', (kind, tier, effect) => { const b = matching(3, kind, tier); expect(b.animation!.steps[0].effects.some(e => e.kind === effect)).toBe(true); expect(b.animation!.steps[0].after.tiles.some(t => t!.chargeTier > 0 && t!.kind === kind)).toBe(false); });
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
    it('casts at most once until a successful paid swap and rejects invalid targets without spending', () => { const s = fixture(); s.loadout.skills = ['ngu-kiem', 'nhat-kiem']; s.condensed = true; const b = new BoardEngine(getLevel(5), s); const old = b.snapshot(); expect(b.trySkill('ngu-kiem', [{ x: 0, y: 0 }, { x: 3, y: 0 }])).toBe(false); expect(b.snapshot()).toEqual(old); expect(b.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(true); expect(b.trySkill('nhat-kiem', [{ x: 0, y: 1 }])).toBe(false); const move = b.legalMoves()[0]; b.trySwap(...move); expect(b.snapshot().skillUsed).toBe(false); });
    it('allows a final free skill at zero moves and then loses or wins', () => { const s = fixture(); s.moves = 0; const b = new BoardEngine(getLevel(5), s); expect(b.lost).toBe(false); b.trySkill('nhat-kiem', [{ x: 0, y: 0 }]); expect(b.lost).toBe(true); expect(b.grantExtraMoves()).toBe(true); expect(b.grantExtraMoves()).toBe(false); });
    it('supports every skill with valid targets', () => { for (const skill of SKILLS) {
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
    it('spirit stays at zero damage under every sword modifier', () => { for (const sword of SWORDS) {
        const s = fixture();
        s.loadout.sword = sword.id;
        s.tiles = Array.from({ length: 49 }, (_, i) => tile(i < 7 ? 3 : (i % 7 + 2 * Math.floor(i / 7)) % 4));
        const b = new BoardEngine(getLevel(5), s);
        b.trySkill('nhat-kiem', [{ x: 0, y: 0 }]);
        expect(b.animation!.steps[0].damage).toBe(0);
    } });
});
