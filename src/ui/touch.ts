// 手機觸控（DESIGN.md §4.2）：左下虛擬搖桿（推到盡 = 跑），右下攻擊 / 推撞 / 互動
import { CONFIG } from '../config';

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const stick = { x: 0, y: 0, mag: 0 };

export function setupTouch(on: { attack(): void; shove(): void; use(): void; act2(): void; throw(): void }) {
  document.getElementById('touch')!.classList.remove('hidden');
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
