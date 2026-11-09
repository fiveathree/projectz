// 背包操作（純狀態）：食、飲、用藥、裝備、攞、放低；返回提示文字
import { type GameState, ITEMS, type Item, capacity, carried, profOf, staminaMax } from '../state';

const clamp = (v: number, hi = 100) => Math.max(0, Math.min(hi, v));

export function useItem(s: GameState, i: number): string {
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
    case 'food':
    case 'drink': {
      const mul = prof.foodMul ?? 1;
      p.hunger = clamp(p.hunger + (d.hunger ?? 0) * mul);
      p.thirst = clamp(p.thirst + (d.thirst ?? 0) * mul);
      p.stamina = clamp(p.stamina + (d.stamina ?? 0), staminaMax(s));
      p.panic = clamp(p.panic + (d.panic ?? 0));
      p.inv.splice(i, 1);
      return `${d.kind === 'food' ? '食' : '飲'}咗${d.name}`;
    }
    case 'med': {
      const heal = prof.healMul ?? 1;
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
      p.hp = clamp(p.hp + (d.hp ?? 0) * heal);
      p.panic = clamp(p.panic + (d.panic ?? 0) * heal);
      p.inv.splice(i, 1);
      return msg;
    }
  }
}

export function takeItem(s: GameState, from: Item[], j: number): string {
  const it = from[j];
  if (!it) return '';
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

/** 快捷欄：武器就拎上手，其他就用 */
export function useHotbar(s: GameState, slot: number): string {
  const id = s.player.hotbar[slot];
  if (!id) return '';
  if (s.player.weapon?.id === id) return '';
  const i = s.player.inv.findIndex((it) => it.id === id);
  return i < 0 ? `冇${ITEMS[id].name}` : useItem(s, i);
}

/** 新攞到嘅武器 / 食物自動填入空嘅快捷欄 */
export function autoHotbar(s: GameState) {
  const p = s.player;
  const have = new Set([...p.inv.map((i) => i.id), p.weapon?.id]);
  for (const it of [p.weapon, ...p.inv]) {
    if (!it || p.hotbar.includes(it.id) || ITEMS[it.id].kind === 'bag') continue;
    const empty = p.hotbar.findIndex((h) => h === null || !have.has(h));
    if (empty < 0) return;
    p.hotbar[empty] = it.id;
  }
}
