// 單一純 TypeScript GameState（DESIGN.md §6.1：唔用 Redux / ECS）— 成個物件就係存檔
import { CONFIG } from './config';
import itemsJson from './data/items.json';
import profsJson from './data/professions.json';

export interface ItemDef {
  name: string;
  kind: 'food' | 'drink' | 'med' | 'battery' | 'weapon' | 'bag' | 'misc' | 'throw' | 'place' | 'phone' | 'clue';
  weight: number;
  hunger?: number;
  thirst?: number;
  stamina?: number;
  panic?: number;
  hp?: number;
  stopBleed?: boolean;
  cureScratch?: boolean;
  battery?: number;
  damage?: number;
  reach?: number;
  cooldown?: number;
  durability?: number;
  knockback?: number;
  capacity?: number;
  /** 幾多遊戲分鐘後變壞 */
  shelf?: number;
  /** 生食：煮完變咩 */
  raw?: string;
  /** 飲完剩低咩 */
  empty?: string;
  curePoison?: boolean;
  phone?: number;
  tool?: boolean;
}
export interface Profession {
  name: string;
  pro: string;
  con: string;
  staminaMax?: number;
  mapRevealed?: boolean;
  healMul?: number;
  damageMul?: number;
  foodMul?: number;
  capacityMul?: number;
  runNoiseMul?: number;
  nightVision?: number;
  panicMul?: number;
  shoveMul?: number;
  hungerMul?: number;
  start?: string[];
  skills?: Partial<Skills>;
  noBurn?: boolean;
  shelfMul?: number;
}
export const ITEMS = itemsJson as Record<string, ItemDef>;
export const PROFESSIONS = profsJson as Record<string, Profession>;

/** 物品實例：id + 武器耐久 */
export interface Item {
  id: string;
  dur?: number;
  /** 幾時變壞（遊戲分鐘） */
  exp?: number;
  /** 線索 id */
  clue?: string;
}

export type SkillId = 'melee' | 'sneak' | 'aid' | 'carp';
export type Skills = Record<SkillId, number>;
export const SKILL_NAMES: Record<SkillId, string> = { melee: '近戰', sneak: '潛行', aid: '急救', carp: '木工' };
export const makeItem = (id: string): Item => (ITEMS[id].durability ? { id, dur: ITEMS[id].durability } : { id });

export interface PlayerState {
  prof: string;
  x: number;
  y: number;
  hp: number;
  hunger: number;
  thirst: number;
  stamina: number;
  panic: number;
  battery: number;
  bleeding: boolean;
  /** 感染：幾時死（遊戲分鐘）；null = 冇感染 */
  infectDeath: number | null;
  infectAt: number | null;
  bitten: boolean;
  inv: Item[];
  weapon: Item | null;
  bag: Item | null;
  /** 快捷欄 1–5：記住物品 id */
  hotbar: (string | null)[];
  kills: number;
  bornAt: number;
  /** 技能經驗值 */
  skills: Skills;
  /** 食物中毒到幾時 */
  poisonUntil: number;
  /** 手機電量 */
  phone: number;
}

export interface Structure {
  x: number;
  y: number;
  kind: 'collector';
  /** 雨水收集器：儲咗幾多水 */
  water: number;
}

export interface Pile {
  x: number;
  y: number;
  items: Item[];
  /** 玩家屍體：幾時變喪屍 */
  turnAt?: number;
}

export interface ZombieSave {
  x: number;
  y: number;
  hp: number;
  carry?: Item[];
}

export interface GameState {
  version: number;
  seed: number;
  /** 由第 1 日 00:00 起計嘅遊戲分鐘 */
  minutes: number;
  player: PlayerState;
  /** 改過嘅格（門開關、路障）：格 index → tile index */
  tileOverrides: Record<number, number>;
  doorHp: Record<number, number>;
  /** 搜過嘅容器：格 index → 剩低嘅物品 */
  containers: Record<number, Item[]>;
  piles: Pile[];
  zombies: ZombieSave[] | null;
  /** 見過嘅格（地圖用），base64 bitset */
  explored: string;
  blood: number[];
  /** 已經觸發咗嘅每日事件 */
  daysStarted: number;
  deaths: number;
  /** 讀過嘅線索（世界層面：新角色繼承手機筆記） */
  clues: string[];
  structures: Structure[];
  ended: null | 'escaped' | 'stayed';
}

export function newPlayer(prof: string, x: number, y: number, minutes: number): PlayerState {
  const p = PROFESSIONS[prof];
  const inv = (p.start ?? []).map(makeItem);
  const weapon = inv.find((i) => ITEMS[i.id].kind === 'weapon') ?? null;
  return {
    prof,
    x,
    y,
    hp: CONFIG.needs.hpMax,
    hunger: 80,
    thirst: 80,
    stamina: p.staminaMax ?? CONFIG.needs.staminaMax,
    panic: 0,
    battery: 100,
    bleeding: false,
    infectDeath: null,
    infectAt: null,
    bitten: false,
    inv: inv.filter((i) => i !== weapon),
    weapon,
    bag: null,
    hotbar: [null, null, null, null, null],
    kills: 0,
    bornAt: minutes,
    skills: { melee: 0, sneak: 0, aid: 0, carp: 0, ...Object.fromEntries(Object.entries(p.skills ?? {}).map(([k, lv]) => [k, CONFIG.skills.levels[lv as number]])) } as Skills,
    poisonUntil: 0,
    phone: 100,
  };
}

export function newGame(seed: number, prof: string): GameState {
  return {
    version: CONFIG.save.version,
    seed,
    minutes: CONFIG.time.startHour * 60,
    player: newPlayer(prof, 0, 0, CONFIG.time.startHour * 60),
    tileOverrides: {},
    doorHp: {},
    containers: {},
    piles: [],
    zombies: null,
    explored: '',
    blood: [],
    daysStarted: 0,
    deaths: 0,
    ended: null,
    clues: [],
    structures: [],
  };
}

export const profOf = (s: GameState) => PROFESSIONS[s.player.prof];
export const weightOf = (items: Item[]) => items.reduce((t, i) => t + ITEMS[i.id].weight, 0);
export const carried = (p: PlayerState) =>
  weightOf(p.inv) + (p.weapon ? ITEMS[p.weapon.id].weight : 0) + (p.bag ? ITEMS[p.bag.id].weight : 0);
export const capacity = (s: GameState) =>
  (CONFIG.player.capacityKg + (s.player.bag ? ITEMS[s.player.bag.id].capacity ?? 0 : 0)) * (profOf(s).capacityMul ?? 1);
export const staminaMax = (s: GameState) => {
  const base = profOf(s).staminaMax ?? CONFIG.needs.staminaMax;
  return s.player.hunger <= 0 ? base * CONFIG.needs.starveStaminaMul : base;
};

export const skillLevel = (p: PlayerState, k: SkillId) => {
  const L = CONFIG.skills.levels;
  let lv = 0;
  while (lv + 1 < L.length && p.skills[k] >= L[lv + 1]) lv++;
  return lv;
};
export const isRotten = (it: Item, minutes: number) => it.exp !== undefined && minutes >= it.exp;

/** 時間工具 */
export const dayOf = (min: number) => Math.floor(min / 1440) + 1;
export const hourOf = (min: number) => (min % 1440) / 60;
export const clock = (min: number) => {
  const m = Math.floor(min % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const deadline = () => (CONFIG.time.lastDay - 1) * 1440 + CONFIG.time.boatLeaveHour * 60;
