import {
  BoardActionAnimation,
  BoardAnimationEffect,
  BoardAnimationFall,
  BoardSnapshot,
  GoalKind,
  LevelDefinition,
  SpecialKind,
  Tile,
  TileKind,
} from './types';

export const BOARD_WIDTH = 7;
export const BOARD_HEIGHT = 7;
const CLEARED_SPECIAL = 99 as const;

export class BoardEngine {
  private readonly level: LevelDefinition;
  private tiles: Tile[][] = Array.from({ length: BOARD_WIDTH }, () =>
    Array.from({ length: BOARD_HEIGHT }, () => ({ kind: TileKind.Sword, special: SpecialKind.None, locked: false })),
  );
  private randomState: number;
  private drops = 0;

  moves: number;
  remaining: number;
  swordQi = 0;
  score = 0;
  extraMovesUsed = false;
  private lastActionAnimation: BoardActionAnimation | null = null;

  constructor(level: LevelDefinition, restore?: BoardSnapshot | null) {
    this.level = level;
    this.randomState = level.seed >>> 0;

    if (restore && restore.levelId === level.id && Array.isArray(restore.tiles) && restore.tiles.length === 49) {
      this.moves = restore.moves;
      this.remaining = restore.remaining;
      this.swordQi = restore.swordQi;
      this.score = restore.score;
      this.extraMovesUsed = restore.extraMovesUsed;
      this.drops = restore.drops;
      this.randomState = restore.randomState === 0 ? level.seed >>> 0 : restore.randomState >>> 0;
      for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          const tile = restore.tiles[y * BOARD_WIDTH + x];
          this.tiles[x][y] = { kind: tile.kind, special: tile.special, locked: tile.locked };
        }
      }
      return;
    }

    this.moves = level.moves;
    this.remaining = level.target;
    this.fillInitial();
    this.placeObstacles(level.rocks, level.seals);
    this.ensureMove();
  }

  get won(): boolean {
    return this.remaining <= 0;
  }

  get lost(): boolean {
    return this.moves <= 0 && !this.won;
  }

  get levelDefinition(): LevelDefinition {
    return this.level;
  }

  get animation(): BoardActionAnimation | null {
    return this.lastActionAnimation;
  }

  get(x: number, y: number): Tile {
    const tile = this.tiles[x][y];
    return { kind: tile.kind, special: tile.special, locked: tile.locked };
  }

  snapshot(): BoardSnapshot {
    const flat: Tile[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const tile = this.tiles[x][y];
        flat.push({ kind: tile.kind, special: tile.special, locked: tile.locked });
      }
    }
    return {
      levelId: this.level.id,
      moves: this.moves,
      remaining: this.remaining,
      swordQi: this.swordQi,
      score: this.score,
      drops: this.drops,
      randomState: this.randomState | 0,
      extraMovesUsed: this.extraMovesUsed,
      tiles: flat,
    };
  }

  trySwap(x1: number, y1: number, x2: number, y2: number): boolean {
    this.lastActionAnimation = null;
    if (
      this.won || this.lost || !this.inside(x1, y1) || !this.inside(x2, y2) ||
      Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1 ||
      this.tiles[x1][y1].kind === TileKind.Rock || this.tiles[x2][y2].kind === TileKind.Rock ||
      this.tiles[x1][y1].locked || this.tiles[x2][y2].locked
    ) return false;

    const first = this.tiles[x1][y1];
    const second = this.tiles[x2][y2];
    this.tiles[x1][y1] = second;
    this.tiles[x2][y2] = first;
    const matched = this.findMatches();

    if (first.special === SpecialKind.Omni || second.special === SpecialKind.Omni) {
      const target = first.special === SpecialKind.Omni ? second.kind : first.kind;
      for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          if (this.tiles[x][y].kind === target && target !== TileKind.Rock) matched.add(y * BOARD_WIDTH + x);
        }
      }
      matched.add(y1 * BOARD_WIDTH + x1);
      matched.add(y2 * BOARD_WIDTH + x2);
    } else if (first.special === SpecialKind.Slash || second.special === SpecialKind.Slash) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) matched.add(y2 * BOARD_WIDTH + x);
    }

    if (matched.size === 0) {
      this.tiles[x1][y1] = first;
      this.tiles[x2][y2] = second;
      return false;
    }

    this.moves -= 1;
    let specialX = x2;
    let specialY = y2;
    let specialCount = this.countMatchingLine(x2, y2);
    if (this.countMatchingLine(x1, y1) > specialCount) {
      specialX = x1;
      specialY = y1;
      specialCount = this.countMatchingLine(x1, y1);
    }
    const created = specialCount >= 5 ? SpecialKind.Omni : specialCount >= 4 ? SpecialKind.Slash : SpecialKind.None;
    if (created !== SpecialKind.None && this.tiles[specialX][specialY].kind !== TileKind.Rock) {
      matched.delete(specialY * BOARD_WIDTH + specialX);
      this.tiles[specialX][specialY] = { ...this.tiles[specialX][specialY], special: created };
    }
    const animation: BoardActionAnimation = {
      kind: 'swap',
      swap: { x1, y1, x2, y2 },
      swappedBoard: this.snapshot(),
      steps: [],
      finalBoard: this.snapshot(),
    };
    this.resolve(matched, animation);
    animation.finalBoard = this.snapshot();
    this.lastActionAnimation = animation;
    return true;
  }

  useSwordQi(row: number): boolean {
    this.lastActionAnimation = null;
    if (this.won || this.lost || this.swordQi < 100 || row < 0 || row >= BOARD_HEIGHT) return false;
    this.swordQi = 0;
    const matched = new Set<number>();
    for (let x = 0; x < BOARD_WIDTH; x += 1) matched.add(row * BOARD_WIDTH + x);
    const animation: BoardActionAnimation = {
      kind: 'sword',
      swordRow: row,
      swappedBoard: this.snapshot(),
      steps: [],
      finalBoard: this.snapshot(),
    };
    this.resolve(matched, animation);
    animation.finalBoard = this.snapshot();
    this.lastActionAnimation = animation;
    return true;
  }

  grantExtraMoves(): boolean {
    if (!this.lost || this.extraMovesUsed) return false;
    this.moves += 3;
    this.extraMovesUsed = true;
    return true;
  }

  private resolve(initialMatches: Set<number>, animation: BoardActionAnimation): void {
    let matched = initialMatches;
    let chain = 0;
    while (matched.size > 0 && chain < 20) {
      chain += 1;
      const before = this.snapshot();
      const remainingBefore = this.remaining;
      const clear = new Set(matched);
      const effects: BoardAnimationEffect[] = [];
      for (const index of matched) {
        const x = index % BOARD_WIDTH;
        const y = Math.floor(index / BOARD_WIDTH);
        const tile = this.tiles[x][y];
        if (tile.special === SpecialKind.Slash) {
          const cells = Array.from({ length: BOARD_WIDTH }, (_, xx) => y * BOARD_WIDTH + xx);
          effects.push({ kind: 'slash', cells, row: y });
          for (const cell of cells) clear.add(cell);
        } else if (tile.special === SpecialKind.Omni) {
          const cells = Array.from({ length: BOARD_HEIGHT }, (_, yy) => yy * BOARD_WIDTH + x);
          effects.push({ kind: 'omni', cells, column: x });
          for (const cell of cells) clear.add(cell);
        }
      }
      if (animation.kind === 'sword' && chain === 1 && animation.swordRow !== undefined) {
        effects.push({ kind: 'sword', cells: Array.from(clear), row: animation.swordRow });
      }

      let removed = 0;
      const cleared = new Set<number>();
      const changed = new Set<number>();
      for (const index of clear) {
        const x = index % BOARD_WIDTH;
        const y = Math.floor(index / BOARD_WIDTH);
        const tile = this.tiles[x][y];
        if (tile.kind === TileKind.Rock) continue;
        if (tile.locked) {
          changed.add(index);
          this.tiles[x][y] = { ...tile, locked: false };
          if (this.level.goal === GoalKind.BreakSeals) this.remaining = Math.max(0, this.remaining - 1);
        } else {
          cleared.add(index);
          removed += 1;
          if (tile.kind === TileKind.Sword) this.swordQi = Math.min(100, this.swordQi + 6);
          if (this.level.goal === GoalKind.Collect && tile.kind === this.level.collectKind) {
            this.remaining = Math.max(0, this.remaining - 1);
          }
          this.tiles[x][y] = this.clearedTile();
        }
        this.weakenAdjacent(x, y, changed);
      }

      if (this.level.goal === GoalKind.Boss || this.level.goal === GoalKind.Battle) {
        this.remaining = Math.max(0, this.remaining - removed * (chain === 1 ? 6 : 8));
      }
      this.score += removed * 10 * chain;
      const falls = this.refill();
      matched = this.findMatches();
      const after = this.snapshot();
      animation.steps.push({
        before,
        after,
        cleared: [...cleared],
        changed: [...changed],
        effects,
        falls,
        damage: remainingBefore - this.remaining,
        chain,
      });
    }
    if (!this.won && !this.lost) this.ensureMove();
  }

  private weakenAdjacent(x: number, y: number, changed: Set<number>): void {
    const dx = [-1, 1, 0, 0];
    const dy = [0, 0, -1, 1];
    for (let index = 0; index < 4; index += 1) {
      const nx = x + dx[index];
      const ny = y + dy[index];
      if (!this.inside(nx, ny)) continue;
      const nearby = this.tiles[nx][ny];
      if (nearby.kind === TileKind.Rock && nearby.special !== CLEARED_SPECIAL) {
        changed.add(ny * BOARD_WIDTH + nx);
        this.tiles[nx][ny] = { ...nearby, kind: this.nextKind() };
      } else if (nearby.locked) {
        changed.add(ny * BOARD_WIDTH + nx);
        this.tiles[nx][ny] = { ...nearby, locked: false };
        if (this.level.goal === GoalKind.BreakSeals) this.remaining = Math.max(0, this.remaining - 1);
      }
    }
  }

  private refill(): BoardAnimationFall[] {
    const falls: BoardAnimationFall[] = [];
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      let start = 0;
      for (let boundary = 0; boundary <= BOARD_HEIGHT; boundary += 1) {
        const barrier = boundary === BOARD_HEIGHT ||
          (this.tiles[x][boundary].kind === TileKind.Rock && !this.isCleared(x, boundary)) ||
          this.tiles[x][boundary].locked;
        if (!barrier) continue;
        let write = start;
        for (let y = start; y < boundary; y += 1) {
          if (this.isCleared(x, y)) continue;
          if (write !== y) falls.push({ index: write * BOARD_WIDTH + x, fromY: y });
          this.tiles[x][write] = this.tiles[x][y];
          write += 1;
        }
        for (let y = write; y < boundary; y += 1) {
          this.tiles[x][y] = this.newTile(this.nextKind());
          falls.push({ index: y * BOARD_WIDTH + x, fromY: boundary });
        }
        start = boundary + 1;
      }
    }
    return falls;
  }

  private fillInitial(): void {
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        let kind: TileKind;
        do {
          kind = this.nextKind();
        } while (
          (x >= 2 && this.tiles[x - 1][y].kind === kind && this.tiles[x - 2][y].kind === kind) ||
          (y >= 2 && this.tiles[x][y - 1].kind === kind && this.tiles[x][y - 2].kind === kind)
        );
        this.tiles[x][y] = this.newTile(kind);
      }
    }
  }

  private placeObstacles(rocks: number, seals: number): void {
    for (let index = 0; index < rocks; index += 1) {
      const x = this.nextIndex(BOARD_WIDTH);
      const y = 1 + this.nextIndex(BOARD_HEIGHT - 2);
      if (this.tiles[x][y].kind === TileKind.Rock) { index -= 1; continue; }
      this.tiles[x][y] = this.newTile(TileKind.Rock);
    }
    for (let index = 0; index < seals; index += 1) {
      const x = this.nextIndex(BOARD_WIDTH);
      const y = this.nextIndex(BOARD_HEIGHT);
      if (this.tiles[x][y].kind === TileKind.Rock || this.tiles[x][y].locked) { index -= 1; continue; }
      this.tiles[x][y] = { ...this.tiles[x][y], locked: true };
    }
  }

  private countMatchingLine(x: number, y: number): number {
    const kind = this.tiles[x][y].kind;
    let horizontal = 1;
    let vertical = 1;
    for (let xx = x - 1; xx >= 0 && this.tiles[xx][y].kind === kind; xx -= 1) horizontal += 1;
    for (let xx = x + 1; xx < BOARD_WIDTH && this.tiles[xx][y].kind === kind; xx += 1) horizontal += 1;
    for (let yy = y - 1; yy >= 0 && this.tiles[x][yy].kind === kind; yy -= 1) vertical += 1;
    for (let yy = y + 1; yy < BOARD_HEIGHT && this.tiles[x][yy].kind === kind; yy += 1) vertical += 1;
    return Math.max(horizontal, vertical);
  }

  private findMatches(): Set<number> {
    const matches = new Set<number>();
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const kind = this.tiles[x][y].kind;
        if (kind === TileKind.Rock) continue;
        if (x <= BOARD_WIDTH - 3 && this.tiles[x + 1][y].kind === kind && this.tiles[x + 2][y].kind === kind) {
          for (let xx = x; xx < BOARD_WIDTH && this.tiles[xx][y].kind === kind; xx += 1) matches.add(y * BOARD_WIDTH + xx);
        }
        if (y <= BOARD_HEIGHT - 3 && this.tiles[x][y + 1].kind === kind && this.tiles[x][y + 2].kind === kind) {
          for (let yy = y; yy < BOARD_HEIGHT && this.tiles[x][yy].kind === kind; yy += 1) matches.add(yy * BOARD_WIDTH + x);
        }
      }
    }
    return matches;
  }

  private hasMove(): boolean {
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (this.tiles[x][y].kind === TileKind.Rock || this.tiles[x][y].locked) continue;
        for (let direction = 0; direction < 2; direction += 1) {
          const nx = x + (direction === 0 ? 1 : 0);
          const ny = y + (direction === 1 ? 1 : 0);
          if (!this.inside(nx, ny) || this.tiles[nx][ny].kind === TileKind.Rock || this.tiles[nx][ny].locked) continue;
          if (this.tiles[x][y].special !== SpecialKind.None || this.tiles[nx][ny].special !== SpecialKind.None) return true;
          const one = this.tiles[x][y];
          const two = this.tiles[nx][ny];
          this.tiles[x][y] = two;
          this.tiles[nx][ny] = one;
          const matches = this.findMatches().size > 0;
          this.tiles[x][y] = one;
          this.tiles[nx][ny] = two;
          if (matches) return true;
        }
      }
    }
    return false;
  }

  private ensureMove(): void {
    if (this.hasMove()) return;
    const positions: number[] = [];
    const kinds: TileKind[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (this.tiles[x][y].kind !== TileKind.Rock && !this.tiles[x][y].locked) {
          positions.push(y * BOARD_WIDTH + x);
          kinds.push(this.tiles[x][y].kind);
        }
      }
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
      for (let index = kinds.length - 1; index > 0; index -= 1) {
        const other = this.nextIndex(index + 1);
        [kinds[index], kinds[other]] = [kinds[other], kinds[index]];
      }
      for (let index = 0; index < positions.length; index += 1) {
        const x = positions[index] % BOARD_WIDTH;
        const y = Math.floor(positions[index] / BOARD_WIDTH);
        this.tiles[x][y] = { ...this.tiles[x][y], kind: kinds[index] };
      }
      if (this.findMatches().size === 0 && this.hasMove()) return;
    }
  }

  private nextKind(): TileKind {
    this.drops += 1;
    return this.nextIndex(5) as TileKind;
  }

  private nextIndex(exclusiveMax: number): number {
    let state = this.randomState >>> 0;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.randomState = state >>> 0;
    return this.randomState % exclusiveMax;
  }

  private newTile(kind: TileKind): Tile {
    return { kind, special: SpecialKind.None, locked: false };
  }

  private clearedTile(): Tile {
    return { kind: TileKind.Rock, special: CLEARED_SPECIAL, locked: false };
  }

  private isCleared(x: number, y: number): boolean {
    return this.tiles[x][y].kind === TileKind.Rock && this.tiles[x][y].special === CLEARED_SPECIAL;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
  }
}
