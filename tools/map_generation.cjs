// Shared authoring helpers. Layout coordinates are zero-based, top-first.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateContent, validateMap, contentWire } = require('./game-runtime.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROFILES = {
  easy: { win: [.95, 1], three: [.8, 1], exclusiveWin: true, exclusiveThree: true },
  medium: { win: [.8, 1], three: [.45, .55], exclusiveWin: true, exclusiveThree: false },
  hard: { win: [.25, .4], three: [.05, .15], exclusiveWin: false, exclusiveThree: false },
  'very-hard': { win: [.1, .2], three: [.02, .06], exclusiveWin: false, exclusiveThree: false },
};
const FAMILIES = ['chamfer', 'stairs', 'waist', 'wings', 'courtyard', 'offset'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}
function engineHash() {
  return hash(['client/src/game/BoardEngine.ts', 'client/src/game/domain.ts', 'content/game-domain.ts',
    'tools/simulate_maps.cjs', 'tools/generate_map_balance.cjs', 'tools/map_generation.cjs',
    'tools/generate_map.cjs', 'tools/render_generated_map.cjs'].map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
}
function positiveInteger(value, label, min = 1, max = 10000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer in ${min}–${max}`);
  return n;
}
function band(value, label, min = 0, max = 1) {
  const values = String(value).split(',').map(Number);
  if (values.length !== 2 || String(value).split(',').some(s => !s.trim()) || values.some(n => !Number.isFinite(n) || n < min || n > max) || values[0] > values[1]) {
    throw new Error(`${label} must be MIN,MAX in ${min}–${max}`);
  }
  return values;
}
function parseArgs(args, valueOptions, flags = [], positional = false) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (flags.includes(key)) {
      if (result[key] !== undefined) throw new Error(`Duplicate option: ${key}`);
      result[key] = true;
    } else if (valueOptions.includes(key)) {
      if (result[key] !== undefined) throw new Error(`Duplicate option: ${key}`);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
      result[key] = args[++i];
    } else if (positional && !key.startsWith('-') && result.index === undefined) result.index = key;
    else throw new Error(`Unknown argument: ${key}`);
  }
  return result;
}
function randomFor(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
// Separate domains, with unique uint32 seeds for each index within each suite.
function gameplaySeed(index, suite, generationSeed) {
  const offsets = { training: 0, validation: 1_000_000, retry: 2_000_000, diagnostic: 3_000_000 };
  if (!(suite in offsets)) throw new Error(`Unknown seed suite: ${suite}`);
  const value = (Math.imul(offsets[suite] + index + 1, 2654435761) ^ generationSeed) >>> 0;
  // A spare index outside every used range avoids the engine's special zero seed.
  return value || ((Math.imul(offsets[suite] + 500_001, 2654435761) ^ generationSeed) >>> 0);
}
function inBand(value, range, exclusive = false) {
  return (exclusive ? value > range[0] : value >= range[0]) && value <= range[1];
}
function shapeKey(layout) {
  const mask = layout.map(row => row.map(cell => cell === 0 ? 0 : 1));
  const transpose = rows => rows[0].map((_, x) => rows.map(row => row[x]));
  return [mask, transpose(mask)].flatMap(rows => [rows, [...rows].reverse(), rows.map(row => [...row].reverse()),
    [...rows].reverse().map(row => [...row].reverse())]).map(rows => JSON.stringify(rows)).sort()[0];
}
function shapeChecks(layout, { density = true } = {}) {
  const height = layout.length, width = layout[0]?.length ?? 0;
  const failures = [];
  if (width < 5 || width > 7 || height < 5 || height > 8 || layout.some(row => row.length !== width)) return { passed: false, failures: ['Dimensions must be 5–7 columns × 5–8 rows'] };
  const cells = layout.flatMap((row, y) => row.flatMap((cell, x) => cell === 0 ? [] : [y * width + x]));
  const active = new Set(cells), holes = width * height - cells.length;
  const neighbors = i => [i % width > 0 ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1, i - width, i + width].filter(n => active.has(n));
  const visited = new Set(cells.slice(0, 1)), queue = [...visited];
  for (let n = 0; n < queue.length; n++) for (const next of neighbors(queue[n])) if (!visited.has(next)) { visited.add(next); queue.push(next); }
  if (visited.size !== cells.length) failures.push('Active cells must form one connected region');
  if (cells.length < 18 || holes / (width * height) > .4 || density && holes / (width * height) < .12) failures.push('Require at least 18 active cells and 12–40% holes');
  let unsupported = 0, narrow = 0;
  for (const i of cells) {
    const x = i % width, y = Math.floor(i / width);
    let horizontal = 1, vertical = 1;
    for (const direction of [-1, 1]) {
      for (let nx = x + direction; nx >= 0 && nx < width && active.has(y * width + nx); nx += direction) horizontal++;
      for (let ny = y + direction; ny >= 0 && ny < height && active.has(ny * width + x); ny += direction) vertical++;
    }
    if (horizontal < 3 && vertical < 3) unsupported++;
    if (neighbors(i).length < 2) narrow++;
  }
  if (unsupported) failures.push(`${unsupported} cells cannot participate in a contiguous match-three line`);
  if (narrow) failures.push(`${narrow} dangling cells`);
  return { passed: !failures.length, failures, width, height, activeCells: cells.length, holes, holeRatio: holes / (width * height) };
}
function generateLayouts(seed, count, catalog) {
  const random = randomFor(seed), seen = new Set(catalog.map(map => shapeKey(map.layout))), layouts = [];
  for (let attempt = 0; attempt < count * 120 && layouts.length < count; attempt++) {
    const width = 5 + Math.floor(random() * 3), height = 5 + Math.floor(random() * 4);
    const family = FAMILIES[attempt % FAMILIES.length], flipX = random() < .5, flipY = random() < .5;
    const depth = 1 + Math.floor(random() * 2), offset = Math.floor(random() * 2);
    let layout = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
      let hole = false;
      if (family === 'chamfer') hole = Math.min(x, width - 1 - x) + Math.min(y, height - 1 - y) < depth;
      if (family === 'stairs') hole = x < Math.floor((height - 1 - y) / 2) || (y < 2 && x >= width - depth);
      if (family === 'waist') hole = Math.abs(y - (height - 1) / 2) < 1.1 && (x < depth || x >= width - depth);
      if (family === 'wings') hole = (y < 2 || y >= height - 2) && (x < depth || x >= width - depth);
      if (family === 'courtyard') hole = (x === Math.floor(width / 2) && y >= 2 && y < height - 2) || (y === 0 && x < depth + offset);
      if (family === 'offset') hole = (y < Math.ceil(height / 2) && x < depth) || (y >= Math.ceil(height / 2) && x >= width - depth);
      return hole ? 0 : -1;
    }));
    if (flipX) layout = layout.map(row => [...row].reverse());
    if (flipY) layout.reverse();
    // Add asymmetry and interior holes without disconnecting or stranding cells.
    const desired = Math.floor(width * height * (.18 + random() * .15));
    for (let n = 0; n < width * height * 3 && layout.flat().filter(cell => cell === 0).length < desired; n++) {
      const x = Math.floor(random() * width), y = Math.floor(random() * height);
      if (!layout[y][x]) continue;
      layout[y][x] = 0;
      if (!shapeChecks(layout, { density: false }).passed) layout[y][x] = -1;
    }
    const checks = shapeChecks(layout), key = shapeKey(layout);
    if (!checks.passed || seen.has(key)) continue;
    seen.add(key); layouts.push({ family, layout, checks, key });
  }
  if (layouts.length < count) throw new Error(`Only ${layouts.length}/${count} distinct playable shapes found; change the generation seed or reduce --layouts`);
  return layouts;
}
function addRockObstacles(layouts, seed, rockId, fixedCount = null) {
  return layouts.map((shape, shapeIndex) => {
    const layout = shape.layout.map(row => [...row]);
    const available = layout.flatMap((row, y) => row.flatMap((cell, x) => cell === -1 ? [y * row.length + x] : []));
    const count = fixedCount ?? 2 + shapeIndex % 5;
    if (!Number.isSafeInteger(count) || count < 1 || count > available.length) throw new Error('ROCK_TARGET_EXCEEDS_LAYOUT');
    const random = randomFor((seed ^ Math.imul(shapeIndex + 1, 0x9e3779b1)) >>> 0 || 1);
    const height = layout.length, width = layout[0].length;
    const selected = new Set([available[Math.floor(random() * available.length)]]);
    while (selected.size < count) {
      const frontier = new Set();
      for (const index of selected) {
        const x = index % width, y = Math.floor(index / width);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || layout[ny][nx] !== -1) continue;
          const next = ny * width + nx;
          if (!selected.has(next)) frontier.add(next);
        }
      }
      const cells = [...frontier];
      if (!cells.length) throw new Error('ROCK_CLUSTER_CANNOT_GROW');
      selected.add(cells[Math.floor(random() * cells.length)]);
    }
    const rockCells = [...selected].sort((a, b) => a - b).map(index => {
      const row = Math.floor(index / width), column = index % width;
      layout[row][column] = rockId;
      return { row, column };
    });
    return { ...shape, layout, rockCount: count, rockCells };
  });
}
function addSealObstacles(layouts, seed, fixedCount = null) {
  return layouts.map((shape, shapeIndex) => {
    const available = shape.layout.flatMap((row, y) => row.flatMap((cell, x) => cell === -1 ? [{ row: y, column: x }] : []));
    const count = fixedCount ?? 2 + shapeIndex % 5;
    if (!Number.isSafeInteger(count) || count < 1 || count > available.length) throw new Error('SEAL_TARGET_EXCEEDS_LAYOUT');
    const random = randomFor((seed ^ Math.imul(shapeIndex + 1, 0x85ebca6b)) >>> 0 || 1);
    const width = shape.layout[0].length, height = shape.layout.length;
    const key = ({ row, column }) => row * width + column;
    const first = available[Math.floor(random() * available.length)];
    const selected = new Map([[key(first), first]]);
    while (selected.size < count) {
      const frontier = new Map();
      for (const position of selected.values()) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const column = position.column + dx, row = position.row + dy;
          if (column < 0 || column >= width || row < 0 || row >= height || shape.layout[row][column] !== -1) continue;
          const next = { row, column };
          if (!selected.has(key(next))) frontier.set(key(next), next);
        }
      }
      const cells = [...frontier.values()];
      if (!cells.length) throw new Error('SEAL_CLUSTER_CANNOT_GROW');
      const next = cells[Math.floor(random() * cells.length)];
      selected.set(key(next), next);
    }
    const sealCells = [...selected.values()].sort((a, b) => key(a) - key(b));
    return { ...shape, sealCount: count, sealCells };
  });
}
function addNodeObstacles(layouts, seed, fixedCount = 1) {
  return layouts.map((shape, shapeIndex) => {
    const width = shape.layout[0].length, height = shape.layout.length;
    const occupied = new Set((shape.sealCells ?? []).map(position => position.row * width + position.column));
    const available = shape.layout.flatMap((row, y) => row.flatMap((cell, x) => {
      const index = y * width + x;
      return cell === -1 && !occupied.has(index) ? [index] : [];
    }));
    if (!Number.isSafeInteger(fixedCount) || fixedCount < 1 || fixedCount > available.length) throw new Error('NODE_TARGET_EXCEEDS_LAYOUT');
    const random = randomFor((seed ^ Math.imul(shapeIndex + 1, 0xc2b2ae35)) >>> 0 || 1);
    const cells = [];
    while (cells.length < fixedCount) {
      const position = available.splice(Math.floor(random() * available.length), 1)[0];
      if (position === undefined) throw new Error('NODE_TARGET_EXCEEDS_LAYOUT');
      cells.push({ row: Math.floor(position / width), column: position % width });
    }
    return { ...shape, nodeCount: fixedCount, nodeCells: cells.sort((a, b) => a.row * width + a.column - (b.row * width + b.column)) };
  });
}
function artifactDir(index) { return path.join(ROOT, 'content', 'map-seeds', String(index)); }
function loadArtifact(index, { checkEngine = true } = {}) {
  const directory = artifactDir(index), seed = readJSON(path.join(directory, 'seed.json'));
  const config = validateContent(readJSON(path.join(directory, 'config.json'))), report = readJSON(path.join(directory, 'balance.json'));
  const map = validateMap(seed.map, config);
  if (seed.format !== 1 || seed.map.id !== index || seed.hashes.map !== hash(map) || seed.hashes.config !== hash(contentWire(config)) || seed.hashes.report !== hash(report)) throw new Error('LOCAL_SEED_HASH_MISMATCH');
  if (report.format !== 1 || report.hashes.map !== seed.hashes.map || report.hashes.config !== seed.hashes.config || report.hashes.engine !== seed.hashes.engine) throw new Error('BALANCE_REPORT_MISMATCH');
  if (checkEngine && seed.hashes.engine !== engineHash()) throw new Error('ENGINE_CHANGED: run npm run maps:balance -- INDEX to revalidate the saved map');
  const checks = shapeChecks(map.layout);
  if (!checks.passed) throw new Error(`INVALID_GENERATED_LAYOUT: ${checks.failures.join('; ')}`);
  return { directory, seed, config, map, report };
}
function withAuthoringLock(callback) {
  const file = path.join(ROOT, 'content', '.map-generation.lock');
  let descriptor;
  try { descriptor = fs.openSync(file, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another map authoring process is active (content/.map-generation.lock)'); throw error; }
  try { fs.writeFileSync(descriptor, String(process.pid)); return callback(); }
  finally { fs.closeSync(descriptor); fs.unlinkSync(file); }
}
module.exports = { ROOT, PROFILES, hash, readJSON, writeJSON, engineHash, positiveInteger, band, parseArgs,
  randomFor, gameplaySeed, inBand, shapeKey, shapeChecks, generateLayouts, addRockObstacles, addSealObstacles, addNodeObstacles,
  artifactDir, loadArtifact, withAuthoringLock };
