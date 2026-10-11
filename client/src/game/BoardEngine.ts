import { emptyProfile, realmForExp, skillCost, requireContent, getContentVersion, tileId, validateMap, type TileKey, type GameContent, type SkillId } from './domain';
import { BoardActionAnimation, BoardActionStart, BoardResolutionStep, BoardAnimationEffect, BoardAnimationFall, BoardSnapshot, CellPosition, GoalKind, LevelDefinition, Loadout, Tile } from './types';
export function newId(): string { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 13)}_${Math.random().toString(36).slice(2, 13)}`; }
const plain = (kind: number): Tile => ({ kind, chargeTier: 0, locked: false });
const copy = (tile: Tile): Tile => ({ ...tile });
const MAX_CHAIN = 20;
const MAX_COMBO_CHAIN = 6;
const COMBO_SIZES: Record<string, [number, number, number]> = {
    easy: [.30, .40, .30],
    medium: [.45, .35, .20],
    hard: [.60, .28, .12],
    'very-hard': [.70, .23, .07]
};
type RefillPosition = { index: number; fromY: number; spawned: boolean };
export interface BoardActionMetrics {
    seeded: number; setups: number; setupAttempts: number; setupFallbacks: number;
    setupMove?: [number, number, number, number]; setupUsed: number;
    chargesCreated: number; chargesActivated: number; settlements: number;
}
const actionMetrics = (): BoardActionMetrics => ({ seeded: 0, setups: 0, setupAttempts: 0, setupFallbacks: 0, setupUsed: 0, chargesCreated: 0, chargesActivated: 0, settlements: 0 });
export class BoardEngine {
    private tiles: (Tile | null)[] = [];
    private randomState: number;
    private drops = 0;
    private directorPressure = 1;
    private reshuffles = 0;
    private kinds!: Record<TileKey, number>;
    private runId: string;
    private loadout: Loadout;
    private damageScale: number;
    private totalExpAtStart: number | undefined;
    private lastAnimation: BoardActionAnimation | null = null;
    private metrics = actionMetrics();
    private get modernCombos(): boolean { const map = this.level.mapDefinition; return !!map && !map.legacy && (map.rulesMode ? map.rulesMode === 'modern' : this.content.version >= 6); }
    get actionMetrics(): BoardActionMetrics { return { ...this.metrics, ...(this.metrics.setupMove ? { setupMove: [...this.metrics.setupMove] as [number, number, number, number] } : {}) }; }
    private resolution: Generator<BoardResolutionStep, void> | null = null;
    moves: number;
    objectiveProgress: Record<string, number>;
    private readonly content: GameContent;
    private kind(key: TileKey): number { return this.kinds[key]; }
    get movesUsed(): number { return this.level.moves + (this.extraMovesUsed ? 3 : 0) - this.moves; }
    private get width() { return this.level.board.width; }
    private get height() { return this.level.board.height; }
    private indexOf = (p: CellPosition) => p.y * this.width + p.x;
    swordQi = 0;
    score = 0;
    extraMovesUsed = false;
    condensed = false;
    skillUsed = false;
    constructor(private readonly level: LevelDefinition, restore?: BoardSnapshot | null, context?: {
        loadout: Loadout;
        totalExp: number;
    }) {
        this.level = restore?.level ?? level;
        level = this.level;
        const configVersion = restore ? restore.configVersion ?? restore.contentVersion : level.configVersion ?? level.contentVersion;
        this.content = configVersion ? getContentVersion(configVersion) : requireContent();
        this.kinds = Object.fromEntries((['sword','fire','lightning','spirit','rock'] as TileKey[]).map(key => [key, tileId(key, this.content)])) as Record<TileKey, number>;
        this.randomState = level.seed >>> 0;
        this.moves = level.moves;
        this.objectiveProgress = Object.fromEntries(level.objectives.map(o => [o.id, 0]));
        this.runId = newId();
        this.loadout = context ? { ...context.loadout, skills: [...context.loadout.skills] } : emptyProfile().loadout;
        this.damageScale = realmForExp(context?.totalExp ?? 0, this.content).damageScale;
        this.totalExpAtStart = restore ? restore.totalExpAtStart : context?.totalExp ?? 0;
        if (restore && restore.contentVersion === this.content.version && restore.levelId === level.id && restore.tiles.length === this.width * this.height) {
            this.tiles = restore.tiles.map(t => t ? copy(t) : null);
            this.moves = restore.moves;
            this.objectiveProgress = { ...restore.objectiveProgress };
            this.swordQi = restore.swordQi;
            this.score = restore.score;
            this.drops = restore.drops;
            this.directorPressure = restore.directorPressure ?? 1;
            this.reshuffles = restore.reshuffles ?? 0;
            this.randomState = restore.randomState >>> 0 || level.seed >>> 0;
            this.runId = restore.runId;
            this.loadout = { ...restore.loadout, skills: [...restore.loadout.skills] };
            this.damageScale = restore.damageScale;
            this.extraMovesUsed = restore.extraMovesUsed;
            this.condensed = restore.condensed;
            this.skillUsed = restore.skillUsed;
            return;
        }
        if (level.mapDefinition && !level.mapDefinition.legacy) this.fillLayout();
        else { this.fillInitial(); this.placeObstacles(); this.ensureMove(); }
    }
    get won(): boolean { return this.level.objectives.every(o => this.objectiveProgress[o.id] >= o.target); }
    get contentDefinition(): GameContent { return this.content; }
    private advance(type: string, amount: number, tileKind?: number): void {
        for (const o of this.level.objectives) if (o.type === type && (o.type !== 'Collect' || o.tileKind === tileKind)) this.objectiveProgress[o.id] = Math.min(o.target, this.objectiveProgress[o.id] + amount);
    }
    get lost(): boolean { return this.moves <= 0 && !this.won; }
    get levelDefinition(): LevelDefinition { return this.level; }
    get animation(): BoardActionAnimation | null { return this.lastAnimation; }
    get(x: number, y: number): Tile | null { const tile = this.inside({ x, y }) ? this.tiles[y * this.width + x] : null; return tile ? copy(tile) : null; }
    snapshot(): BoardSnapshot {
        if (this.tiles.some((t,i) => this.level.board.activeCells[i] && !t))
            throw new Error('UNSETTLED_BOARD');
        return { contentVersion: this.content.version, configVersion: this.content.version, ...(this.level.mapVersion === undefined ? {} : { mapVersion: this.level.mapVersion }), ...(this.totalExpAtStart === undefined ? {} : { totalExpAtStart: this.totalExpAtStart }), level: this.level, runId: this.runId, levelId: this.level.id, moves: this.moves, objectiveProgress: { ...this.objectiveProgress }, swordQi: this.swordQi, score: this.score, drops: this.drops, ...(this.level.mapDefinition && !this.level.mapDefinition.legacy ? { directorPressure: this.directorPressure, reshuffles: this.reshuffles } : {}), randomState: this.randomState >>> 0, extraMovesUsed: this.extraMovesUsed, condensed: this.condensed, skillUsed: this.skillUsed, loadout: { ...this.loadout, skills: [...this.loadout.skills] }, damageScale: this.damageScale, tiles: this.tiles.map(t => t ? copy(t) : null) };
    }
    cost(id: SkillId): number { return skillCost(id, this.loadout.sword, this.condensed, this.content); }
    availableSkills(): SkillId[] {
        if (this.won || this.moves <= 0 || this.skillUsed)
            return [];
        return this.loadout.skills.filter(id => this.swordQi >= this.cost(id) && this.hasSkillTarget(id));
    }
    trySwap(x1: number, y1: number, x2: number, y2: number): boolean {
        return this.drain(this.beginSwap(x1, y1, x2, y2));
    }
    beginSwap(x1: number, y1: number, x2: number, y2: number): BoardActionStart | null {
        if (this.resolution) throw new Error('BOARD_ACTION_IN_PROGRESS');
        this.lastAnimation = null;
        const a = { x: x1, y: y1 }, b = { x: x2, y: y2 };
        if (this.won || this.moves <= 0 || !this.adjacent(a, b) || !this.movable(this.indexOf(a)) || !this.movable(this.indexOf(b)))
            return null;
        const first = this.indexOf(a), second = this.indexOf(b);
        [this.tiles[first], this.tiles[second]] = [this.tiles[second], this.tiles[first]];
        const groups = this.findGroups();
        if (!groups.length) {
            [this.tiles[first], this.tiles[second]] = [this.tiles[second], this.tiles[first]];
            return null;
        }
        this.moves--;
        this.skillUsed = false;
        const prepared = this.metrics.setupMove;
        const animation = this.makeActionStart('swap');
        if (prepared && (prepared.join() === [x1,y1,x2,y2].join() || prepared.join() === [x2,y2,x1,y1].join())) this.metrics.setupUsed = 1;
        animation.swap = { x1, y1, x2, y2 };
        this.resolution = this.resolve(groups, animation, [second, first]);
        return animation;
    }
    trySkill(id: SkillId, targets: CellPosition[]): boolean {
        return this.drain(this.beginSkill(id, targets));
    }
    beginSkill(id: SkillId, targets: CellPosition[]): BoardActionStart | null {
        if (this.resolution) throw new Error('BOARD_ACTION_IN_PROGRESS');
        this.lastAnimation = null;
        if (this.won || this.moves <= 0 || this.skillUsed || !this.loadout.skills.includes(id) || this.swordQi < this.cost(id) || !this.validTargets(id, targets))
            return null;
        const indices = targets.map(this.indexOf);
        this.swordQi -= this.cost(id);
        this.condensed = false;
        this.skillUsed = true;
        let initial: number[] | undefined;
        let mutation: number[] = [];
        let obstacleOnly = false;
        if (id === 'ngu-kiem') {
            [this.tiles[indices[0]], this.tiles[indices[1]]] = [this.tiles[indices[1]], this.tiles[indices[0]]];
            mutation = indices;
        }
        else if (id === 'dan-loi') {
            for (const i of indices)
                this.tiles[i] = plain(this.kind('lightning'));
            mutation = indices;
        }
        else if (id === 'hoi-linh') {
            mutation = this.area(indices[0], 1).filter(i => this.movable(i));
            const old = mutation.map(i => this.tiles[i]!);
            const shuffled = [...old];
            this.shuffle(shuffled);
            if (shuffled.every((t, i) => t === old[i]))
                [shuffled[0], shuffled[shuffled.length - 1]] = [shuffled[shuffled.length - 1], shuffled[0]];
            // Ensure a visible change even if equal-kind tiles happened to exchange.
            if (shuffled.every((t, i) => t.kind === old[i].kind && t.chargeTier === old[i].chargeTier)) {
                const other = old.findIndex(t => t.kind !== old[0].kind || t.chargeTier !== old[0].chargeTier);
                [shuffled[0], shuffled[other]] = [shuffled[other], shuffled[0]];
            }
            mutation.forEach((i, n) => { this.tiles[i] = shuffled[n]; });
        }
        else if (id === 'nhat-kiem')
            initial = this.row(targets[0].y).filter(i => this.level.board.activeCells[i]);
        else if (id === 'hoa-lien')
            initial = this.area(indices[0], 1);
        else if (id === 'pha-chuong') {
            initial = this.area(indices[0], 1);
            obstacleOnly = true;
        }
        else if (id === 'lien-kiem')
            initial = indices;
        else if (id === 'van-kiem')
            initial = this.tiles.flatMap((t, i) => t?.kind === this.tiles[indices[0]]!.kind ? [i] : []);
        const animation = this.makeActionStart('skill');
        animation.skillId = id;
        if (id === 'ngu-kiem')
            animation.swap = { x1: targets[0].x, y1: targets[0].y, x2: targets[1].x, y2: targets[1].y };
        this.resolution = this.resolve(initial ? [] : this.findGroups(), animation, mutation, initial, obstacleOnly);
        return animation;
    }
    grantExtraMoves(): boolean {
        if (!this.lost || this.extraMovesUsed)
            return false;
        this.moves += 3;
        this.extraMovesUsed = true;
        return true;
    }
    private makeActionStart(kind: 'swap' | 'skill'): BoardActionStart {
        this.metrics = actionMetrics();
        return { kind, swappedBoard: this.snapshot() };
    }
    // Production advances once per visible wave; synchronous callers drain the same iterator.
    nextResolutionStep(): BoardResolutionStep | null {
        if (!this.resolution) return null;
        const next = this.resolution.next();
        if (!next.done) return next.value;
        this.resolution = null;
        if (!this.won && !this.lost) this.ensureMove();
        return null;
    }
    private drain(start: BoardActionStart | null): boolean {
        if (!start) return false;
        const steps: BoardResolutionStep[] = [];
        let step: BoardResolutionStep | null;
        while ((step = this.nextResolutionStep())) steps.push(step);
        this.lastAnimation = { ...start, steps, finalBoard: this.snapshot() };
        return true;
    }
    private *resolve(groups: number[][], animation: BoardActionStart, anchors: number[] = [], initial?: number[], obstacleOnly = false): Generator<BoardResolutionStep, void> {
        let chain = 0;
        let mutation = animation.kind === 'skill' && !initial ? anchors : [];
        do {
            chain++;
            const before = this.snapshot();
            const cleared = new Set<number>();
            const changed = new Set<number>(mutation);
            const unlocked = new Set<number>();
            const protectedCells = new Set<number>();
            const effects: BoardAnimationEffect[] = [];
            const queue: {
                index: number;
                tile: Tile;
            }[] = [];
            const scheduled = new Set<number>();
            const direct = new Set<number>();
            let waveDamage = 0;
            for (const group of groups) {
                const charged = group.some(i => this.tiles[i]!.chargeTier > 0);
                if (!charged && group.length >= 4) {
                    const eligible = group.filter(i => !this.tiles[i]!.locked && this.tiles[i]!.kind !== this.kind('rock'));
                    const anchor = anchors.find(i => eligible.includes(i)) ?? eligible[0];
                    if (anchor !== undefined) {
                        this.tiles[anchor] = { ...this.tiles[anchor]!, chargeTier: group.length >= 5 ? 5 : 4 };
                        protectedCells.add(anchor);
                        changed.add(anchor);
                        this.metrics.chargesCreated++;
                    }
                }
                group.forEach(i => direct.add(i));
            }
            const qiFor = (tile: Tile) => this.content.tiles.find(t => t.id === tile.kind)?.qi ?? 0;
            const baseQi = (tile: Tile) => qiFor(tile) + (this.loadout.sword === 'thanh-phong' && tile.kind === this.kind('sword') || this.loadout.sword === 'loi-minh' && tile.kind === this.kind('lightning') ? 1 : this.loadout.sword === 'tu-linh' && tile.kind === this.kind('spirit') ? 2 : 0);
            const weaken = (i: number) => {
                const p = { x: i % this.width, y: Math.floor(i / this.width) };
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy || this.loadout.sword !== 'pha-quan' && Math.abs(dx) + Math.abs(dy) !== 1)
                            continue;
                        const x = p.x + dx, y = p.y + dy;
                        if (!this.inside({ x, y }))
                            continue;
                        const n = y * this.width + x, t = this.tiles[n];
                        if (!t || protectedCells.has(n))
                            continue;
                        if (t.kind === this.kind('rock')) {
                            this.tiles[n] = plain(this.nextKind());
                            changed.add(n);
                            unlocked.add(n);
                            this.advance('BreakRocks', 1);
                        }
                        else if (t.locked) {
                            this.tiles[n] = { ...t, locked: false };
                            changed.add(n);
                            unlocked.add(n);
                            this.advance('BreakSeals', 1);
                        }
                    }
            };
            const remove = (cells: number[]) => {
                for (const i of cells) {
                    const tile = this.tiles[i];
                    if (!tile || cleared.has(i) || protectedCells.has(i) || unlocked.has(i) || tile.kind === this.kind('rock'))
                        continue;
                    if (tile.locked) {
                        this.tiles[i] = { ...tile, locked: false };
                        changed.add(i);
                        unlocked.add(i);
                        this.advance('BreakSeals', 1);
                        continue;
                    }
                    if (tile.chargeTier && !scheduled.has(i)) {
                        scheduled.add(i);
                        queue.push({ index: i, tile: copy(tile) });
                    }
                    cleared.add(i);
                    this.tiles[i] = null;
                    let multiplier = this.damageScale;
                    if (this.loadout.sword === 'trong-nhac' && tile.kind === this.kind('sword'))
                        multiplier *= 1.3;
                    if (this.loadout.sword === 'hoa-van' && tile.kind === this.kind('fire'))
                        multiplier *= 1.5;
                    if (this.loadout.sword === 'lien-tinh' && chain >= 2)
                        multiplier *= 1.2;
                    const damage = Math.floor((this.content.tiles.find(t => t.id === tile.kind)?.damage ?? 0) * multiplier);
                    waveDamage += damage;
                    this.advance('Battle', damage);
                    this.advance('Boss', damage);
                    this.advance('Collect', 1, tile.kind);
                    this.swordQi = Math.min(this.content.qiCap, this.swordQi + baseQi(tile));
                    this.score += 10 * chain;
                    weaken(i);
                }
            };
            const record = (kind: BoardAnimationEffect['kind'], cells: number[], source?: number, bonus?: () => void, swordChargeTier?: 4 | 5, spiritChargeTier?: 4 | 5) => {
                const damageBefore = waveDamage, qiBefore = this.swordQi;
                remove(cells);
                bonus?.();
                effects.push({ kind, cells: [...new Set(cells)], source, damage: waveDamage - damageBefore, qi: this.swordQi - qiBefore, objectiveProgressAfter: { ...this.objectiveProgress },
                    ...(swordChargeTier ? { swordChargeTier } : {}), ...(spiritChargeTier ? { spiritChargeTier } : {}) });
            };
            if (mutation.length)
                effects.push({ kind: 'skill', cells: mutation, damage: 0, qi: 0 });
            if (initial && obstacleOnly) {
                for (const i of initial) {
                    const t = this.tiles[i]!;
                    if (t.kind === this.kind('rock')) {
                        this.tiles[i] = null;
                        cleared.add(i);
                        this.advance('BreakRocks', 1);
                    }
                    else if (t.locked) {
                        this.tiles[i] = { ...t, locked: false };
                        changed.add(i);
                        unlocked.add(i);
                        this.advance('BreakSeals', 1);
                    }
                }
                effects.push({ kind: 'skill', cells: initial, damage: 0, qi: 0, objectiveProgressAfter: { ...this.objectiveProgress } });
            }
            else if (initial)
                record(animation.skillId === 'hoa-lien' ? 'fire' : animation.skillId === 'nhat-kiem' ? 'slash' : 'skill', initial, initial[0]);
            if (direct.size)
                record('skill', [...direct].sort((a, b) => a - b));
            for (let cursor = 0; cursor < queue.length; cursor++) {
                this.metrics.chargesActivated++;
                const { index, tile } = queue[cursor];
                let cells: number[] = [], kind: BoardAnimationEffect['kind'] = 'spirit';
                if (tile.kind === this.kind('sword')) {
                    kind = tile.chargeTier === 5 ? 'cross' : 'slash';
                    cells = this.row(Math.floor(index / this.width)).filter(i => this.level.board.activeCells[i]);
                    if (tile.chargeTier === 5)
                        cells.push(...this.column(index % this.width).filter(i => this.level.board.activeCells[i]));
                }
                else if (tile.kind === this.kind('fire')) {
                    kind = 'fire';
                    cells = this.area(index, tile.chargeTier === 5 ? 2 : 1, tile.chargeTier === 5);
                }
                else if (tile.kind === this.kind('lightning')) {
                    kind = 'lightning';
                    cells = this.tiles.flatMap((t, i) => t?.kind === this.kind('lightning') && !cleared.has(i) && !protectedCells.has(i) ? [i] : []);
                    cells.sort((a, b) => this.distance(a, index) - this.distance(b, index) || a - b);
                    if (tile.chargeTier === 4)
                        cells = cells.slice(0, Math.ceil(cells.length / 2));
                }
                record(kind, cells, index, tile.kind === this.kind('spirit') ? () => {
                    this.swordQi = Math.min(this.content.qiCap, this.swordQi + baseQi(tile) * (tile.chargeTier === 5 ? 4 : 2));
                    if (tile.chargeTier === 5)
                        this.condensed = true;
                } : undefined, tile.kind === this.kind('sword') ? (tile.chargeTier === 5 ? 5 : 4) : undefined,
                    tile.kind === this.kind('spirit') ? (tile.chargeTier === 5 ? 5 : 4) : undefined);
            }
            const falls = this.refill(chain);
            groups = this.findGroups();
            let settlement: BoardResolutionStep['settlement'];
            if (this.modernCombos && (chain === 4 || !groups.length)) {
                const capped = groups.length > 0;
                const reshufflesBefore = this.reshuffles;
                if (capped || (!this.won && !this.lost && !this.legalMoves().length)) {
                    settlement = { before: this.snapshot(), reason: capped ? 'cascade-cap' : 'no-moves' };
                    this.stabilize(new Set(falls.filter(f => f.spawned).map(f => f.index)));
                    this.metrics.settlements++;
                }
                // A constructive rearrangement loses refill-cell provenance. Do
                // not overwrite surviving pieces while preparing the next move.
                if (!this.won && !this.lost && this.reshuffles === reshufflesBefore) this.prepareCombo(new Set(falls.filter(f => f.spawned).map(f => f.index)));
                groups = [];
            }
            yield { before, after: this.snapshot(), cleared: [...cleared], changed: [...changed], effects, falls, damage: waveDamage, chain, ...(settlement ? { settlement } : {}) };
            initial = undefined;
            mutation = [];
            anchors = [];
            if (!this.modernCombos) groups = this.findGroups();
        } while (groups.length && chain < (this.modernCombos ? 4 : MAX_CHAIN));
        if (groups.length)
            this.reshuffle();
    }
    private validTargets(id: SkillId, targets: CellPosition[]): boolean {
        if (!targets.length || !targets.every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && this.inside(p)) || new Set(targets.map(this.indexOf)).size !== targets.length)
            return false;
        const indices = targets.map(this.indexOf);
        if (id === 'ngu-kiem')
            return targets.length === 2 && this.adjacent(targets[0], targets[1]) && indices.every(i => this.movable(i)) && indices.some(i => this.tiles[i]!.kind === this.kind('sword')) && (this.tiles[indices[0]]!.kind !== this.tiles[indices[1]]!.kind || this.tiles[indices[0]]!.chargeTier !== this.tiles[indices[1]]!.chargeTier);
        if (id === 'dan-loi')
            return targets.length === 3 && indices.every(i => this.movable(i) && this.tiles[i]!.kind !== this.kind('lightning') && !this.tiles[i]!.chargeTier);
        if (id === 'lien-kiem')
            return targets.length === 2 && indices.every(i => this.movable(i) && this.tiles[i]!.chargeTier > 0);
        if (targets.length !== 1)
            return false;
        if (id === 'van-kiem')
            return this.tiles[indices[0]]!.kind !== this.kind('rock');
        if (id === 'pha-chuong')
            return this.area(indices[0], 1).some(i => this.tiles[i]!.kind === this.kind('rock') || this.tiles[i]!.locked);
        if (id === 'hoi-linh') {
            const cells = this.area(indices[0], 1).filter(i => this.movable(i));
            return cells.length > 1 && new Set(cells.map(i => `${this.tiles[i]!.kind}:${this.tiles[i]!.chargeTier}`)).size > 1;
        }
        if (id === 'nhat-kiem')
            return this.row(targets[0].y).some(i => !!this.tiles[i] && this.tiles[i]!.kind !== this.kind('rock'));
        return id === 'hoa-lien';
    }
    private hasSkillTarget(id: SkillId): boolean {
        const positions = this.tiles.flatMap((t, i) => t ? [{ x: i % this.width, y: Math.floor(i / this.width) }] : []);
        if (id === 'dan-loi')
            return positions.filter(p => this.movable(this.indexOf(p)) && this.tiles[this.indexOf(p)]!.kind !== this.kind('lightning') && !this.tiles[this.indexOf(p)]!.chargeTier).length >= 3;
        if (id === 'lien-kiem')
            return positions.filter(p => this.movable(this.indexOf(p)) && this.tiles[this.indexOf(p)]!.chargeTier).length >= 2;
        if (id === 'ngu-kiem')
            return positions.some(p => [{ x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }].some(q => this.validTargets(id, [p, q])));
        return positions.some(p => this.validTargets(id, [p]));
    }
    private inside(p: CellPosition): boolean { return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height && this.level.board.activeCells[this.indexOf(p)]; }
    private adjacent(a: CellPosition, b: CellPosition): boolean { return this.inside(a) && this.inside(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
    private movable(i: number): boolean { const t = this.tiles[i]; return !!t && t.kind !== this.kind('rock') && !t.locked; }
    private row(y: number): number[] { return Array.from({ length: this.width }, (_, x) => y * this.width + x); }
    private column(x: number): number[] { return Array.from({ length: this.height }, (_, y) => y * this.width + x); }
    private distance(a: number, b: number): number { return Math.abs(a % this.width - b % this.width) + Math.abs(Math.floor(a / this.width) - Math.floor(b / this.width)); }
    private area(i: number, radius: number, diamond = false): number[] {
        const cells: number[] = [];
        for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
                const p = { x: i % this.width + dx, y: Math.floor(i / this.width) + dy };
                if (this.inside(p) && (!diamond || Math.abs(dx) + Math.abs(dy) <= radius))
                    cells.push(this.indexOf(p));
            }
        return cells;
    }
    private findGroups(): number[][] {
        const groups: Set<number>[] = [];
        for (const line of [...Array.from({ length: this.height }, (_, y) => this.row(y)), ...Array.from({ length: this.width }, (_, x) => this.column(x))]) {
            for (let start = 0; start < line.length;) {
                const tile = this.tiles[line[start]];
                let end = start + 1;
                while (end < line.length && tile && tile.kind !== this.kind('rock') && this.tiles[line[end]]?.kind === tile.kind)
                    end++;
                if (tile && tile.kind !== this.kind('rock') && end - start >= 3) {
                    const set = new Set(line.slice(start, end));
                    for (let g = groups.length - 1; g >= 0; g--)
                        if ([...groups[g]].some(i => set.has(i))) {
                            groups[g].forEach(i => set.add(i));
                            groups.splice(g, 1);
                        }
                    groups.push(set);
                }
                start = end;
            }
        }
        return groups.map(g => [...g].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
    }
    legalMoves(): [
        number,
        number,
        number,
        number
    ][] {
        const moves: [
            number,
            number,
            number,
            number
        ][] = [];
        for (let i = 0; i < this.width * this.height; i++) {
            if (!this.movable(i))
                continue;
            for (const j of [i % this.width < this.width - 1 ? i + 1 : -1, i + this.width < this.width * this.height ? i + this.width : -1]) {
                if (j < 0 || !this.movable(j))
                    continue;
                [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
                const valid = this.findGroups().length > 0;
                [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
                if (valid)
                    moves.push([i % this.width, Math.floor(i / this.width), j % this.width, Math.floor(j / this.width)]);
            }
        }
        return moves;
    }
    private ensureMove(): void { if (!this.legalMoves().length)
        this.reshuffle(); }
    private reshuffle(): void {
        this.reshuffles++;
        const cells = this.tiles.flatMap((_, i) => this.movable(i) ? [i] : []);
        const tiles = cells.map(i => this.tiles[i]!);
        for (let attempt = 0; attempt < 200; attempt++) {
            this.shuffle(tiles);
            cells.forEach((i, n) => { this.tiles[i] = tiles[n]; });
            if (!this.findGroups().length && this.legalMoves().length)
                return;
        }
        // Preserve charged pieces and barriers; only refill ordinary pieces in the fallback.
        for (let attempt = 0; attempt < 200; attempt++) {
            cells.forEach(i => { if (!this.tiles[i]!.chargeTier)
                this.tiles[i] = plain(this.nextKind()); });
            if (!this.findGroups().length && this.legalMoves().length)
                return;
        }
        throw new Error('NO_PLAYABLE_BOARD');
    }
    private refill(chain = 1): BoardAnimationFall[] {
        const map = this.level.mapDefinition;
        if (!map || map.legacy) return this.refillOnce();
        const spent = Math.max(1, this.movesUsed) / this.level.moves;
        const progress = this.level.objectives.reduce((sum,o) => sum + this.objectiveProgress[o.id] / o.target, 0) / this.level.objectives.length;
        const target = Math.max(.35, Math.min(1.2, progress / spent));
        this.directorPressure += (target - this.directorPressure) * .25;
        const pressure = this.effectivePressure();
        const before = this.tiles.map(t => t ? copy(t) : null);
        const positions = this.refillPositions();
        const comboChance = this.refillChance(chain);
        if (comboChance > 0 && this.nextIndex(1_000_000) / 1_000_000 < comboChance) {
            const seeded = this.seededRefill(before, positions);
            if (seeded) { this.tiles = seeded.tiles; this.metrics.seeded++; return seeded.falls; }
        }
        const candidates: { tiles: (Tile|null)[]; falls: BoardAnimationFall[]; weight: number }[] = [];
        for (let n = 0; n < map.spawnPolicy.candidates; n++) {
            this.tiles = before.map(t => t ? copy(t) : null);
            const falls = this.refillOnce();
            const generated = new Set(falls.filter(f => f.spawned).map(f => f.index));
            const groups = this.findGroups().filter(g => g.some(i => generated.has(i)));
            const comboScore = groups.reduce((sum,g) => sum + g.length - 2 + (g.length >= 4 ? 2 : 0), 0);
            const obstacleScore = groups.reduce((sum,g) => sum + g.filter(i => this.area(i, 1).some(j => before[j]?.kind === this.kind('rock') || before[j]?.locked)).length, 0);
            const cascadePenalty = this.modernCombos ? (chain >= 4 ? 20 : Math.max(0, chain - 1) * 1.5) * groups.length : 0;
            const historicalComboPenalty = !this.modernCombos ? pressure * (map.spawnPolicy.comboPressure ?? 0) * comboScore : 0;
            candidates.push({ tiles: this.tiles, falls, weight: Math.exp(-Math.min(this.modernCombos ? 40 : 20, historicalComboPenalty + pressure * map.spawnPolicy.obstaclePressure * obstacleScore + cascadePenalty)) });
        }
        let draw = this.nextIndex(1_000_000) / 1_000_000 * candidates.reduce((sum,c) => sum + c.weight, 0);
        const chosen = candidates.find(c => (draw -= c.weight) < 0) ?? candidates[candidates.length-1];
        this.tiles = chosen.tiles;
        return chosen.falls;
    }
    private refillChance(chain: number): number {
        const base = this.level.mapDefinition?.spawnPolicy.comboChance ?? 0;
        if (this.modernCombos) return Math.min(1, base + (this.level.assistReduction ?? 0)) * ([0, 1, .5, .25, 0][chain] ?? 0);
        if (chain >= MAX_COMBO_CHAIN) return 0;
        return chain >= 2 ? Math.min(1, base * 1.5) : base;
    }
    private seededRefill(before: (Tile|null)[], positions: RefillPosition[]): { tiles: (Tile|null)[]; falls: BoardAnimationFall[] } | null {
        const spawned = new Set(positions.filter(p => p.spawned).map(p => p.index));
        if (spawned.size < 3) return null;
        const runs = this.comboWindows(spawned);
        if (!runs.length) return null;
        let length = this.comboLength();
        let windows: number[][] = [];
        while (length >= 3 && !windows.length) {
            for (const run of runs)
                for (let start = 0; start + length <= run.length; start++) windows.push(run.slice(start, start + length));
            if (!windows.length) length--;
        }
        if (!windows.length) return null;
        const window = windows[this.nextIndex(windows.length)];
        const kind = this.nextKind();
        this.tiles = before.map(t => t ? copy(t) : null);
        const falls = this.applyRefill(positions, new Map(window.map(index => [index, kind])));
        return { tiles: this.tiles, falls };
    }
    private comboWindows(spawned: Set<number>): number[][] {
        const runs: number[][] = [];
        const scan = (length: number, at: (n: number) => number) => {
            let run: number[] = [];
            for (let n = 0; n < length; n++) {
                const index = at(n);
                if (spawned.has(index)) run.push(index);
                else { if (run.length >= 3) runs.push(run); run = []; }
            }
            if (run.length >= 3) runs.push(run);
        };
        for (let y = 0; y < this.height; y++) scan(this.width, x => y * this.width + x);
        for (let x = 0; x < this.width; x++) scan(this.height, y => y * this.width + x);
        return runs;
    }
    private comboLength(): number {
        const sizes = COMBO_SIZES[this.level.mapDefinition?.difficulty ?? 'medium'] ?? COMBO_SIZES.medium;
        const roll = this.nextIndex(1_000_000) / 1_000_000;
        return roll < sizes[0] ? 3 : roll < sizes[0] + sizes[1] ? 4 : 5;
    }
    private refillPositions(): RefillPosition[] {
        const positions: RefillPosition[] = [];
        for (let x = 0; x < this.width; x++) {
            let start = 0;
            for (let boundary = 0; boundary <= this.height; boundary++) {
                const i = boundary * this.width + x;
                const t = boundary < this.height ? this.tiles[i] : null;
                if (boundary < this.height && this.level.board.activeCells[i] && !(t && (t.kind === this.kind('rock') || t.locked))) continue;
                let write = start;
                for (let y = start; y < boundary; y++) {
                    const tile = this.tiles[y * this.width + x];
                    if (!tile) continue;
                    if (write !== y) positions.push({ index: write * this.width + x, fromY: y, spawned: false });
                    write++;
                }
                for (let y = write; y < boundary; y++) positions.push({ index: y * this.width + x, fromY: boundary, spawned: true });
                start = boundary + 1;
            }
        }
        return positions;
    }
    private applyRefill(positions: RefillPosition[], seeded?: Map<number, number>): BoardAnimationFall[] {
        const falls: BoardAnimationFall[] = [];
        for (const position of positions) {
            if (position.spawned) this.tiles[position.index] = plain(seeded?.get(position.index) ?? this.nextKind());
            else this.tiles[position.index] = this.tiles[position.fromY * this.width + position.index % this.width]!;
            falls.push({ index: position.index, fromY: position.fromY, ...(position.spawned ? { spawned: true } : {}) });
        }
        return falls;
    }
    private refillOnce(): BoardAnimationFall[] {
        return this.applyRefill(this.refillPositions());
    }
    private matchesAt(index: number): boolean {
        const kind = this.tiles[index]?.kind;
        if (kind === undefined || kind === this.kind('rock')) return false;
        const x = index % this.width, y = Math.floor(index / this.width);
        for (const [dx,dy] of [[1,0],[0,1]]) {
            let count = 1;
            for (const direction of [-1,1]) for (let step = 1; step <= 2; step++) {
                const nx = x + dx * step * direction, ny = y + dy * step * direction;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || this.tiles[ny*this.width+nx]?.kind !== kind) break;
                count++;
            }
            if (count >= 3) return true;
        }
        return false;
    }
    /** Stabilization never calls remove/advance and preserves all charged pieces and barriers. */
    private stabilize(spawned: Set<number>): void {
        const ids = this.content.normalTileIds!;
        for (let repair = 0; repair < this.tiles.length * 4; repair++) {
            const groups = this.findGroups();
            if (!groups.length) { if (this.legalMoves().length) return; break; }
            const editable = groups[0].filter(i => this.movable(i) && !this.tiles[i]!.chargeTier)
                .sort((a,b) => Number(spawned.has(b)) - Number(spawned.has(a)) || a-b);
            let fixed = false;
            for (const index of editable) {
                const old = this.tiles[index]!;
                const preferred = this.nextKind();
                for (const kind of [preferred, ...ids.filter(id => id !== preferred)]) {
                    this.tiles[index] = plain(kind);
                    if (!this.matchesAt(index)) { fixed = true; break; }
                }
                if (fixed) break;
                this.tiles[index] = old;
            }
            if (!fixed) break;
        }
        // Random shuffling alone can strand a row of charged pieces. Place charges
        // first, then construct a match-free ordinary board with bounded backtracking.
        const original = this.tiles.map(t => t ? copy(t) : null);
        const cells = this.tiles.flatMap((_,i) => this.movable(i) ? [i] : []);
        const charges = cells.filter(i => original[i]!.chargeTier).map(i => original[i]!);
        for (let attempt = 0; attempt < 64; attempt++) {
            this.tiles = original.map(t => t ? copy(t) : null);
            cells.forEach(i => { this.tiles[i] = null; });
            const order = [...cells]; this.shuffle(order);
            let placed = true;
            for (const tile of charges) {
                const index = order.find(i => {
                    if (this.tiles[i]) return false;
                    this.tiles[i] = copy(tile);
                    const valid = !this.matchesAt(i);
                    if (!valid) this.tiles[i] = null;
                    return valid;
                });
                if (index === undefined) { placed = false; break; }
            }
            if (!placed) continue;
            const empty = cells.filter(i => !this.tiles[i]);
            let budget = 10000;
            const fill = (n: number): boolean => {
                if (n === empty.length) return true;
                if (--budget < 0) return false;
                const index = empty[n], preferred = this.nextKind();
                for (const kind of [preferred, ...ids.filter(id => id !== preferred)]) {
                    this.tiles[index] = plain(kind);
                    if (!this.matchesAt(index) && fill(n+1)) return true;
                }
                this.tiles[index] = null;
                return false;
            };
            if (fill(0) && !this.findGroups().length && this.legalMoves().length) { this.reshuffles++; return; }
        }
        this.tiles = original;
        throw new Error('NO_PLAYABLE_BOARD');
    }
    private prepareCombo(spawned: Set<number>): void {
        const chance = Math.min(1, (this.level.mapDefinition?.spawnPolicy.setupChance ?? 0) + (this.level.assistReduction ?? 0));
        if (!spawned.size || !chance || this.nextIndex(1_000_000)/1_000_000 >= chance) return;
        this.metrics.setupAttempts++;
        const original = this.tiles.map(t => t ? copy(t) : null);
        const editable = (i: number) => spawned.has(i) && this.movable(i) && !original[i]!.chargeTier;
        const ordinary = (i: number) => this.movable(i) && !original[i]!.chargeTier;
        const desired = this.nextIndex(1_000_000)/1_000_000 < .7 ? 4 : 5;
        let tried = 0;
        for (const length of desired === 5 ? [5,4] : [4]) {
            const motifs: { run: number[]; hole: number; donor: number }[] = [];
            for (const horizontal of [true,false]) {
                const lines = horizontal ? this.height : this.width, size = horizontal ? this.width : this.height;
                for (let line = 0; line < lines; line++) for (let start = 0; start+length <= size; start++) {
                    const run = Array.from({length},(_,n) => horizontal ? line*this.width+start+n : (start+n)*this.width+line);
                    if (!run.every(ordinary)) continue;
                    for (const hole of run) for (const delta of horizontal ? [-this.width,this.width] : [-1,1]) {
                        const donor = hole + delta;
                        if (donor < 0 || donor >= this.tiles.length || !ordinary(donor) || (!horizontal && Math.floor(donor/this.width) !== Math.floor(hole/this.width))) continue;
                        if ([...run,donor].some(editable)) motifs.push({run,hole,donor});
                    }
                }
            }
            this.shuffle(motifs);
            const limit = desired === 5 && length === 5 ? 32 : 64;
            for (const {run,hole,donor} of motifs) {
                if (tried >= limit) break;
                const preferred = this.nextKind();
                for (const kind of [preferred,...this.content.normalTileIds!.filter(id => id !== preferred)]) {
                    const required = [...run.filter(i => i !== hole),donor];
                    if (required.some(i => original[i]!.kind !== kind && !editable(i))) continue;
                    const holes = editable(hole) ? this.content.normalTileIds!.filter(id => id !== kind) : [original[hole]!.kind].filter(id => id !== kind);
                    for (const holeKind of holes) {
                        if (tried++ >= limit) break;
                        this.tiles = original.map(t => t ? copy(t) : null);
                        for (const i of required) if (editable(i)) this.tiles[i] = plain(kind);
                        if (editable(hole)) this.tiles[hole] = plain(holeKind);
                        if (this.findGroups().length) continue;
                        [this.tiles[hole],this.tiles[donor]] = [this.tiles[donor],this.tiles[hole]];
                        const valid = this.findGroups().some(g => g.length >= length && g.includes(hole) && g.every(i => !this.tiles[i]!.chargeTier));
                        [this.tiles[hole],this.tiles[donor]] = [this.tiles[donor],this.tiles[hole]];
                        if (valid) {
                            this.metrics.setups++;
                            const [a,b] = hole < donor ? [hole,donor] : [donor,hole];
                            this.metrics.setupMove = [a%this.width,Math.floor(a/this.width),b%this.width,Math.floor(b/this.width)];
                            return;
                        }
                    }
                }
            }
        }
        this.tiles = original;
        this.metrics.setupFallbacks++;
    }
    private effectivePressure(): number {
        const remainingBaseMoves = Math.max(0, this.level.moves - this.movesUsed);
        return this.directorPressure * (1 - (this.level.assistReduction ?? 0)) * Math.min(1, remainingBaseMoves / (this.level.moves * .2));
    }
    private fillInitial(): void {
        for (let attempt = 0; attempt < 200; attempt++) {
            this.tiles = [];
            let failed = false;
            for (let i = 0; i < this.width * this.height; i++) {
                if (!this.level.board.activeCells[i]) { this.tiles.push(null); continue; }
                let kind = this.nextKind(), tries = 0;
                while ((i % this.width >= 2 && this.tiles[i-1]?.kind === kind && this.tiles[i-2]?.kind === kind || i >= this.width*2 && this.tiles[i-this.width]?.kind === kind && this.tiles[i-this.width*2]?.kind === kind) && tries++ < 100) kind = this.nextKind();
                if (tries >= 100) { failed = true; break; }
                this.tiles.push(plain(kind));
            }
            if (!failed && new Set(this.tiles.filter(Boolean).map(t => t!.kind)).size === 4) return;
        }
        throw new Error('NO_PLAYABLE_BOARD');
    }
    private fillLayout(): void {
        const map = validateMap(this.level.mapDefinition, this.content);
        const cells = [...map.layout].reverse().flat();
        for (let attempt = 0; attempt < 200; attempt++) {
            this.tiles = [];
            for (let i = 0; i < cells.length; i++) {
                if (cells[i] === 0) { this.tiles.push(null); continue; }
                let kind = cells[i] === -1 ? this.nextKind(true) : cells[i];
                if (cells[i] === -1) {
                    for (let tries = 0; tries < 100 && (i % this.width >= 2 && this.tiles[i-1]?.kind === kind && this.tiles[i-2]?.kind === kind || i >= 2*this.width && this.tiles[i-this.width]?.kind === kind && this.tiles[i-2*this.width]?.kind === kind); tries++) kind = this.nextKind(true);
                }
                this.tiles.push(plain(kind));
            }
            for (const seal of map.initialSeals) this.tiles[(this.height-1-seal.row)*this.width+seal.column]!.locked = true;
            if (!this.findGroups().length && this.legalMoves().length) return;
        }
        throw new Error('NO_PLAYABLE_LAYOUT');
    }
    private placeObstacles(): void {
        const available = this.tiles.flatMap((t,i) => t && i >= this.width && i < this.width * (this.height-1) ? [i] : []);
        this.shuffle(available);
        for (const i of available.splice(0, this.level.obstacles.rocks)) this.tiles[i] = plain(this.kind('rock'));
        const candidates = this.tiles.flatMap((t,i) => t && t.kind !== this.kind('rock') ? [i] : []);
        this.shuffle(candidates);
        for (const i of candidates.slice(0, this.level.obstacles.seals)) this.tiles[i]!.locked = true;
    }
    private nextKind(initial = false): number {
        this.drops++;
        const map = this.level.mapDefinition;
        if (map && !map.legacy) {
            const ids = this.content.normalTileIds!;
            const targets = new Set(this.level.objectives.filter(o => o.type === 'Collect' && this.objectiveProgress[o.id] < o.target).map(o => o.type === 'Collect' ? o.tileKind : -1));
            const weights = ids.map(id => map.spawnPolicy.weights[id] * (initial || !targets.has(id) ? 1 : Math.max(.1, 1 - map.spawnPolicy.collectionPressure * this.effectivePressure())));
            let draw = this.nextIndex(1_000_000) / 1_000_000 * weights.reduce((a,b) => a+b, 0);
            return (ids.find((_,i) => (draw -= weights[i]) < 0) ?? ids[ids.length-1]);
        }
        const phase = [...this.level.spawnPhases].reverse().find(p => this.moves >= p.minMovesRemaining)!;
        let draw = this.nextIndex(phase.weights.reduce((a,b) => a+b,0));
        for (let kind=0;kind<4;kind++) { draw-=phase.weights[kind]; if(draw<0)return this.kind((['sword','fire','lightning','spirit'] as TileKey[])[kind]); }
        return this.kind('spirit');
    }
    private nextIndex(max: number): number {
        let state = this.randomState >>> 0;
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        this.randomState = state >>> 0;
        return this.randomState % max;
    }
    private shuffle<T>(values: T[]): void { for (let i=values.length-1;i>0;i--) { const j=this.nextIndex(i+1); [values[i],values[j]]=[values[j],values[i]]; } }
}
