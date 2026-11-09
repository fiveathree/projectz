// ASCII 樣板 → 北汐區（DESIGN.md §6.3）
import { CONFIG } from '../config';
import story from '../data/story.json';

const RAW = import.meta.glob('./prefabs/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface TileDef {
  ch: string;
  solid: boolean;
  opaque: boolean;
  /** 容器（可搜刮） */
  container?: boolean;
  /** 地板屬於邊種地點（loot.json 嘅 key） */
  loot?: number;
}

// 次序 = tileset 入面第幾格（BootScene 跟住畫）
const DEFS: TileDef[] = [
  { ch: ',', solid: false, opaque: false }, // 街道
  { ch: '=', solid: false, opaque: false }, // 行人路
  { ch: '_', solid: false, opaque: false }, // 騎樓（有蓋行人路）
  { ch: 'P', solid: true, opaque: true }, // 騎樓柱
  { ch: '#', solid: true, opaque: true }, // 牆
  { ch: 'W', solid: true, opaque: false }, // 窗
  { ch: 'D', solid: true, opaque: true }, // 門（關）
  { ch: 'O', solid: false, opaque: false }, // 門（開）
  { ch: 'B', solid: false, opaque: false }, // 門（爛）
  { ch: '~', solid: false, opaque: false }, // 水窪
  { ch: 'T', solid: true, opaque: false }, // 水龍頭 / 洗手盆
  { ch: 'b', solid: true, opaque: false }, // 床
  { ch: 'f', solid: true, opaque: false, container: true }, // 雪櫃
  { ch: 'k', solid: true, opaque: false, container: true }, // 廚櫃
  { ch: 'r', solid: true, opaque: false, container: true }, // 貨架
  { ch: 'c', solid: true, opaque: false, container: true }, // 收銀機
  { ch: 'w', solid: true, opaque: false, container: true }, // 衣櫃
  { ch: 'x', solid: true, opaque: false, container: true }, // 攤檔 / 貨箱
  { ch: 's', solid: false, opaque: false }, // 樓梯（裝飾）
  { ch: 't', solid: true, opaque: false }, // 枱
  { ch: 'A', solid: true, opaque: false }, // 車
  { ch: 'X', solid: true, opaque: false }, // 警方路障
  { ch: 'S', solid: true, opaque: false }, // 海
  { ch: ':', solid: false, opaque: false, loot: 9 }, // 碼頭地
  { ch: 'E', solid: false, opaque: false }, // 撤離點
  { ch: 'C', solid: true, opaque: true }, // 拉咗窗簾嘅窗
  { ch: 'H', solid: true, opaque: true }, // 釘咗板嘅窗
  { ch: 'J', solid: true, opaque: true }, // 釘咗板嘅門
  { ch: 'V', solid: false, opaque: false }, // 爛窗（爬得過）
  { ch: 'G', solid: true, opaque: false }, // 煤氣爐
  { ch: 'K', solid: true, opaque: true }, // 凍倉鎖住嘅鐵門
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ ch: String(n), solid: false, opaque: false, loot: n })),
];
export const TILE_COUNT = DEFS.length;
export const DEF_BY_INDEX = DEFS;
const INDEX: Record<string, number> = Object.fromEntries(DEFS.map((d, i) => [d.ch, i]));
INDEX['.'] = INDEX['7']; // 未標記嘅室內 = 唐樓
export const tileIndex = (ch: string) => INDEX[ch];

const SOLID = Uint8Array.from(DEFS, (d) => +d.solid);
const OPAQUE = Uint8Array.from(DEFS, (d) => +d.opaque);
/** 喪屍打得爛嘅格：打爛之後變咩 */
export const BREAKS_TO: Record<string, string> = { D: 'B', W: 'V', C: 'V', H: 'V', J: 'B' };
const BASHABLE = Uint8Array.from(DEFS, (d) => +(d.ch in BREAKS_TO));

export interface Grid {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 每格容器屬於邊種地點（0 = 唔係容器） */
  loot: Uint8Array;
  evac: number[];
  barricades: number[];
  /** 線索放咗喺邊個容器：格 → 線索 id */
  clues: Record<number, string>;
  /** 凍倉入面放樣本嘅雪櫃 */
  sampleTile: number;
}

/** mulberry32：有種子嘅 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parse = (txt: string) => txt.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
const PREFABS: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW).map(([path, txt]) => [path.match(/\/(\w)_/)![1], parse(txt)]),
);
/** 16 個街區用邊啲樣板（A 便利店 B 藥房茶餐廳 C 五金 D 街市 E 夜市 F 警崗 G 唐樓） */
const BLOCK_MIX = 'AABBCCDDEEFGGGGG';

