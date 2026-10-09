import { emptyProfile, realmForExp, skillCost, requireContent, getContentVersion, type GameContent, type SkillId } from './domain';
import { BoardActionAnimation, BoardActionStart, BoardResolutionStep, BoardAnimationEffect, BoardAnimationFall, BoardSnapshot, CellPosition, GoalKind, LevelDefinition, Loadout, Tile, TileKind } from './types';
export function newId(): string { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 13)}_${Math.random().toString(36).slice(2, 13)}`; }
const plain = (kind: TileKind): Tile => ({ kind, chargeTier: 0, locked: false });
const copy = (tile: Tile): Tile => ({ ...tile });
export class BoardEngine {
    private tiles: (Tile | null)[] = [];
    private randomState: number;
    private drops = 0;
    private runId: string;
    private loadout: Loadout;
    private damageScale: number;
    private lastAnimation: BoardActionAnimation | null = null;
    private resolution: Generator<BoardResolutionStep, void> | null = null;
    moves: number;
    objectiveProgress: Record<string, number>;
    private readonly content: GameContent;
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
        this.content = restore ? getContentVersion(restore.contentVersion) : requireContent();
        this.randomState = level.seed >>> 0;
        this.moves = level.moves;
        this.objectiveProgress = Object.fromEntries(level.objectives.map(o => [o.id, 0]));
        this.runId = newId();
        this.loadout = context ? { ...context.loadout, skills: [...context.loadout.skills] } : emptyProfile().loadout;
        this.damageScale = realmForExp(context?.totalExp ?? 0, this.content).damageScale;
        if (restore && restore.contentVersion === this.content.version && restore.levelId === level.id && restore.tiles.length === this.width * this.height) {
            this.tiles = restore.tiles.map(t => t ? copy(t) : null);
            this.moves = restore.moves;
            this.objectiveProgress = { ...restore.objectiveProgress };
            this.swordQi = restore.swordQi;
            this.score = restore.score;
            this.drops = restore.drops;
            this.randomState = restore.randomState >>> 0 || level.seed >>> 0;
            this.runId = restore.runId;
            this.loadout = { ...restore.loadout, skills: [...restore.loadout.skills] };
            this.damageScale = restore.damageScale;
            this.extraMovesUsed = restore.extraMovesUsed;
            this.condensed = restore.condensed;
            this.skillUsed = restore.skillUsed;
            return;
        }
        this.fillInitial();
        this.placeObstacles();
        this.ensureMove();
    }
    get won(): boolean { return this.level.objectives.every(o => this.objectiveProgress[o.id] >= o.target); }
    get contentDefinition(): GameContent { return this.content; }
    private advance(type: string, amount: number, tileKind?: TileKind): void {
        for (const o of this.level.objectives) if (o.type === type && (o.type !== 'Collect' || o.tileKind === tileKind)) this.objectiveProgress[o.id] = Math.min(o.target, this.objectiveProgress[o.id] + amount);
    }
    get lost(): boolean { return this.moves <= 0 && !this.won && !this.availableSkills().length; }
    get levelDefinition(): LevelDefinition { return this.level; }
    get animation(): BoardActionAnimation | null { return this.lastAnimation; }
    get(x: number, y: number): Tile | null { const tile = this.inside({ x, y }) ? this.tiles[y * this.width + x] : null; return tile ? copy(tile) : null; }
    snapshot(): BoardSnapshot {
        if (this.tiles.some((t,i) => this.level.board.activeCells[i] && !t))
            throw new Error('UNSETTLED_BOARD');
        return { contentVersion: this.content.version, level: this.level, runId: this.runId, levelId: this.level.id, moves: this.moves, objectiveProgress: { ...this.objectiveProgress }, swordQi: this.swordQi, score: this.score, drops: this.drops, randomState: this.randomState >>> 0, extraMovesUsed: this.extraMovesUsed, condensed: this.condensed, skillUsed: this.skillUsed, loadout: { ...this.loadout, skills: [...this.loadout.skills] }, damageScale: this.damageScale, tiles: this.tiles.map(t => t ? copy(t) : null) };
    }
    cost(id: SkillId): number { return skillCost(id, this.loadout.sword, this.condensed, this.content); }
    availableSkills(): SkillId[] {
        if (this.won || this.skillUsed)
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
        const animation = this.makeActionStart('swap');
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
        if (this.won || this.skillUsed || !this.loadout.skills.includes(id) || this.swordQi < this.cost(id) || !this.validTargets(id, targets))
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
                this.tiles[i] = plain(TileKind.Lightning);
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
                    const eligible = group.filter(i => !this.tiles[i]!.locked && this.tiles[i]!.kind !== TileKind.Rock);
                    const anchor = anchors.find(i => eligible.includes(i)) ?? eligible[0];
                    if (anchor !== undefined) {
                        this.tiles[anchor] = { ...this.tiles[anchor]!, chargeTier: group.length >= 5 ? 5 : 4 };
                        protectedCells.add(anchor);
                        changed.add(anchor);
                    }
                }
                group.forEach(i => direct.add(i));
            }
            const qiFor = (tile: Tile) => this.content.tiles.find(t => t.id === tile.kind)?.qi ?? 0;
            const baseQi = (tile: Tile) => qiFor(tile) + (this.loadout.sword === 'thanh-phong' && tile.kind === TileKind.Sword || this.loadout.sword === 'loi-minh' && tile.kind === TileKind.Lightning ? 1 : this.loadout.sword === 'tu-linh' && tile.kind === TileKind.SpiritOrb ? 2 : 0);
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
                        if (t.kind === TileKind.Rock) {
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
                    if (!tile || cleared.has(i) || protectedCells.has(i) || unlocked.has(i) || tile.kind === TileKind.Rock)
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
                    if (this.loadout.sword === 'trong-nhac' && tile.kind === TileKind.Sword)
                        multiplier *= 1.3;
                    if (this.loadout.sword === 'hoa-van' && tile.kind === TileKind.Fire)
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
            const record = (kind: BoardAnimationEffect['kind'], cells: number[], source?: number, bonus?: () => void) => {
                const damageBefore = waveDamage, qiBefore = this.swordQi;
                remove(cells);
                bonus?.();
                effects.push({ kind, cells: [...new Set(cells)], source, damage: waveDamage - damageBefore, qi: this.swordQi - qiBefore, objectiveProgressAfter: { ...this.objectiveProgress } });
            };
            if (mutation.length)
                effects.push({ kind: 'skill', cells: mutation, damage: 0, qi: 0 });
            if (initial && obstacleOnly) {
                for (const i of initial) {
                    const t = this.tiles[i]!;
                    if (t.kind === TileKind.Rock) {
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
                const { index, tile } = queue[cursor];
                let cells: number[] = [], kind: BoardAnimationEffect['kind'] = 'spirit';
                if (tile.kind === TileKind.Sword) {
                    kind = tile.chargeTier === 5 ? 'cross' : 'slash';
                    cells = this.row(Math.floor(index / this.width)).filter(i => this.level.board.activeCells[i]);
                    if (tile.chargeTier === 5)
                        cells.push(...this.column(index % this.width).filter(i => this.level.board.activeCells[i]));
                }
                else if (tile.kind === TileKind.Fire) {
                    kind = 'fire';
                    cells = this.area(index, tile.chargeTier === 5 ? 2 : 1, tile.chargeTier === 5);
                }
                else if (tile.kind === TileKind.Lightning) {
                    kind = 'lightning';
                    cells = this.tiles.flatMap((t, i) => t?.kind === TileKind.Lightning && !cleared.has(i) && !protectedCells.has(i) ? [i] : []);
                    cells.sort((a, b) => this.distance(a, index) - this.distance(b, index) || a - b);
                    if (tile.chargeTier === 4)
                        cells = cells.slice(0, Math.ceil(cells.length / 2));
                }
                record(kind, cells, index, tile.kind === TileKind.SpiritOrb ? () => {
                    this.swordQi = Math.min(this.content.qiCap, this.swordQi + baseQi(tile) * (tile.chargeTier === 5 ? 4 : 2));
                    if (tile.chargeTier === 5)
                        this.condensed = true;
                } : undefined);
            }
            const falls = this.refill();
            yield { before, after: this.snapshot(), cleared: [...cleared], changed: [...changed], effects, falls, damage: waveDamage, chain };
            initial = undefined;
            mutation = [];
            anchors = [];
            groups = this.findGroups();
        } while (groups.length && chain < 20);
        if (groups.length)
            this.reshuffle();
    }
    private validTargets(id: SkillId, targets: CellPosition[]): boolean {
        if (!targets.length || !targets.every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && this.inside(p)) || new Set(targets.map(this.indexOf)).size !== targets.length)
            return false;
        const indices = targets.map(this.indexOf);
        if (id === 'ngu-kiem')
            return targets.length === 2 && this.adjacent(targets[0], targets[1]) && indices.every(i => this.movable(i)) && indices.some(i => this.tiles[i]!.kind === TileKind.Sword) && (this.tiles[indices[0]]!.kind !== this.tiles[indices[1]]!.kind || this.tiles[indices[0]]!.chargeTier !== this.tiles[indices[1]]!.chargeTier);
        if (id === 'dan-loi')
            return targets.length === 3 && indices.every(i => this.movable(i) && this.tiles[i]!.kind !== TileKind.Lightning && !this.tiles[i]!.chargeTier);
        if (id === 'lien-kiem')
            return targets.length === 2 && indices.every(i => this.movable(i) && this.tiles[i]!.chargeTier > 0);
        if (targets.length !== 1)
            return false;
        if (id === 'van-kiem')
            return this.tiles[indices[0]]!.kind !== TileKind.Rock;
        if (id === 'pha-chuong')
            return this.area(indices[0], 1).some(i => this.tiles[i]!.kind === TileKind.Rock || this.tiles[i]!.locked);
        if (id === 'hoi-linh') {
            const cells = this.area(indices[0], 1).filter(i => this.movable(i));
            return cells.length > 1 && new Set(cells.map(i => `${this.tiles[i]!.kind}:${this.tiles[i]!.chargeTier}`)).size > 1;
        }
        if (id === 'nhat-kiem')
            return this.row(targets[0].y).some(i => !!this.tiles[i] && this.tiles[i]!.kind !== TileKind.Rock);
        return id === 'hoa-lien';
    }
    private hasSkillTarget(id: SkillId): boolean {
        const positions = this.tiles.flatMap((t, i) => t ? [{ x: i % this.width, y: Math.floor(i / this.width) }] : []);
        if (id === 'dan-loi')
            return positions.filter(p => this.movable(this.indexOf(p)) && this.tiles[this.indexOf(p)]!.kind !== TileKind.Lightning && !this.tiles[this.indexOf(p)]!.chargeTier).length >= 3;
        if (id === 'lien-kiem')
            return positions.filter(p => this.movable(this.indexOf(p)) && this.tiles[this.indexOf(p)]!.chargeTier).length >= 2;
        if (id === 'ngu-kiem')
            return positions.some(p => [{ x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }].some(q => this.validTargets(id, [p, q])));
        return positions.some(p => this.validTargets(id, [p]));
    }
    private inside(p: CellPosition): boolean { return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height && this.level.board.activeCells[this.indexOf(p)]; }
    private adjacent(a: CellPosition, b: CellPosition): boolean { return this.inside(a) && this.inside(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
    private movable(i: number): boolean { const t = this.tiles[i]; return !!t && t.kind !== TileKind.Rock && !t.locked; }
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
                while (end < line.length && tile && tile.kind !== TileKind.Rock && this.tiles[line[end]]?.kind === tile.kind)
                    end++;
                if (tile && tile.kind !== TileKind.Rock && end - start >= 3) {
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
    private refill(): BoardAnimationFall[] {
        const falls: BoardAnimationFall[] = [];
        for (let x = 0; x < this.width; x++) {
            let start = 0;
            for (let boundary = 0; boundary <= this.height; boundary++) {
                const i = boundary * this.width + x;
                const t = boundary < this.height ? this.tiles[i] : null;
                if (boundary < this.height && this.level.board.activeCells[i] && !(t && (t.kind === TileKind.Rock || t.locked))) continue;
                let write = start;
                for (let y = start; y < boundary; y++) {
                    const tile = this.tiles[y * this.width + x];
                    if (!tile) continue;
                    if (write !== y) falls.push({ index: write * this.width + x, fromY: y });
                    this.tiles[write++ * this.width + x] = tile;
                }
                for (let y = write; y < boundary; y++) {
                    this.tiles[y * this.width + x] = plain(this.nextKind());
                    falls.push({ index: y * this.width + x, fromY: boundary });
                }
                start = boundary + 1;
            }
        }
        return falls;
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
    private placeObstacles(): void {
        const available = this.tiles.flatMap((t,i) => t && i >= this.width && i < this.width * (this.height-1) ? [i] : []);
        this.shuffle(available);
        for (const i of available.splice(0, this.level.obstacles.rocks)) this.tiles[i] = plain(TileKind.Rock);
        const candidates = this.tiles.flatMap((t,i) => t && t.kind !== TileKind.Rock ? [i] : []);
        this.shuffle(candidates);
        for (const i of candidates.slice(0, this.level.obstacles.seals)) this.tiles[i]!.locked = true;
    }
    private nextKind(): TileKind {
        this.drops++;
        const phase = [...this.level.spawnPhases].reverse().find(p => this.moves >= p.minMovesRemaining)!;
        let draw = this.nextIndex(phase.weights.reduce((a,b) => a+b,0));
        for (let kind=0;kind<4;kind++) { draw-=phase.weights[kind]; if(draw<0)return kind as TileKind; }
        return TileKind.SpiritOrb;
    }
    private nextIndex(max: number): number {
        let state = this.randomState >>> 0;
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        this.randomState = state >>> 0;
        return this.randomState % max;
    }
    private shuffle<T>(values: T[]): void { for (let i=values.length-1;i>0;i--) { const j=this.nextIndex(i+1); [values[i],values[j]]=[values[j],values[i]]; } }
}
