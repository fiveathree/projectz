// 頂部 HUD、狀態、互動提示、進度條、快捷欄、提示訊息（純 DOM 疊層）
import { ITEMS, type Item } from '../state';

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);

export function showHud(on: boolean) {
  for (const id of ['hud', 'status', 'hotbar']) show(id, on);
  if (!on) {
    show('prompt', false);
    show('progress', false);
  }
}

export interface HudView {
  day: number;
  title: string;
  time: string;
  weather: string;
  hp: number;
  hunger: number;
  thirst: number;
  stamina: number;
  staminaMax: number;
  panic: number;
  battery: number;
  flashlight: boolean;
  sneak: boolean;
  status: string[];
  fps: number;
}

const WEATHER: Record<string, string> = { clear: '☀', cloudy: '☁', rain: '☔', storm: '🌀' };
const BARS: [keyof HudView, string, string][] = [
  ['hp', '生命', '#e0384f'],
  ['hunger', '飢', '#e0a040'],
  ['thirst', '渴', '#39a0d8'],
  ['stamina', '體', '#7dc06a'],
  ['panic', '驚', '#c04ad0'],
  ['battery', '🔋', '#e0c040'],
];
let last = 0;

export function renderHud(v: HudView) {
  const now = performance.now();
  if (now - last < 200) return;
  last = now;
  $('clock').textContent = `第${v.day}日 ${v.title} ${v.time} ${WEATHER[v.weather] ?? ''}  ${Math.round(v.fps)}fps`;
  $('bars').innerHTML = BARS.map(([k, label, color]) => {
    const max = k === 'stamina' ? v.staminaMax : 100;
    const pct = Math.max(0, Math.min(100, ((v[k] as number) / max) * 100));
    return `<div class="bar">${label}<i><b style="width:${pct}%;background:${color}"></b></i></div>`;
  }).join('');
  $('status').innerHTML = v.status.map((s) => `<span>${s}</span>`).join('');
  for (const b of document.querySelectorAll<HTMLButtonElement>('#topbtns button')) {
    if (b.dataset.act === 'flash') b.classList.toggle('on', v.flashlight);
    if (b.dataset.act === 'sneak') b.classList.toggle('on', v.sneak);
  }
}

export function setPrompt(text: string | null) {
  show('prompt', !!text);
  if (text) $('prompt').textContent = text;
  show('t-use', !!text);
}

export function setProgress(frac: number | null) {
  show('progress', frac !== null);
  if (frac !== null) ($('progress').firstElementChild as HTMLElement).style.width = `${frac * 100}%`;
}

export function toast(msg: string) {
  const d = document.createElement('div');
  d.textContent = msg;
  $('toast').appendChild(d);
  setTimeout(() => d.remove(), 3500);
  while ($('toast').children.length > 4) $('toast').firstElementChild!.remove();
}

/** 快捷欄：每格記住一種物品；拖物品落去就設定 */
export function renderHotbar(slots: (string | null)[], inv: Item[], weapon: Item | null, onUse: (i: number) => void, onAssign: (i: number, id: string) => void) {
  const el = $('hotbar');
  el.innerHTML = slots
    .map((id, i) => {
      const count = id ? inv.filter((it) => it.id === id).length + (weapon?.id === id ? 1 : 0) : 0;
      const label = id ? `${ITEMS[id].name}${count > 1 ? ` ×${count}` : ''}` : '';
      return `<div data-i="${i}" style="${id && !count ? 'opacity:.4' : ''}"><small>${i + 1}</small>${label}</div>`;
    })
    .join('');
  el.querySelectorAll<HTMLDivElement>('div').forEach((d) => {
    const i = Number(d.dataset.i);
    d.onclick = () => onUse(i);
    d.ondragover = (e) => {
      e.preventDefault();
      d.classList.add('over');
    };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = (e) => {
      e.preventDefault();
      const id = e.dataTransfer?.getData('text/item-id');
      if (id) onAssign(i, id);
    };
  });
}
