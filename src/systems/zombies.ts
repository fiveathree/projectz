// 喪屍 AI（DESIGN.md §3.4）：遊蕩 → 聽到聲 → 前往聲源 → 見到玩家 → 追擊 → 跟丟 → 遊蕩
// 全部喪屍共用流場；遠離玩家嘅用粗略模擬（每秒一步、唔碰撞）
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import { type Grid, isSolid, tileIndex, zombieBlocked } from '../world/mapgen';
import { castRay } from '../world/vision';
import type { Item, ZombieSave } from '../state';

const T = CONFIG.tile;
const Z = CONFIG.zombie;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const DOOR_CLOSED = tileIndex('D');
const PAST_SELF_TINT = 0x9fb8ff;

/** 流場：由目標格 BFS 出嚟嘅距離表 */
class FlowField {
  dist: Int32Array;
  private queue: Int32Array;
  target = -1;
  version = -1;

  constructor(private g: Grid) {
    this.dist = new Int32Array(g.w * g.h);
    this.queue = new Int32Array(g.w * g.h);
  }

  update(t: number, version: number) {
    if (t === this.target && version === this.version) return;
    this.target = t;
    this.version = version;
    const { w, h } = this.g;
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
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || zombieBlocked(this.g, nx, ny)) continue;
        if (dx && dy && (isSolid(this.g, cx + dx, cy) || isSolid(this.g, cx, cy + dy))) continue;
        const n = ny * w + nx;
        if (this.dist[n] !== -1) continue;
        this.dist[n] = this.dist[c] + 1;
        this.queue[tail++] = n;
      }
    }
  }

  /** 下一格 index；冇路 = -1 */
  next(tx: number, ty: number): number {
    const { w } = this.g;
    let best = this.dist[ty * w + tx];
    let bi = -1;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (zombieBlocked(this.g, nx, ny)) continue;
      if (dx && dy && (isSolid(this.g, tx + dx, ty) || isSolid(this.g, tx, ty + dy))) continue;
      const d = this.dist[ny * w + nx];
      if (d >= 0 && (best < 0 || d < best)) {
        best = d;
        bi = ny * w + nx;
      }
    }
    return bi;
  }
}

type ZSprite = Phaser.Physics.Arcade.Sprite & { body: Phaser.Physics.Arcade.Body };
export type ZMode = 'wander' | 'investigate' | 'chase' | 'down';

export interface Zombie {
  sprite: ZSprite;
  hp: number;
  mode: ZMode;
  /** chase：仲記得玩家幾多秒；down：仲瞓幾耐 */
  timer: number;
  /** investigate 目標格 */
  target: number;
  turnIn: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  stagger: number;
  kx: number;
  ky: number;
  attackCd: number;
  coarse: number;
  active: boolean;
  carry?: Item[];
}

export interface ZWorld {
  grid: Grid;
  /** 改過格就 +1，流場會重算 */
  tilesVersion: number;
  bashDoor(tile: number, amount: number): void;
  onAttack(z: Zombie): void;
}

export class Zombies {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly list: Zombie[] = [];
  private playerFlow: FlowField;
  private flows = new Map<number, FlowField>();
  private sightCursor = 0;
  private buckets = new Map<number, Zombie[]>();

  constructor(scene: Phaser.Scene, private w: ZWorld, private rand: () => number) {
    this.playerFlow = new FlowField(w.grid);
    this.group = scene.physics.add.group();
  }

  spawn(x: number, y: number, hp?: number, carry?: Item[]): Zombie {
    const s = this.group.create(x, y, 'zombie') as ZSprite;
    s.setDepth(10).setCircle(Z.radius, s.width / 2 - Z.radius, s.height / 2 - Z.radius).setCollideWorldBounds(true);
    if (carry) s.setTint(PAST_SELF_TINT); // 上一輪嘅你
    const z: Zombie = {
      sprite: s,
      hp: hp ?? Z.hp + (this.rand() * 2 - 1) * Z.hpVariance,
      mode: 'wander',
      timer: 0,
      target: -1,
      turnIn: 0,
      vx: 0,
      vy: 0,
      sx: 0,
      sy: 0,
      stagger: 0,
      kx: 0,
      ky: 0,
      attackCd: 0,
      coarse: this.rand() * Z.coarseStepSec,
      active: true,
      carry,
    };
    this.list.push(z);
    return z;
  }

