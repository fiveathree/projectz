// 人類（DESIGN.md Phase 3）：可以招募嘅倖存者（跟隨 / 守位 / 幫手打）同敵對掠奪者
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import { type Grid, isSolid, tileIndex } from '../world/mapgen';
import { castRay } from '../world/vision';
import { ITEMS, type HumanSave } from '../state';
import { FlowField, type Zombie, type Zombies } from './zombies';

const T = CONFIG.tile;
const HC = CONFIG.humans;
const DOOR = tileIndex('D');
/** 人類識開門，但唔會爬窗 */
const humanBlocked = (g: Grid, x: number, y: number) => isSolid(g, x, y) && g.tiles[y * g.w + x] !== DOOR;

type HSprite = Phaser.Physics.Arcade.Sprite & { body: Phaser.Physics.Arcade.Body };
export interface Human extends HumanSave {
  sprite: HSprite;
  label: Phaser.GameObjects.Text | null;
  cd: number;
  turnIn: number;
  /** 掠奪者：仲記得玩家幾多秒 */
  alert: number;
}

export interface HWorld {
  grid: Grid;
  tilesVersion: number;
  zombies: Zombies;
  hurtPlayer(dmg: number, by: string): void;
  killZombie(z: Zombie): void;
  onHumanDown(h: Human): void;
  noise(x: number, y: number, tiles: number): void;
  openDoor(tile: number): void;
}

export class Humans {
  readonly list: Human[] = [];
  readonly group: Phaser.Physics.Arcade.Group;
  private flow: FlowField;

  constructor(private scene: Phaser.Scene, private w: HWorld, private rand: () => number) {
    this.group = scene.physics.add.group();
    this.flow = new FlowField(w.grid, humanBlocked);
  }

  spawn(h: HumanSave): Human {
    const raider = h.faction === 'raider';
    const key = raider ? 'raider' : 'ally';
    const v = raider ? 0 : Math.abs(h.id.charCodeAt(0)) % 2;
    const s = this.group.create(h.x, h.y, key, v * 2) as HSprite;
    s.setDepth(10.5).setCircle(5, s.width / 2 - 5, s.height / 2 - 5).setCollideWorldBounds(true);
    s.play({ key: `${key}${v}-walk` });
    const label = raider
      ? null
      : this.scene.add
          .text(h.x, h.y - 12, h.name, { fontFamily: 'Cubic11, sans-serif', fontSize: '8px', color: '#cfe3ea', stroke: '#07090d', strokeThickness: 2, resolution: 4 })
          .setOrigin(0.5, 1)
          .setDepth(11.5);
    const hu: Human = { ...h, sprite: s, label, cd: 0, turnIn: 0, alert: 0 };
    this.list.push(hu);
    return hu;
  }

  remove(h: Human) {
    this.list.splice(this.list.indexOf(h), 1);
    h.sprite.destroy();
    h.label?.destroy();
  }

  toSave(h: Human): HumanSave {
    const { sprite, label, cd, turnIn, alert, ...rest } = h;
    return { ...rest, x: Math.round(sprite.x), y: Math.round(sprite.y), hp: Math.round(h.hp) };
  }

  /** 最近嘅喪屍（同埋盟友眼中嘅掠奪者） */
  private nearestEnemy(h: Human, r: number): { x: number; y: number; z?: Zombie; hu?: Human } | null {
    let best: { x: number; y: number; z?: Zombie; hu?: Human } | null = null;
    let bd = r;
    for (const z of this.w.zombies.list) {
      if (!z.active) continue;
      const d = Math.hypot(z.sprite.x - h.sprite.x, z.sprite.y - h.sprite.y);
      if (d < bd) {
        bd = d;
        best = { x: z.sprite.x, y: z.sprite.y, z };
      }
    }
    for (const o of this.list) {
      if (o === h || o.faction === h.faction) continue;
      const d = Math.hypot(o.sprite.x - h.sprite.x, o.sprite.y - h.sprite.y);
      if (d < bd) {
        bd = d;
        best = { x: o.sprite.x, y: o.sprite.y, hu: o };
      }
    }
    return best;
  }

  private move(h: Human, tx: number, ty: number, speed: number) {
    const a = Math.atan2(ty - h.sprite.y, tx - h.sprite.x);
    h.sprite.body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    h.sprite.rotation = a;
  }

  /** 用流場行去玩家身邊 */
  private toPlayer(h: Human, speed: number) {
    const g = this.w.grid;
    const ni = this.flow.next(Math.floor(h.sprite.x / T), Math.floor(h.sprite.y / T));
    if (ni < 0) return h.sprite.body.setVelocity(0, 0);
    if (g.tiles[ni] === DOOR) this.w.openDoor(ni);
    this.move(h, ((ni % g.w) + 0.5) * T, (Math.floor(ni / g.w) + 0.5) * T, speed);
  }

