// 背包操作（純狀態）：食、飲、用藥、裝備、攞、放低、製作、煮食；返回提示文字
import { CONFIG } from '../config';
import recipesJson from '../data/recipes.json';
import story from '../data/story.json';
import {
  type GameState, ITEMS, type Item, type SkillId, capacity, carried, isRotten, makeItem, profOf, staminaMax,
} from '../state';
import { expiry } from './loot';
import { aidHealMul, gainXp } from './skills';

const clamp = (v: number, hi = 100) => Math.max(0, Math.min(hi, v));
export const PLACE = '__place__';

export interface Recipe {
  name: string;
  needs: Record<string, number>;
  tools?: string[];
  skill?: SkillId;
  sec: number;
}
export const RECIPES = recipesJson as Record<string, Recipe>;

const poison = (s: GameState) => {
  s.player.poisonUntil = s.minutes + CONFIG.cook.poisonMin;
  return '🤢 食物中毒！';
};

export function useItem(s: GameState, i: number, rand: () => number): string {
  const p = s.player;
  const it = p.inv[i];
  if (!it) return '';
  const d = ITEMS[it.id];
  const prof = profOf(s);
  switch (d.kind) {
    case 'weapon': {
      p.inv.splice(i, 1);
      if (p.weapon) p.inv.push(p.weapon);
      p.weapon = it;
      return `拎起${d.name}`;
    }
    case 'bag': {
      p.inv.splice(i, 1);
      if (p.bag) p.inv.push(p.bag);
      p.bag = it;
      return `揹起${d.name}`;
    }
    case 'battery':
      if (p.battery >= 95) return '電筒仲有電';
      p.battery = 100;
      p.inv.splice(i, 1);
      return '換咗新電池';
    case 'phone':
      if (p.phone >= 95) return '手機仲有電';
      p.phone = clamp(p.phone + (d.phone ?? 0));
      p.inv.splice(i, 1);
      return '用尿袋叉咗電';
    case 'food':
    case 'drink': {
      if (d.raw && !d.hunger) return `${d.name}要煮先食得（搵爐頭）`;
      const rotten = isRotten(it, s.minutes);
      const mul = (prof.foodMul ?? 1) * (rotten ? 0.5 : 1);
      p.hunger = clamp(p.hunger + (d.hunger ?? 0) * mul);
      p.thirst = clamp(p.thirst + (d.thirst ?? 0) * mul);
      p.stamina = clamp(p.stamina + (d.stamina ?? 0), staminaMax(s));
      p.panic = clamp(p.panic + (d.panic ?? 0));
      p.inv.splice(i, 1);
      if (d.empty) p.inv.push(makeItem(d.empty));
      let msg = `${d.kind === 'food' ? '食' : '飲'}咗${d.name}`;
      if (rotten || (d.raw && rand() < 0.5)) msg += '……' + poison(s);
      return msg;
    }
    case 'med': {
      const heal = (prof.healMul ?? 1) * aidHealMul(s);
      let msg = `用咗${d.name}`;
      if (d.stopBleed) {
        if (!p.bleeding && !d.hp) return '冇出血';
        p.bleeding = false;
        msg = '包紮好傷口，止咗血';
      }
      if (d.cureScratch) {
        if (p.infectDeath !== null && !p.bitten) {
          p.infectDeath = p.infectAt = null;
          msg = '食咗抗生素……燒退咗';
        } else msg = p.bitten ? '食咗抗生素……但係咬傷冇得醫' : '食咗抗生素';
      }
      if (d.curePoison && p.poisonUntil > s.minutes) {
        p.poisonUntil = 0;
        msg += '，肚痛好返';
      }
      p.hp = clamp(p.hp + (d.hp ?? 0) * heal);
      p.panic = clamp(p.panic + (d.panic ?? 0) * heal);
      p.inv.splice(i, 1);
      const up = gainXp(s, 'aid', CONFIG.skills.xp.aid);
      return up ? `${msg}　${up}` : msg;
    }
    case 'throw':
      return `${d.name}：揀咗佢喺快捷欄，再按 G（手機：掟）向前掟`;
    case 'place':
      return PLACE;
    default:
      return `${d.name}：用嚟製作或者釘板`;
  }
}