  /** 喺隨機行得嘅格生喪屍，避開某點附近；area 可以限制範圍 */
  spawnRandom(n: number, avoidX: number, avoidY: number, minTiles: number, area?: (tx: number, ty: number) => boolean): Zombie[] {
    const g = this.w.grid;
    const made: Zombie[] = [];
    for (let tries = 0; made.length < n && tries < n * 80; tries++) {
      const tx = Math.floor(this.rand() * g.w);
      const ty = Math.floor(this.rand() * g.h);
      if (isSolid(g, tx, ty) || (area && !area(tx, ty))) continue;
      const x = (tx + 0.5) * T;
      const y = (ty + 0.5) * T;
      if (Math.hypot(x - avoidX, y - avoidY) < minTiles * T) continue;
      made.push(this.spawn(x, y));
    }
    return made;
  }

  kill(z: Zombie) {
    this.list.splice(this.list.indexOf(z), 1);
    z.sprite.destroy();
  }

  toSave(): ZombieSave[] {
    return this.list.map((z) => ({ x: Math.round(z.sprite.x), y: Math.round(z.sprite.y), hp: Math.round(z.hp), carry: z.carry }));
  }

  private tileAt(x: number, y: number) {
    return Math.floor(y / T) * this.w.grid.w + Math.floor(x / T);
  }

  /** 噪音：半徑內未追緊人嘅喪屍走去聲源 */
  hear(x: number, y: number, radiusPx: number) {
    if (isSolid(this.w.grid, Math.floor(x / T), Math.floor(y / T))) return;
    const t = this.tileAt(x, y);
    for (const z of this.list) {
      if (z.mode === 'chase' || z.mode === 'down') continue;
      if (Math.hypot(z.sprite.x - x, z.sprite.y - y) > radiusPx) continue;
      z.mode = 'investigate';
      z.target = t;
    }
  }

  /** 將一群喪屍引去某點（屍群遷徙） */
  sendTo(list: Zombie[], x: number, y: number) {
    const t = this.tileAt(x, y);
    for (const z of list) {
      z.mode = 'investigate';
      z.target = t;
    }
  }

  knock(z: Zombie, fromX: number, fromY: number, power: number, down: boolean) {
    const a = Math.atan2(z.sprite.y - fromY, z.sprite.x - fromX);
    z.kx = Math.cos(a) * Z.knockback * power;
    z.ky = Math.sin(a) * Z.knockback * power;
    z.stagger = Z.staggerSec;
    if (down) {
      z.mode = 'down';
      z.timer = Z.downSec;
      z.sprite.setScale(1, 0.55).setTint(0x556655);
    }
  }

  get chasingCount() {
    let n = 0;
    for (const z of this.list) if (z.mode === 'chase') n++;
    return n;
  }

  private flowTo(t: number): FlowField {
    let f = this.flows.get(t);
    if (!f) {
      if (this.flows.size >= Z.flowCache) {
        const oldest = this.flows.keys().next().value!;
        f = this.flows.get(oldest)!;
        this.flows.delete(oldest);
      } else f = new FlowField(this.w.grid);
      this.flows.set(t, f);
    }
    f.update(t, this.w.tilesVersion);
    return f;
  }

  update(dt: number, px: number, py: number, pr: number, sightPx: number, playerAlive: boolean) {
    const g = this.w.grid;
    const ptx = Math.floor(px / T);
    const pty = Math.floor(py / T);
    const pt = pty * g.w + ptx;
    if (playerAlive) this.playerFlow.update(pt, this.w.tilesVersion);
    const activeR = Z.activeTiles * T;

    // 視線：每幀分攤
    const n = this.list.length;
    for (let i = 0; playerAlive && i < Math.min(Z.sightChecksPerFrame, n); i++) {
      this.sightCursor = (this.sightCursor + 1) % n;
      const z = this.list[this.sightCursor];
      if (z.mode === 'down') continue;
      const dx = px - z.sprite.x;
      const dy = py - z.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d <= sightPx && castRay(g, z.sprite.x, z.sprite.y, Math.atan2(dy, dx), d) >= d) {
        z.mode = 'chase';
        z.timer = Z.chaseMemorySec;
      }
    }

