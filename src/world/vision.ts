// 視野錐 + 牆影：格仔 Raycast（DDA），只對附近牆角補射線（DESIGN.md §3.3、§9）
import { CONFIG } from '../config';
import { type Grid, isOpaque } from './mapgen';

const T = CONFIG.tile;
const TAU = Math.PI * 2;

/** 一個光源 / 視野來源：中心角、半角、半徑（px） */
export interface ViewCone {
  angle: number;
  half: number;
  radius: number;
}

/** 由 (ox,oy) 向 angle 射線，返回撞牆距離（最遠 maxDist） */
export function castRay(g: Grid, ox: number, oy: number, angle: number, maxDist: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let tx = Math.floor(ox / T);
  let ty = Math.floor(oy / T);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(T / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(T / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (tx + 1) * T - ox : ox - tx * T) / Math.abs(dx));
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (ty + 1) * T - oy : oy - ty * T) / Math.abs(dy));
  let dist = 0;
  while (dist < maxDist) {
    if (tMaxX < tMaxY) {
      dist = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      dist = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (dist < maxDist && isOpaque(g, tx, ty)) return dist;
  }
  return maxDist;
}

const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** 計可見多邊形（世界座標點） */
export function visibilityPolygon(g: Grid, ox: number, oy: number, cone: ViewCone): { x: number; y: number }[] {
  const full = cone.half >= Math.PI;
  const start = full ? 0 : cone.angle - cone.half;
  const span = full ? TAU : cone.half * 2;
  const rel: number[] = [];

  const step = (CONFIG.vision.rayStepDeg * Math.PI) / 180;
  for (let a = 0; a < span; a += step) rel.push(a);
  if (!full) rel.push(span);

  // 附近牆角：每個角射三條（中、左右少少），牆影邊先會準
  const r = cone.radius;
  const x0 = Math.floor((ox - r) / T);
  const x1 = Math.floor((ox + r) / T);
  const y0 = Math.floor((oy - r) / T);
  const y1 = Math.floor((oy + r) / T);
  for (let ty = y0; ty <= y1 + 1; ty++) {
    for (let tx = x0; tx <= x1 + 1; tx++) {
      // 格點 (tx,ty) 係牆角：四周四格有不透光
      if (!(isOpaque(g, tx - 1, ty - 1) || isOpaque(g, tx, ty - 1) || isOpaque(g, tx - 1, ty) || isOpaque(g, tx, ty))) continue;
      const cx = tx * T - ox;
      const cy = ty * T - oy;
      if (cx * cx + cy * cy > r * r) continue;
      const a = norm(Math.atan2(cy, cx) - start);
      for (const e of [-0.0005, 0, 0.0005]) {
        const ae = a + e;
        if (ae >= 0 && ae <= span) rel.push(ae);
      }
    }
  }

  rel.sort((p, q) => p - q);
  const pts: { x: number; y: number }[] = full ? [] : [{ x: ox, y: oy }];
  for (const a of rel) {
    const ang = start + a;
    // 撞牆嗰條射線入牆少少，牆面先會被照亮（canSee 唔加，牆後喪屍照樣見唔到）
    const hit = castRay(g, ox, oy, ang, r);
    const d = hit < r ? Math.min(r, hit + CONFIG.vision.wallBleed) : r;
    pts.push({ x: ox + Math.cos(ang) * d, y: oy + Math.sin(ang) * d });
  }
  return pts;
}

/** 點 (x,y) 喺唔喺任何一個視野來源入面（同多邊形用同一套 Raycast，結果一致） */
export function canSee(g: Grid, ox: number, oy: number, cones: ViewCone[], x: number, y: number): boolean {
  const dx = x - ox;
  const dy = y - oy;
  const dist = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  for (const c of cones) {
    if (dist > c.radius) continue;
    if (c.half < Math.PI) {
      const diff = Math.abs(norm(ang - c.angle + Math.PI) - Math.PI);
      if (diff > c.half) continue;
    }
    if (castRay(g, ox, oy, ang, dist) >= dist) return true;
  }
  return false;
}