/** 攞嘢；線索會即刻讀，唔入背包 */
export function takeItem(s: GameState, from: Item[], j: number): string {
  const it = from[j];
  if (!it) return '';
  if (it.clue) {
    from.splice(j, 1);
    if (!s.clues.includes(it.clue)) s.clues.push(it.clue);
    const c = story.clues.find((x) => x.id === it.clue);
    return `📱 新線索（${s.clues.length}/${story.clues.length}）：${c?.title ?? ''}`;
  }
  if (carried(s.player) + ITEMS[it.id].weight > capacity(s)) return '太重，攞唔落';
  from.splice(j, 1);
  s.player.inv.push(it);
  return '';
}

export function dropItem(s: GameState, to: Item[], i: number) {
  const it = s.player.inv.splice(i, 1)[0];
  if (it) to.push(it);
}

export function unequip(s: GameState, slot: 'weapon' | 'bag') {
  const p = s.player;
  const it = p[slot];
  if (!it) return;
  p[slot] = null;
  p.inv.push(it);
}

export const countOf = (s: GameState, id: string) =>
  s.player.inv.filter((i) => i.id === id).length + (s.player.weapon?.id === id ? 1 : 0);

/** 從背包拎走 n 件 */
export function consume(s: GameState, id: string, n = 1) {
  for (let k = 0; k < n; k++) {
    const i = s.player.inv.findIndex((it) => it.id === id);
    if (i >= 0) s.player.inv.splice(i, 1);
  }
}

export function canCraft(s: GameState, r: Recipe) {
  return Object.entries(r.needs).every(([id, n]) => countOf(s, id) >= n) && (r.tools ?? []).every((t) => countOf(s, t) > 0);
}

export function craft(s: GameState, id: string): string {
  const r = RECIPES[id];
  if (!canCraft(s, r)) return '材料唔夠';
  for (const [nid, n] of Object.entries(r.needs)) consume(s, nid, n);
  s.player.inv.push(makeItem(id));
  const up = gainXp(s, r.skill ?? 'carp', CONFIG.skills.xp.craft);
  return `整好咗${r.name}${up ? '　' + up : ''}`;
}

/** 喺爐頭煮晒背包入面嘅生食 */
export function cookAll(s: GameState, rand: () => number): string {
  const prof = profOf(s);
  const raws = s.player.inv.filter((it) => ITEMS[it.id].raw);
  if (!raws.length) return '冇生嘢要煮';
  let burnt = 0;
  for (const it of raws) {
    const out = rand() < (prof.noBurn ? 0 : CONFIG.cook.burnChance) ? 'burnt' : ITEMS[it.id].raw!;
    if (out === 'burnt') burnt++;
    it.id = out;
    it.exp = expiry(out, s.minutes, false, prof.shelfMul ?? 1);
  }
  return `煮好咗 ${raws.length} 樣嘢${burnt ? `（${burnt} 樣煮燶咗）` : ''}`;
}

/** 將空樽裝滿水；返回裝咗幾多樽 */
export function fillBottles(s: GameState, max = Infinity): number {
  let n = 0;
  for (const it of s.player.inv) {
    if (n >= max) break;
    if (it.id === 'bottle') {
      it.id = 'water';
      n++;
    }
  }
  return n;
}

/** 快捷欄：武器就拎上手，其他就用 */
export function useHotbar(s: GameState, slot: number, rand: () => number): string {
  const id = s.player.hotbar[slot];
  if (!id) return '';
  if (s.player.weapon?.id === id) return '';
  const i = s.player.inv.findIndex((it) => it.id === id);
  return i < 0 ? `冇${ITEMS[id].name}` : useItem(s, i, rand);
}

/** 新攞到嘅武器 / 食物自動填入空嘅快捷欄 */
export function autoHotbar(s: GameState) {
  const p = s.player;
  const have = new Set([...p.inv.map((i) => i.id), p.weapon?.id]);
  for (const it of [p.weapon, ...p.inv]) {
    if (!it || p.hotbar.includes(it.id)) continue;
    const k = ITEMS[it.id].kind;
    if (k === 'bag' || k === 'misc' || k === 'clue') continue;
    const empty = p.hotbar.findIndex((h) => h === null || !have.has(h));
    if (empty < 0) return;
    p.hotbar[empty] = it.id;
  }
}