    for (const z of this.list) {
      const s = z.sprite;
      const dist = Math.hypot(px - s.x, py - s.y);
      const shouldBeActive = dist < activeR;
      if (shouldBeActive !== z.active) {
        z.active = shouldBeActive;
        s.body.enable = shouldBeActive;
        if (shouldBeActive) {
          // body.reset 會用 getTopLeft（計埋旋轉），先歸零旋轉，否則碰撞體會偏位甚至瞬移入牆
          const r = s.rotation;
          s.rotation = 0;
          s.body.reset(s.x, s.y);
          s.rotation = r;
        }
      }
      z.attackCd -= dt;

      if (z.mode === 'down') {
        z.timer -= dt;
        z.vx = z.vy = 0;
        if (z.timer <= 0) {
          z.mode = 'wander';
          s.setScale(1);
          if (z.carry) s.setTint(PAST_SELF_TINT);
          else s.clearTint();
        }
      } else if (z.mode === 'chase') {
        z.timer -= dt;
        if (z.timer <= 0 || !playerAlive) {
          // 跟丟：去最後見到嘅位置搵
          z.mode = 'investigate';
          z.target = pt;
        }
      }

      if (!z.active) {
        this.coarseStep(z, dt);
        continue;
      }

      const tx = Math.floor(s.x / T);
      const ty = Math.floor(s.y / T);
      if (z.mode === 'chase') {
        const near = Math.abs(tx - ptx) <= 1 && Math.abs(ty - pty) <= 1;
        if (near) this.aim(z, Math.atan2(py - s.y, px - s.x), Z.chaseSpeed);
        else this.follow(z, this.playerFlow, tx, ty, dt);
        if (dist <= Z.radius + pr + Z.attackRange && z.attackCd <= 0 && z.stagger <= 0) {
          z.attackCd = Z.attackCooldown;
          this.w.onAttack(z);
        }
      } else if (z.mode === 'investigate') {
        if (ty * g.w + tx === z.target) {
          z.mode = 'wander';
          z.turnIn = 0;
        } else this.follow(z, this.flowTo(z.target), tx, ty, dt);
      } else if (z.mode === 'wander') {
        z.turnIn -= dt;
        const b = s.body.blocked;
        if (z.turnIn <= 0 || b.left || b.right || b.up || b.down) {
          z.turnIn = Z.wanderTurnMinSec + this.rand() * (Z.wanderTurnMaxSec - Z.wanderTurnMinSec);
          if (this.rand() < 0.3) z.vx = z.vy = 0; // 企定
          else this.aim(z, this.rand() * Math.PI * 2, Z.wanderSpeed);
        }
      }
    }
    this.separate(px, py, pr, dt, playerAlive);
  }

  private follow(z: Zombie, f: FlowField, tx: number, ty: number, dt: number) {
    const g = this.w.grid;
    const ni = f.next(tx, ty);
    if (ni < 0) {
      z.vx = z.vy = 0;
      if (z.mode === 'investigate') z.mode = 'wander';
      return;
    }
    const nx = ni % g.w;
    const ny = (ni - nx) / g.w;
    if (g.tiles[ni] === DOOR_CLOSED) this.w.bashDoor(ni, Z.doorBashPerSec * dt);
    const speed = z.mode === 'chase' ? Z.chaseSpeed : Z.wanderSpeed * 1.4;
    this.aim(z, Math.atan2((ny + 0.5) * T - z.sprite.y, (nx + 0.5) * T - z.sprite.x), speed);
  }

  /** 粗略模擬：每秒跳一兩格，唔做碰撞 */
  private coarseStep(z: Zombie, dt: number) {
    z.coarse -= dt;
    if (z.coarse > 0) return;
    z.coarse += Z.coarseStepSec;
    const g = this.w.grid;
    const s = z.sprite;
    let tx = Math.floor(s.x / T);
    let ty = Math.floor(s.y / T);
    const moving = z.mode === 'chase' || z.mode === 'investigate';
    const steps = Math.max(1, Math.round(((moving ? Z.chaseSpeed * 0.5 : Z.wanderSpeed) * Z.coarseStepSec) / T));
    for (let i = 0; i < steps; i++) {
      let ni: number;
      if (moving) {
        const f = z.mode === 'chase' ? this.playerFlow : this.flowTo(z.target);
        ni = f.next(tx, ty);
        if (ni < 0 || ni === z.target) z.mode = 'wander';
      } else {
        if (this.rand() < 0.4) break;
        const [dx, dy] = DIRS[Math.floor(this.rand() * 4)];
        ni = isSolid(g, tx + dx, ty + dy) ? -1 : (ty + dy) * g.w + tx + dx;
      }
      if (ni < 0) break;
      if (g.tiles[ni] === DOOR_CLOSED) {
        this.w.bashDoor(ni, Z.doorBashPerSec * Z.coarseStepSec);
        break;
      }
      tx = ni % g.w;
      ty = (ni - tx) / g.w;
    }
    s.setPosition((tx + 0.5) * T, (ty + 0.5) * T);
  }

  private aim(z: Zombie, a: number, speed: number) {
    z.vx = Math.cos(a) * speed;
    z.vy = Math.sin(a) * speed;
    z.sprite.rotation = a;
  }

  /**
   * 軟分隔：只改速度、唔直接推位置，咁 Arcade 撞牆永遠食得住，一大群都唔會擠入牆。
   * 用格仔分桶，只比較隔籬；貼住玩家就唔再向玩家行。
   */
  private separate(px: number, py: number, pr: number, dt: number, playerAlive: boolean) {
    const minD = Z.radius * 2;
    const W = this.w.grid.w;
    for (const b of this.buckets.values()) b.length = 0;
    for (const z of this.list) {
      if (!z.active) continue;
      if (z.stagger > 0) {
        z.stagger -= dt;
        z.sx = z.kx;
        z.sy = z.ky;
      } else {
        z.sx = z.vx;
        z.sy = z.vy;
      }
      const k = this.tileAt(z.sprite.x, z.sprite.y);
      const b = this.buckets.get(k);
      if (b) b.push(z);
      else this.buckets.set(k, [z]);
    }
    for (const a of this.list) {
      if (!a.active) continue;
      const k = this.tileAt(a.sprite.x, a.sprite.y);
      let pushes = 0; // 屍群擠成一嚿時限住次數，唔好 O(n²)
      for (let oy = -1; oy <= 1 && pushes < Z.separationMaxNeighbours; oy++)
        for (let ox = -1; ox <= 1 && pushes < Z.separationMaxNeighbours; ox++) {
          const b = this.buckets.get(k + oy * W + ox);
          if (!b) continue;
          for (const o of b) {
            if (o === a) continue;
            if (pushes >= Z.separationMaxNeighbours) break;
            const dx = o.sprite.x - a.sprite.x;
            const dy = o.sprite.y - a.sprite.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD) continue;
            const d = Math.sqrt(d2) || 0.01;
            const push = (Z.separationSpeed * (minD - d)) / minD / d;
            a.sx -= dx * push;
            a.sy -= dy * push;
            pushes++;
          }
        }
    }
    const touch = Z.radius + pr;
    for (const z of this.list) {
      if (!z.active) continue;
      if (playerAlive) {
        const dx = px - z.sprite.x;
        const dy = py - z.sprite.y;
        const d = Math.hypot(dx, dy);
        const toward = (z.sx * dx + z.sy * dy) / (d || 1);
        if (d < touch && toward > 0) {
          z.sx -= (dx / d) * toward;
          z.sy -= (dy / d) * toward;
        }
      }
      z.sprite.body.setVelocity(z.sx, z.sy);
    }
  }
}