  private strike(h: Human, e: { z?: Zombie; hu?: Human }) {
    const wd = h.weapon ? ITEMS[h.weapon] : null;
    const dmg = wd?.damage ?? HC.fistDamage;
    h.cd = wd?.cooldown ? wd.cooldown + 0.2 : HC.cooldown;
    this.w.noise(h.sprite.x, h.sprite.y, CONFIG.noise.melee);
    if (e.z) {
      e.z.hp -= dmg;
      this.w.zombies.knock(e.z, h.sprite.x, h.sprite.y, 1, false);
      if (e.z.hp <= 0) this.w.killZombie(e.z);
    } else if (e.hu) this.damage(e.hu, dmg, false);
  }

  /** 人類受傷；被喪屍咬有機會感染 */
  damage(h: Human, dmg: number, bite: boolean, minutes = 0) {
    h.hp -= dmg;
    if (h.faction === 'raider') h.alert = HC.raider.alertSec;
    if (bite && h.turnAt === undefined && this.rand() < HC.biteChance) h.turnAt = minutes + HC.turnMin;
    if (h.hp <= 0) this.w.onHumanDown(h);
  }

  update(dt: number, px: number, py: number, playerAlive: boolean, playerTile: number, tilesVersion: number) {
    if (this.list.some((h) => h.mode === 'follow' || h.mode === 'hostile')) this.flow.update(playerTile, tilesVersion);
    const g = this.w.grid;
    for (const h of [...this.list]) {
      if (!this.list.includes(h)) continue; // 今幀已經俾人打死咗
      const s = h.sprite;
      h.cd -= dt;
      h.label?.setPosition(s.x, s.y - 7).setVisible(s.visible);
      const dp = Math.hypot(px - s.x, py - s.y);
      const reach = (h.weapon ? ITEMS[h.weapon].reach ?? HC.reach : HC.reach) + 6;

      if (h.mode === 'hostile') {
        // 掠奪者：見到你就追殺，見唔到就四圍搜
        if (playerAlive && dp < HC.raider.sightTiles * T && castRay(g, s.x, s.y, Math.atan2(py - s.y, px - s.x), dp) >= dp) h.alert = HC.raider.alertSec;
        h.alert -= dt;
        const e = this.nearestEnemy(h, reach);
        if (playerAlive && dp <= reach && h.cd <= 0) {
          h.cd = HC.raider.cooldown;
          this.w.hurtPlayer(HC.raider.damageMin + this.rand() * (HC.raider.damageMax - HC.raider.damageMin), '被掠奪者殺死');
          this.w.noise(s.x, s.y, CONFIG.noise.melee);
        } else if (e && h.cd <= 0) this.strike(h, e);
        if (!this.list.includes(h)) continue;
        if (h.alert > 0 && playerAlive) {
          if (dp > reach * 0.8) this.toPlayer(h, HC.raider.speed);
          else s.body.setVelocity(0, 0);
        } else {
          h.turnIn -= dt;
          if (h.turnIn <= 0 || s.body.blocked.none === false) {
            h.turnIn = 2 + this.rand() * 3;
            this.move(h, s.x + (this.rand() - 0.5) * 200, s.y + (this.rand() - 0.5) * 200, HC.ally.speed * 0.5);
          }
        }
        continue;
      }

      if (h.mode === 'idle') {
        s.body.setVelocity(0, 0);
        if (dp < 4 * T) s.rotation = Math.atan2(py - s.y, px - s.x);
        continue;
      }

      // 盟友：跟隨 / 守位，附近有敵人就打
      const fightR = (h.mode === 'guard' ? HC.ally.guardTiles : HC.ally.fightTiles) * T;
      const e = this.nearestEnemy(h, fightR);
      if (e) {
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d <= reach) {
          s.body.setVelocity(0, 0);
          s.rotation = Math.atan2(e.y - s.y, e.x - s.x);
          if (h.cd <= 0) this.strike(h, e);
          if (!this.list.includes(h)) continue;
        } else this.move(h, e.x, e.y, HC.ally.speed);
      } else if (h.mode === 'follow' && playerAlive) {
        if (dp > HC.ally.followTiles * T) this.toPlayer(h, dp > 6 * T ? HC.ally.runSpeed : HC.ally.speed);
        else s.body.setVelocity(0, 0);
      } else if (h.mode === 'guard' && h.gx !== undefined && h.gy !== undefined) {
        if (Math.hypot(h.gx - s.x, h.gy - s.y) > T) this.move(h, h.gx, h.gy, HC.ally.speed);
        else s.body.setVelocity(0, 0);
      } else s.body.setVelocity(0, 0);
      const moving = s.body.velocity.lengthSq() > 4;
      if (moving) s.anims.resume();
      else s.anims.pause();
    }
  }
}
