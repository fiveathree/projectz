// 技能經驗（DESIGN.md Phase 2）：近戰、潛行、急救、木工
import { CONFIG } from '../config';
import { type GameState, SKILL_NAMES, type SkillId, skillLevel } from '../state';

/** 加經驗；升級就返回提示文字 */
export function gainXp(s: GameState, k: SkillId, amount: number): string {
  const before = skillLevel(s.player, k);
  s.player.skills[k] += amount;
  const after = skillLevel(s.player, k);
  return after > before ? `⬆ ${SKILL_NAMES[k]}升到 Lv${after}` : '';
}

const SK = CONFIG.skills;
export const meleeDamageMul = (s: GameState) => 1 + SK.meleeDmg * skillLevel(s.player, 'melee');
export const meleeStaminaMul = (s: GameState) => 1 - SK.meleeStamina * skillLevel(s.player, 'melee');
export const sneakNoiseMul = (s: GameState) => 1 - SK.sneakNoise * skillLevel(s.player, 'sneak');
export const sneakSightMul = (s: GameState) => 1 - SK.sneakSight * skillLevel(s.player, 'sneak');
export const aidHealMul = (s: GameState) => 1 + SK.aidHeal * skillLevel(s.player, 'aid');
export const carpHpMul = (s: GameState) => 1 + CONFIG.build.perCarpHp * skillLevel(s.player, 'carp');
export const carpTimeMul = (s: GameState) => 1 - CONFIG.build.perCarpSpeed * skillLevel(s.player, 'carp');

/** 技能說明（手機 ⓘ 彈窗用） */
export const SKILL_HELP: Record<SkillId, string> = {
  melee: `打中喪屍加經驗。每級：傷害 +${SK.meleeDmg * 100}%、揮動體力 −${SK.meleeStamina * 100}%`,
  sneak: `潛行時附近有喪屍又冇被發現就加經驗。每級：腳步聲 −${SK.sneakNoise * 100}%、喪屍視距 −${SK.sneakSight * 100}%`,
  aid: `用醫療用品、整繃帶加經驗。每級：治療效果 +${SK.aidHeal * 100}%`,
  carp: `釘板、拆傢俬、整木器加經驗。每級：板耐久 +${CONFIG.build.perCarpHp * 100}%、釘板 / 拆嘢快 ${CONFIG.build.perCarpSpeed * 100}%`,
};
