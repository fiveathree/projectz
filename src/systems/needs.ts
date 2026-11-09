// 生存數值（DESIGN.md §3.1）：生命、飢餓、口渴、體力、驚恐 + 出血、感染
import { CONFIG } from '../config';
import { type GameState, profOf, staminaMax } from '../state';

const N = CONFIG.needs;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface NeedsCtx {
  running: boolean;
  /** 附近見到幾多隻喪屍 */
  zombiesNear: number;
  dark: boolean;
  flashlight: boolean;
}

/** 返回死因（未死 = null） */
export function tickNeeds(s: GameState, dtSec: number, dtMin: number, ctx: NeedsCtx): string | null {
  const p = s.player;
  const prof = profOf(s);
  p.hunger = clamp(p.hunger - N.hungerPerMin * dtMin * (prof.hungerMul ?? 1));
  p.thirst = clamp(p.thirst - N.thirstPerMin * dtMin);

  let cause: string | null = null;
  if (p.hunger <= 0) {
    p.hp -= N.starveHpPerMin * dtMin;
    cause = '餓死';
  }
  if (p.thirst <= 0) {
    p.hp -= N.dehydrateHpPerMin * dtMin;
    cause = '渴死';
  }
  if (p.bleeding) {
    p.hp -= N.bleedHpPerSec * dtSec;
    cause = '失血過多';
  }
  if (p.infectDeath !== null && p.infectAt !== null) {
    // 感染：發燒之後生命上限慢慢跌到零
    const total = p.infectDeath - p.infectAt;
    const left = p.infectDeath - s.minutes;
    const cap = left <= 0 ? 0 : (N.hpMax * left) / (total - N.feverShowMin);
    if (s.minutes - p.infectAt > N.feverShowMin && cap < p.hp) {
      p.hp = cap;
      cause = '潮病發作';
    }
  } else if (!p.bleeding && p.hunger > N.regenNeedsAbove && p.thirst > N.regenNeedsAbove) {
    p.hp += N.regenHpPerMin * dtMin;
  }
  p.hp = clamp(p.hp, 0, N.hpMax);

  const smax = staminaMax(s);
  p.stamina = clamp(p.stamina + (ctx.running ? -N.runStaminaPerSec : N.staminaRegenPerSec) * dtSec, 0, smax);

  const panicUp = (ctx.zombiesNear * N.panicPerZombie + (ctx.dark && !ctx.flashlight ? N.panicDarkPerSec : 0)) * (prof.panicMul ?? 1);
  p.panic = clamp(p.panic + (panicUp > 0 ? panicUp : -N.panicDecayPerSec) * dtSec);

  if (ctx.flashlight) p.battery = clamp(p.battery - N.flashDrainPerSec * dtSec);
  return p.hp <= 0 ? cause ?? '傷重' : null;
}

export function statusList(s: GameState): string[] {
  const p = s.player;
  const out: string[] = [];
  if (p.bleeding) out.push('🩸 出血');
  if (p.infectAt !== null && s.minutes - p.infectAt > N.feverShowMin) out.push('🤒 發燒');
  if (p.bitten) out.push('🦷 咬傷');
  if (p.hunger <= 15) out.push('🍜 好肚餓');
  if (p.thirst <= 15) out.push('💧 好口渴');
  if (p.panic >= N.panicShakeAt) out.push('😱 驚恐');
  if (p.battery <= 0) out.push('🔋 冇電');
  return out;
}
