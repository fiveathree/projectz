// 地圖（手機分頁）：只畫見過嘅格；的士司機一開始全區已知
import { PALETTE as P } from '../config';
import { DEF_BY_INDEX, type Grid } from '../world/mapgen';

const SCALE = 4;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

const colorOf = (ch: string) => {
  if ('#PDHJCK'.includes(ch)) return hex(P.wallTop);
  if (ch === 'W' || ch === 'V') return hex(P.glass);
  if (ch === 'S') return hex(P.sea);
  if (ch === 'E') return '#e0c040';
  if (ch === ',' || ch === '~') return hex(P.asphalt);
  if (ch === 'A' || ch === 'X') return hex(P.neonRed);
  if (ch === '=' || ch === '_' || ch === ':') return hex(P.sidewalk);
  if ('fkrcwxbTtG'.includes(ch)) return hex(P.wood);
  return hex(P.floor);
};

export function drawMap(canvas: HTMLCanvasElement, g: Grid, explored: Uint8Array, px: number, py: number, marks: { x: number; y: number; color: string }[]) {
  canvas.width = g.w * SCALE;
  canvas.height = g.h * SCALE;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < g.tiles.length; i++) {
    if (!(explored[i >> 3] & (1 << (i & 7)))) continue;
    const x = i % g.w;
    const y = (i - x) / g.w;
    c.fillStyle = colorOf(DEF_BY_INDEX[g.tiles[i]].ch);
    c.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
  }
  // 撤離點永遠標示（電台有講）
  c.fillStyle = '#e0c040';
  for (const t of g.evac) c.fillRect((t % g.w) * SCALE, Math.floor(t / g.w) * SCALE, SCALE, SCALE);
  for (const m of marks) {
    c.fillStyle = m.color;
    c.fillRect(m.x * SCALE - 4, m.y * SCALE - 4, 8, 8);
  }
  c.fillStyle = '#39d0d8';
  c.beginPath();
  c.arc(px * SCALE, py * SCALE, 6, 0, Math.PI * 2);
  c.fill();
}
