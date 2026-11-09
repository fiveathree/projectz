// 時間、日夜、天氣、七日世界變化（DESIGN.md §2.3、§3.8）
import { CONFIG } from '../config';
import story from '../data/story.json';
import { dayOf, hourOf } from '../state';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm';
const T = CONFIG.time;

/** 每真實秒過幾多遊戲分鐘 */
export const MIN_PER_SEC = 1440 / T.dayRealSec;

export const dayInfo = (min: number) => story.days[Math.min(dayOf(min), T.lastDay) - 1];
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
