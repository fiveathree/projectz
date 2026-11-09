// 頂部細 HUD（純 DOM 疊層）
const el = document.getElementById('hud')!;
let last = 0;

export function hud(s: { fps: number; flashlight: boolean; seen: number; total: number; chasing: number }) {
  const now = performance.now();
  if (now - last < 250) return;
  last = now;
  el.textContent =
    `第1日 23:00 ☔　FPS ${Math.round(s.fps)}　電筒：${s.flashlight ? '開' : '關'}` +
    `　視野內喪屍 ${s.seen}/${s.total}　追緊你 ${s.chasing}`;
}
