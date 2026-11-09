// 掉落：容器第一次打開先按種子抽，所以未搜過嘅容器唔使存（DESIGN.md §3.5）
import lootJson from '../data/loot.json';
import { mulberry32 } from '../world/mapgen';
import { type Item, makeItem } from '../state';

const LOOT = lootJson as unknown as Record<string, { name: string; rolls: [number, number]; items: Record<string, number> }>;
export const lootName = (type: number) => LOOT[type]?.name ?? '';

export function rollContainer(seed: number, tile: number, type: number): Item[] {
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
        if (id) out.push(makeItem(id));
        break;
      }
    }
  }
  return out;
}
