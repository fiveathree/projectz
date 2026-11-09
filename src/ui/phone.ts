// 角色部手機（DESIGN.md §5.2 第 8 點）：地圖、筆記、電台、技能；斷電後要用電池
// 面板固定大小、分頁掣位置固定（切換分頁唔會郁）
const el = document.getElementById('phone')!;
export type PhoneTab = 'map' | 'notes' | 'radio' | 'skills';
let tab: PhoneTab = 'map';
let onTab: ((t: PhoneTab) => void) | null = null;

export const phoneOpen = () => !el.classList.contains('hidden');
export const phoneTab = () => tab;
export const phoneCanvas = () => el.querySelector<HTMLCanvasElement>('[data-tab="map"] canvas')!;

export function openPhone(t: PhoneTab, changed: (t: PhoneTab) => void) {
  onTab = changed;
  el.classList.remove('hidden');
  setTab(t);
}
export const closePhone = () => el.classList.add('hidden');

function setTab(t: PhoneTab) {
  tab = t;
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((d) => d.classList.toggle('hidden', d.dataset.tab !== t));
  el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  onTab?.(t);
}
el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => (b.onclick = () => setTab(b.dataset.t as PhoneTab)));

export function renderPhone(v: { clock: string; battery: number; notes: string; radio: string; skills: string }) {
  document.getElementById('ph-clock')!.textContent = v.clock;
  document.getElementById('ph-batt')!.textContent = `🔋 ${Math.round(v.battery)}%`;
  const dead = v.battery <= 0;
  el.querySelector('.ph-dead')!.classList.toggle('hidden', !dead);
  el.querySelector('.ph-body')!.classList.toggle('off', dead);
  const set = (t: string, html: string) => {
    const d = el.querySelector<HTMLElement>(`[data-tab="${t}"]`)!;
    if (d.innerHTML !== html) d.innerHTML = html;
  };
  set('notes', v.notes);
  set('radio', v.radio);
  set('skills', v.skills);
}
