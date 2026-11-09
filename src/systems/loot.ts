// 掉落：容器第一次打開先按種子抽，所以未搜過嘅容器唔使存（DESIGN.md §3.5）
import lootJson from '../data/loot.json';
import { CONFIG } from '../config';
import { mulberry32 } from '../world/mapgen';
import { ITEMS, type Item, makeItem } from '../state';

const LOOT = lootJson as unknown as Record<string, { name: string; rolls: [number, number]; items: Record<string, number> }>;
export const lootName = (type: number) => LOOT[type]?.name ?? '';

export interface RollCtx {
  minutes: number;
  /** 雪櫃：斷電之前唔會壞 */
  fridge: boolean;
  shelfMul: number;
  clue?: string;
  sample?: boolean;
}

/** 易壞食物嘅到期時間 */
export function expiry(id: string, minutes: number, fridge: boolean, shelfMul: number): number | undefined {
  const shelf = ITEMS[id].shelf;
  if (!shelf) return undefined;
  const start = fridge ? Math.max(minutes, CONFIG.cook.powerOutMin) : minutes;
  return start + shelf * shelfMul;
}

export function rollContainer(seed: number, tile: number, type: number, ctx: RollCtx): Item[] {
  const table = LOOT[type] ?? LOOT['7'];
  const rand = mulberry32((seed ^ Math.imul(tile + 1, 2654435761)) >>> 0);
  const entries = Object.entries(table.items);
  const total = entries.reduce((t, [, w]) => t + w, 0);
  const [lo, hi] = table.rolls;
  const n = lo + Math.floor(rand() * (hi - lo + 1));
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    let r = rand() * total;
    for (const [id, w] of entries) {
      r -= w;
      if (r < 0) {
        if (id) {
          const it = makeItem(id);
          const exp = expiry(id, ctx.minutes, ctx.fridge, ctx.shelfMul);
          if (exp !== undefined) it.exp = exp;
          out.push(it);
        }
        break;
      }
    }
  }
  if (ctx.clue) out.push({ id: 'clue', clue: ctx.clue });
  if (ctx.sample) out.push(makeItem('sample'));
  return out;
}
