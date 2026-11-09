// 手機觸控（DESIGN.md §4.2）：左下虛擬搖桿（推到盡 = 跑），右下攻擊 / 推撞 / 互動
import { CONFIG } from '../config';

/**
 * 開局用「主要輸入」判斷：手機 / 平板（pointer: coarse）先出觸控掣。
 * 唔好用 'ontouchstart'：Windows 觸控屏手提電腦都有，會令電腦版出咗手機掣、滑鼠攻擊失效。
 * 之後真係用手指撳先切換（見 WorldScene）。
 */
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

/** 顯示 / 收埋觸控掣 */
export const showTouch = (on: boolean) => {
  document.getElementById('touch')!.classList.toggle('hidden', !on);
  document.body.classList.toggle('touch-mode', on);
};

export const stick = { x: 0, y: 0, mag: 0 };

export function setupTouch(on: { attack(): void; shove(): void; use(): void; act2(): void; throw(): void }) {
  const base = document.getElementById('stick')!;
  const knob = base.firstElementChild as HTMLElement;
  const R = CONFIG.touch.joystickRadius;
  let id: number | null = null;
  const move = (e: PointerEvent) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    stick.mag = Math.min(1, d / R);
    stick.x = d ? dx / Math.min(d, R) : 0;
    stick.y = d ? dy / Math.min(d, R) : 0;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const end = () => {
    id = null;
    stick.x = stick.y = stick.mag = 0;
    knob.style.transform = '';
  };
  base.onpointerdown = (e) => {
    id = e.pointerId;
    try {
      base.setPointerCapture(id);
    } catch {
      /* 有啲瀏覽器唔俾 capture，照樣用 */
    }
    move(e);
  };
  base.onpointermove = (e) => e.pointerId === id && move(e);
  base.onpointerup = base.onpointercancel = end;
  const btn = (bid: string, fn: () => void) => {
    document.getElementById(bid)!.onpointerdown = (e) => {
      e.preventDefault();
      fn();
    };
  };
  btn('t-attack', on.attack);
  btn('t-shove', on.shove);
  btn('t-use', on.use);
  btn('t-act2', on.act2);
  btn('t-throw', on.throw);
}
