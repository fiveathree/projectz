// 喪屍 AI：遊蕩 → 見到玩家 → 追擊（共用流場繞牆）→ 跟丟 → 遊蕩（DESIGN.md §3.4）
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import { type Grid, isSolid } from '../world/mapgen';
import { castRay } from '../world/vision';

const T = CONFIG.tile;
const Z = CONFIG.zombie;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** 流場：由目標格 BFS 出嚟嘅距離表，全部喪屍共用 */
export class FlowField {
  dist: Int32Array;
  private queue: Int32Array;
  target = -1;

  constructor(private g: Grid) {
    this.dist = new Int32Array(g.w * g.h);
    this.queue = new Int32Array(g.w * g.h);
  }

  /** 目標格有變先重算 */
  update(tx: number, ty: number) {
    const { w, h } = this.g;
    const t = ty * w + tx;
    if (t === this.target) return;
    this.target = t;
    this.dist.fill(-1);
    let head = 0;
    let tail = 0;
    this.dist[t] = 0;
    this.queue[tail++] = t;
    while (head < tail) {
      const c = this.queue[head++];
      const cx = c % w;
      const cy = (c - cx) / w;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || isSolid(this.g, nx, ny)) continue;
        // 斜行唔可以切牆角
        if (dx && dy && (isSolid(this.g, cx + dx, cy) || isSolid(this.g, cx, cy + dy))) continue;
        const n = ny * w + nx;
        if (this.dist[n] !== -1) continue;
        this.dist[n] = this.dist[c] + 1;
        this.queue[tail++] = n;
      }
    }
  }

  /** 由 (tx,ty) 下一步應該行去邊格（返回格中心 px），冇路就 null */
  next(tx: number, ty: number): { x: number; y: number } | null {
    const { w } = this.g;
    let best = this.dist[ty * w + tx];
    let bx = -1;
    let by = -1;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (isSolid(this.g, nx, ny)) continue;
      if (dx && dy && (isSolid(this.g, tx + dx, ty) || isSolid(this.g, tx, ty + dy))) continue;
      const d = this.dist[ny * w + nx];
      if (d >= 0 && (best < 0 || d < best)) {
        best = d;
        bx = nx;
        by = ny;
      }
    }
    return bx < 0 ? null : { x: (bx + 0.5) * T, y: (by + 0.5) * T };
  }
}

type ZSprite = Phaser.Physics.Arcade.Sprite & { body: Phaser.Physics.Arcade.Body };

interface ZState {
  sprite: ZSprite;
  /** 仲記得玩家幾多秒（>0 = 追擊中） */
  chase: number;
  turnIn: number;
  /** 想行嘅速度 */
  vx: number;
  vy: number;
  /** 加埋分隔之後嘅實際速度 */
  sx: number;
  sy: number;
}

export class Zombies {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly list: ZState[] = [];
  private flow: FlowField;
  private sightCursor = 0;

  constructor(scene: Phaser.Scene, private g: Grid, private rand: () => number, px: number, py: number) {
    this.flow = new FlowField(g);
    this.group = scene.physics.add.group();
    const minD = Z.minSpawnTiles * T;
    while (this.list.length < Z.count) {
      const tx = Math.floor(rand() * g.w);
      const ty = Math.floor(rand() * g.h);
      if (isSolid(g, tx, ty)) continue;
      const x = (tx + 0.5) * T;
      const y = (ty + 0.5) * T;
      if (Math.hypot(x - px, y - py) < minD) continue;
      const s = this.group.create(x, y, 'zombie') as ZSprite;
      s.setDepth(10).setCircle(Z.radius, s.width / 2 - Z.radius, s.height / 2 - Z.radius);
      s.setCollideWorldBounds(true);
      const z: ZState = { sprite: s, chase: 0, turnIn: 0, vx: 0, vy: 0, sx: 0, sy: 0 };
      this.list.push(z);
    }
  }

  get chasingCount() {
    return this.list.filter((z) => z.chase > 0).length;
  }

  update(dt: number, px: number, py: number, pr: number, flashlight: boolean) {
    const ptx = Math.floor(px / T);
    const pty = Math.floor(py / T);
    this.flow.update(ptx, pty);

    // 分攤：每幀只做部分喪屍嘅視線 Raycast
    const sight = (flashlight ? Z.sightTilesFlashlight : Z.sightTiles) * T;
    for (let i = 0; i < Z.sightChecksPerFrame; i++) {
      const z = this.list[this.sightCursor];
      this.sightCursor = (this.sightCursor + 1) % this.list.length;
      const dx = px - z.sprite.x;
      const dy = py - z.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d <= sight && castRay(this.g, z.sprite.x, z.sprite.y, Math.atan2(dy, dx), d) >= d) z.chase = Z.chaseMemorySec;
    }

    for (const z of this.list) {
      const s = z.sprite;
      if (z.chase > 0) {
        z.chase -= dt;
        const tx = Math.floor(s.x / T);
        const ty = Math.floor(s.y / T);
        // 同玩家同一格或者隔籬格：直接撲過去；否則跟流場
        const near = Math.abs(tx - ptx) <= 1 && Math.abs(ty - pty) <= 1;
        const goal = near ? { x: px, y: py } : this.flow.next(tx, ty);
        if (goal) this.aim(z, Math.atan2(goal.y - s.y, goal.x - s.x), Z.chaseSpeed);
        else z.vx = z.vy = 0;
      } else {
        z.turnIn -= dt;
        const b = s.body.blocked;
        if (z.turnIn <= 0 || b.left || b.right || b.up || b.down) {
          z.turnIn = Z.wanderTurnMinSec + this.rand() * (Z.wanderTurnMaxSec - Z.wanderTurnMinSec);
          this.aim(z, this.rand() * Math.PI * 2, Z.wanderSpeed);
        }
      }
    }
    this.separate(px, py, pr);
  }

  private aim(z: ZState, a: number, speed: number) {
    z.vx = Math.cos(a) * speed;
    z.vy = Math.sin(a) * speed;
    z.sprite.rotation = a;
  }

  /**
   * 軟分隔：只改速度、唔直接推位置，咁 Arcade 撞牆永遠食得住，一大群都唔會擠入牆。
   * 喪屍之間互相推開；貼住玩家就唔再向玩家行。
   */
  private separate(px: number, py: number, pr: number) {
    const n = this.list.length;
    const minD = Z.radius * 2;
    for (const z of this.list) {
      z.sx = z.vx;
      z.sy = z.vy;
    }
    for (let i = 0; i < n; i++) {
      const a = this.list[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.list[j];
        const dx = b.sprite.x - a.sprite.x;
        const dy = b.sprite.y - a.sprite.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (Z.separationSpeed * (minD - d)) / minD / d;
        a.sx -= dx * push;
        a.sy -= dy * push;
        b.sx += dx * push;
        b.sy += dy * push;
      }
    }
    const touch = Z.radius + pr;
    for (const z of this.list) {
      const dx = px - z.sprite.x;
      const dy = py - z.sprite.y;
      const d = Math.hypot(dx, dy);
      const toward = (z.sx * dx + z.sy * dy) / (d || 1);
      if (d < touch && toward > 0) {
        z.sx -= (dx / d) * toward;
        z.sy -= (dy / d) * toward;
      }
      z.sprite.body.setVelocity(z.sx, z.sy);
    }
  }
}
