// 時間、日夜、天氣、七日世界變化（DESIGN.md §2.3、§3.8）
import { CONFIG } from '../config';
import story from '../data/story.json';
import { dayOf, hourOf } from '../state';
import { mulberry32 } from '../world/mapgen';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm';
const T = CONFIG.time;

/** 每真實秒過幾多遊戲分鐘（自訂難度：一日幾多分鐘） */
export const minPerSec = (dayMin: number) => 1440 / (dayMin * 60);
export const MIN_PER_SEC = minPerSec(T.dayRealSec / 60);

export type SandboxEvent = 'horde' | 'raiders' | 'storm' | 'heli' | 'calm';
/** 第 7 日之後（沙盒）每日隨機事件，同一個種子每次一樣 */
export function sandboxEvent(seed: number, day: number): SandboxEvent {
  const ev = CONFIG.sandbox.events as readonly string[];
  return ev[Math.floor(mulberry32((seed ^ Math.imul(day, 2654435761)) >>> 0)() * ev.length)] as SandboxEvent;
}
let worldSeed = 0;
/** 開新世界時設定，令 dayInfo 知道沙盒事件 */
export const setWorldSeed = (seed: number) => (worldSeed = seed);

export const dayInfo = (min: number) => {
  const d = dayOf(min);
  return d <= T.lastDay ? story.days[d - 1] : story.sandbox[sandboxEvent(worldSeed, d)];
};
export const weatherOf = (min: number) => dayInfo(min).weather as Weather;
export const isNight = (min: number) => {
  const h = hourOf(min);
  return h < T.dawnHour || h >= T.duskHour;
};
/** 第 3 日起斷水、第 5 日起斷電 */
export const waterOn = (min: number) => dayOf(min) < 3;
export const powerOn = (min: number) => dayOf(min) < 5;
export const isStorm = (min: number) => weatherOf(min) === 'storm';

/** 0 = 白天、1 = 黑夜，黎明黃昏一個鐘漸變 */
export function nightness(min: number) {
  const h = hourOf(min);
  if (h >= T.dawnHour + 1 && h < T.duskHour - 1) return 0;
  if (h >= T.duskHour || h < T.dawnHour) return 1;
  return h < 12 ? T.dawnHour + 1 - h : h - (T.duskHour - 1);
}

/** 視野以外有幾黑 */
export function darkness(min: number) {
  const L = CONFIG.light;
  const day = isStorm(min) ? L.storm : L.day;
  const night = powerOn(min) ? L.night : L.nightNoPower;
  const n = nightness(min);
  return day + (night - day) * n;
}

/** 視錐長度（格） */
export function coneTiles(min: number, nightVisionBonus: number) {
  const V = CONFIG.vision;
  const n = nightness(min);
  const t = V.coneTilesDay + (V.coneTilesNight + nightVisionBonus - V.coneTilesDay) * n;
  return isStorm(min) ? t * V.stormMul : t;
}
