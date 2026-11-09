// ASCII 樣板 → 城區格仔（DESIGN.md §6.3）
import { CONFIG } from '../config';
import block1 from './prefabs/block1.txt?raw';
import block2 from './prefabs/block2.txt?raw';

/** 每個字元：tileset 入面第幾格、擋唔擋路、擋唔擋視線 */
export const LEGEND: Record<string, { index: number; solid: boolean; opaque: boolean }> = {
  ',': { index: 0, solid: false, opaque: false }, // 街道
  '=': { index: 1, solid: false, opaque: false }, // 行人路
  '.': { index: 2, solid: false, opaque: false }, // 地板
  '#': { index: 3, solid: true, opaque: true }, // 牆
  W: { index: 4, solid: true, opaque: false }, // 窗：擋路唔擋視線
  D: { index: 5, solid: false, opaque: false }, // 門（Phase 0 永遠開住）
  '~': { index: 6, solid: false, opaque: false }, // 水窪
  f: { index: 7, solid: true, opaque: false }, // 雪櫃
  b: { index: 8, solid: true, opaque: false }, // 床
  k: { index: 9, solid: true, opaque: false }, // 廚櫃
  r: { index: 10, solid: true, opaque: false }, // 貨架
  c: { index: 11, solid: true, opaque: false }, // 收銀
  s: { index: 12, solid: false, opaque: false }, // 梯
};
export const TILE_COUNT = 13;
const BY_INDEX = Object.values(LEGEND).sort((a, b) => a.index - b.index);

export interface Grid {
  w: number;
  h: number;
  tiles: Uint8Array;
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
const PREFABS = [parse(block1), parse(block2)];

export function generateMap(rand: () => number): Grid {
  const { blocksX, blocksY, road } = CONFIG.map;
  const bw = PREFABS[0][0].length;
  const bh = PREFABS[0].length;
  const w = road + blocksX * (bw + road);
  const h = road + blocksY * (bh + road);
  const tiles = new Uint8Array(w * h).fill(LEGEND[','].index);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let rows = PREFABS[Math.floor(rand() * PREFABS.length)];
      if (rand() < 0.5) rows = rows.map((r) => [...r].reverse().join(''));
      if (rand() < 0.5) rows = [...rows].reverse();
      const ox = road + bx * (bw + road);
      const oy = road + by * (bh + road);
      rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          const def = LEGEND[ch];
          if (!def) throw new Error(`未知地圖字元「${ch}」`);
          tiles[(oy + y) * w + ox + x] = def.index;
        });
      });
    }
  }
  return { w, h, tiles };
}

const at = (g: Grid, x: number, y: number) =>
  x < 0 || y < 0 || x >= g.w || y >= g.h ? undefined : BY_INDEX[g.tiles[y * g.w + x]];

/** 地圖外當牆 */
export const isSolid = (g: Grid, x: number, y: number) => at(g, x, y)?.solid ?? true;
export const isOpaque = (g: Grid, x: number, y: number) => at(g, x, y)?.opaque ?? true;

export const solidIndices = () => BY_INDEX.filter((d) => d.solid).map((d) => d.index);