export function generateMap(rand: () => number): Grid {
  const { blocksX, blocksY, road, dockRows, evacWidth } = CONFIG.map;
  const bw = PREFABS.A[0].length;
  const bh = PREFABS.A.length;
  const w = road + blocksX * (bw + road);
  const cityH = road + blocksY * (bh + road);
  const h = cityH + dockRows;
  const tiles = new Uint8Array(w * h).fill(INDEX[',']);
  const set = (x: number, y: number, ch: string) => (tiles[y * w + x] = INDEX[ch]);

  // 街區：洗牌後逐格放，隨機鏡像
  const mix = [...BLOCK_MIX];
  for (let i = mix.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [mix[i], mix[j]] = [mix[j], mix[i]];
  }
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let rows = PREFABS[mix[by * blocksX + bx]];
      if (rand() < 0.5) rows = rows.map((r) => [...r].reverse().join(''));
      const ox = road + bx * (bw + road);
      const oy = road + by * (bh + road);
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (INDEX[ch] === undefined) throw new Error(`未知地圖字元「${ch}」`);
          set(ox + x, oy + y, ch);
        }),
      );
    }
  }

  // 碼頭帶：行人路 → 碼頭地（有貨箱）→ 撤離點 → 海
  const evacX = Math.floor(w / 2 - evacWidth / 2);
  const evac: number[] = [];
  for (let y = cityH; y < h; y++) {
    const r = y - cityH;
    for (let x = 0; x < w; x++) {
      if (r < 2) set(x, y, '=');
      else if (r < dockRows - 4) set(x, y, rand() < 0.03 ? 'x' : ':');
      else if (r === dockRows - 4) {
        const isEvac = x >= evacX && x < evacX + evacWidth;
        set(x, y, isEvac ? 'E' : ':');
        if (isEvac) evac.push(y * w + x);
      } else set(x, y, 'S');
    }
  }

  // 北汐三號凍倉：碼頭東面一間鎖住嘅貨倉，最入面個雪櫃有樣本
  const cs = { x: Math.floor(w * 0.72), y: cityH + 2, w: 12, h: 5 };
  for (let y = cs.y; y < cs.y + cs.h; y++)
    for (let x = cs.x; x < cs.x + cs.w; x++) {
      const edge = y === cs.y || y === cs.y + cs.h - 1 || x === cs.x || x === cs.x + cs.w - 1;
      set(x, y, edge ? '#' : y === cs.y + 1 && x > cs.x + 1 && x < cs.x + cs.w - 2 ? 'f' : '9');
    }
  set(cs.x + Math.floor(cs.w / 2), cs.y + cs.h - 1, 'K');
  const sampleTile = (cs.y + 1) * w + cs.x + cs.w - 3;

  // 路邊泊車（橫向兩格），避開十字路口
  const vRoad = (x: number) => x % (bw + road) < road;
  let cars = 0;
  for (let tries = 0; cars < CONFIG.map.cars && tries < 2000; tries++) {
    const x = Math.floor(rand() * (w - 1));
    const y = Math.floor(rand() * cityH);
    const ry = y % (bh + road);
    if (vRoad(x) || vRoad(x + 1) || (ry !== 0 && ry !== road - 1)) continue; // 橫街貼住路邊
    if (tiles[y * w + x] !== INDEX[','] || tiles[y * w + x + 1] !== INDEX[',']) continue;
    set(x, y, 'A');
    set(x + 1, y, 'A');
    cars++;
  }

  // 第 2 日嘅路障：封住中間嗰條直路兩段
  const barricades: number[] = [];
  const rx = road + 2 * (bw + road) - road; // 第三條直路
  for (const by of [1, 2]) {
    const y = road + by * (bh + road) + Math.floor(bh / 2);
    for (let x = rx; x < rx + road; x++) barricades.push(y * w + x);
  }

  // 容器屬於邊種地點：搵最近有標記嘅地板
  const loot = new Uint8Array(w * h);
  for (let i = 0; i < tiles.length; i++) {
    if (!DEFS[tiles[i]].container) continue;
    const cx = i % w;
    const cy = (i - cx) / w;
    let best = 7;
    let bestD = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const l = DEFS[tiles[y * w + x]].loot;
        const d = dx * dx + dy * dy;
        if (l && d < bestD) {
          bestD = d;
          best = l;
        }
      }
    loot[i] = best;
  }

  // 線索：每件放喺對應地點類型嘅一個容器（按種子）
  const clues: Record<number, string> = {};
  for (const c of story.clues) {
    const pool: number[] = [];
    for (let i = 0; i < tiles.length; i++) if (loot[i] === c.loc && !clues[i] && i !== sampleTile) pool.push(i);
    if (pool.length) clues[pool[Math.floor(rand() * pool.length)]] = c.id;
  }

  return { w, h, tiles, loot, evac, barricades, clues, sampleTile };
}

const inside = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
/** 地圖外當牆 */
export const isSolid = (g: Grid, x: number, y: number) => !inside(g, x, y) || SOLID[g.tiles[y * g.w + x]] === 1;
export const isOpaque = (g: Grid, x: number, y: number) => !inside(g, x, y) || OPAQUE[g.tiles[y * g.w + x]] === 1;
/** 喪屍尋路：門、窗、釘板當行得過（行到面前會打爛佢） */
export const zombieBlocked = (g: Grid, x: number, y: number) => isSolid(g, x, y) && BASHABLE[g.tiles[y * g.w + x]] !== 1;
export const isBashable = (g: Grid, i: number) => BASHABLE[g.tiles[i]] === 1;
export const defAt = (g: Grid, x: number, y: number) => (inside(g, x, y) ? DEFS[g.tiles[y * g.w + x]] : undefined);
export const solidIndices = () => DEFS.flatMap((d, i) => (d.solid ? [i] : []));
