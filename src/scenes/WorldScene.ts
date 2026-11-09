// 主遊戲（Phase 1 可玩核心）
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import { DEF_BY_INDEX, defAt, generateMap, type Grid, isSolid, mulberry32, solidIndices, tileIndex } from '../world/mapgen';
import { canSee, type ViewCone, visibilityPolygon } from '../world/vision';
import { type Zombie, Zombies, type ZWorld } from '../systems/zombies';
import { coneTiles, darkness, dayInfo, isNight, isStorm, MIN_PER_SEC, nightness, waterOn, weatherOf } from '../systems/time';
import { statusList, tickNeeds } from '../systems/needs';
import { autoHotbar, dropItem, takeItem, unequip, useHotbar, useItem } from '../systems/inventory';
import { rollContainer } from '../systems/loot';
import { b64ToBits, bitsToB64, deleteSave, saveGame } from '../systems/save';
import {
  capacity, carried, clock, dayOf, deadline, type GameState, hourOf, ITEMS, type Item, newPlayer, type Pile, profOf, staminaMax,
} from '../state';
import { renderHotbar, renderHud, setProgress, setPrompt, showHud, toast } from '../ui/hud';
import { closeInventory, inventoryOpen, openInventory, refreshInventory } from '../ui/inventory';
import { drawMap, mapOpen, toggleMap } from '../ui/map';
import { closeMenu, showDayCard, showDeath, showEnding, showPause, showProfessions } from '../ui/menu';
import { isTouch, setupTouch, stick } from '../ui/touch';

const T = CONFIG.tile;
const V = CONFIG.vision;
const PL = CONFIG.player;
const Z = CONFIG.zombie;
const NZ = CONFIG.noise;
const rad = (deg: number) => (deg * Math.PI) / 180;
const angDiff = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
const CONTAINER_CH = 'fkrcwx';

type Body = Phaser.Physics.Arcade.Body;
type Focus =
  | { kind: 'door' | 'container' | 'car' | 'tap' | 'bed'; tile: number; label: string }
  | { kind: 'pile'; pile: Pile; label: string };

export interface WorldData {
  state: GameState;
}

export class WorldScene extends Phaser.Scene implements ZWorld {
  s!: GameState;
  grid!: Grid;
  tilesVersion = 0;
  zombies!: Zombies;
  player!: Phaser.Physics.Arcade.Sprite & { body: Body };
  private rand!: () => number;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private explored!: Uint8Array;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dark!: Phaser.GameObjects.RenderTexture;
  private bloodRT!: Phaser.GameObjects.RenderTexture;
  private lightGfx!: Phaser.GameObjects.Graphics;
  private swingGfx!: Phaser.GameObjects.Graphics;
  private boat!: Phaser.GameObjects.Image;
  private heli!: Phaser.GameObjects.Image;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainRect = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private pileSprites = new Map<Pile, Phaser.GameObjects.Image>();
  private flashlight = false;
  private sneak = false;
  private cones: ViewCone[] = [];
  private frame = 0;
  private attackCd = 0;
  private shoveCd = 0;
  private stepT = 0;
  private focus: Focus | null = null;
  private search: { tile: number; t: number; total: number } | null = null;
  private ground: { items: Item[]; pile?: Pile; name: string } | null = null;
  private sleeping = false;
  private dead = false;
  private zombiesNear = 0;
  private alarms: { x: number; y: number; left: number; next: number }[] = [];
  private heliPass: { left: number; next: number; vx: number } | null = null;
  private heliWait = 20;
  private lastSave = 0;
  /** 今幀有冇被喪屍打中（死因用） */
  private hitThisFrame = false;
  private touch = false;

  constructor() {
    super('world');
  }

  // ───────────────────────── 建立 ─────────────────────────
  create(data: WorldData) {
    this.s = data.state;
    const s = this.s;
    this.dead = false;
    this.sleeping = false;
    this.flashlight = false;
    this.rand = mulberry32((s.seed ^ (s.minutes * 7919)) >>> 0);
    const g = (this.grid = generateMap(mulberry32(s.seed)));
    for (const [i, t] of Object.entries(s.tileOverrides)) g.tiles[+i] = t;
    const mapW = g.w * T;
    const mapH = g.h * T;

    const rows: number[][] = [];
    for (let y = 0; y < g.h; y++) rows.push(Array.from(g.tiles.subarray(y * g.w, (y + 1) * g.w)));
    const map = this.make.tilemap({ data: rows, tileWidth: T, tileHeight: T });
    this.layer = map.createLayer(0, map.addTilesetImage('tiles')!, 0, 0) as Phaser.Tilemaps.TilemapLayer;
    map.setCollision(solidIndices());
    this.physics.world.setBounds(0, 0, mapW, mapH);

    this.explored = b64ToBits(s.explored, Math.ceil((g.w * g.h) / 8));
    if (profOf(s).mapRevealed) this.explored.fill(255);

    this.bloodRT = this.add.renderTexture(0, 0, mapW, mapH).setOrigin(0).setDepth(1);
    for (let i = 0; i < s.blood.length; i += 2) this.bloodRT.stamp('blood', undefined, s.blood[i], s.blood[i + 1]);
    this.bloodRT.render();

    // 玩家
    if (!s.player.x) this.placePlayer();
    const p = this.physics.add.sprite(s.player.x, s.player.y, 'player');
    p.setCircle(PL.radius, p.width / 2 - PL.radius, p.height / 2 - PL.radius).setCollideWorldBounds(true).setDepth(11);
    this.player = p as typeof this.player;
    this.physics.add.collider(p, this.layer);

    // 喪屍
    this.zombies = new Zombies(this, this, this.rand);
    this.physics.add.collider(this.zombies.group, this.layer);
    if (s.zombies) for (const z of s.zombies) this.zombies.spawn(z.x, z.y, z.hp, z.carry);
    else this.zombies.spawnRandom(Z.startCount, p.x, p.y, Z.minSpawnTiles);

    for (const pile of s.piles) this.pileSprite(pile);

    const evac0 = g.evac[0];
    this.boat = this.add
      .image(((evac0 % g.w) + CONFIG.map.evacWidth / 2) * T, (Math.floor(evac0 / g.w) + 3.2) * T, 'boat')
      .setDepth(6)
      .setVisible(false);
    this.heli = this.add.image(0, 0, 'heli').setDepth(23).setVisible(false);
    this.swingGfx = this.add.graphics().setDepth(12);

    // 夜晚遮罩
    this.dark = this.add.renderTexture(0, 0, mapW, mapH).setOrigin(0).setDepth(20);
    this.lightGfx = this.make.graphics({}, false);

    // 雨
    this.rain = this.add
      .particles(0, 0, 'rain', {
        emitZone: { type: 'random', source: this.rainRect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        speedY: { min: 380, max: 460 },
        speedX: { min: -110, max: -80 },
        rotate: 12,
        lifespan: 650,
        quantity: 2,
        frequency: 25,
        alpha: { start: 0.8, end: 0.1 },
      })
      .setDepth(22);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH).startFollow(p, true, 0.15, 0.15);
    const fitZoom = () => {
      const { width, height } = this.scale;
      cam.setZoom(Math.max(CONFIG.minZoom, Math.ceil(Math.max(width / mapW, height / mapH))));
    };
    fitZoom();
    this.scale.on('resize', fitZoom);
    this.events.once('shutdown', () => this.scale.off('resize', fitZoom));

    this.setupInput();
    showHud(true);
    autoHotbar(s);
    this.renderHotbar();
    this.lastSave = s.minutes;
    document.onvisibilitychange = () => document.hidden && !this.dead && this.saveNow();
    this.checkDay();
  }

  private placePlayer() {
    const s = this.s;
    const g = this.grid;
    const avoid = s.piles.filter((p) => p.turnAt !== undefined);
    const resident = tileIndex('7');
    for (let tries = 0; tries < 5000; tries++) {
      const i = Math.floor(this.rand() * g.tiles.length);
      if (g.tiles[i] !== resident) continue;
      const x = ((i % g.w) + 0.5) * T;
      const y = (Math.floor(i / g.w) + 0.5) * T;
      if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 20 * T)) continue;
      if (s.zombies?.some((z) => Math.hypot(z.x - x, z.y - y) < 10 * T)) continue;
      s.player.x = x;
      s.player.y = y;
      return;
    }
    s.player.x = (g.w / 2) * T;
    s.player.y = (g.h / 2) * T;
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SHIFT,SPACE,E,C,F,M,TAB,ESC,ONE,TWO,THREE,FOUR,FIVE', true) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-F', () => this.toggleFlash());
    kb.on('keydown-C', () => (this.sneak = !this.sneak));
    kb.on('keydown-E', () => this.interact());
    kb.on('keydown-SPACE', () => this.shove());
    kb.on('keydown-TAB', () => this.toggleInventory());
    kb.on('keydown-M', () => this.toggleMapPanel());
    kb.on('keydown-ESC', () => this.pause());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.hotbar(i)));
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.touch && ptr.leftButtonDown()) this.attack();
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>('#topbtns button')) {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'sneak') this.sneak = !this.sneak;
        if (a === 'flash') this.toggleFlash();
        if (a === 'inv') this.toggleInventory();
        if (a === 'map') this.toggleMapPanel();
        if (a === 'pause') this.pause();
      };
    }
    this.touch = isTouch();
    if (this.touch) setupTouch({ attack: () => this.attack(), shove: () => this.shove(), use: () => this.interact() });
  }

  // ───────────────────────── ZWorld ─────────────────────────
  setTile(i: number, ch: string) {
    const idx = tileIndex(ch);
    this.grid.tiles[i] = idx;
    this.s.tileOverrides[i] = idx;
    this.layer.putTileAt(idx, i % this.grid.w, Math.floor(i / this.grid.w));
    this.tilesVersion++;
  }

  bashDoor(tile: number, amount: number) {
    const hp = (this.s.doorHp[tile] ?? Z.doorHp) - amount;
    this.s.doorHp[tile] = hp;
    if (hp > 0) return;
    delete this.s.doorHp[tile];
    this.setTile(tile, 'B');
    const x = ((tile % this.grid.w) + 0.5) * T;
    const y = (Math.floor(tile / this.grid.w) + 0.5) * T;
    this.noise(x, y, NZ.doorBreak);
    if (Math.hypot(x - this.player.x, y - this.player.y) < 16 * T) toast('砰！有道門被撞爛咗');
  }

  onAttack(_z: Zombie) {
    if (this.dead) return;
    const p = this.s.player;
    if (this.sleeping) this.wake('你被襲擊嘈醒！');
    this.search = null;
    p.hp -= Z.damageMin + this.rand() * (Z.damageMax - Z.damageMin);
    this.hitThisFrame = true;
    this.cameras.main.flash(120, 110, 20, 32);
    this.cameras.main.shake(CONFIG.combat.shakeMs, CONFIG.combat.shakeIntensity * 2);
    const r = this.rand();
    if (r < Z.biteChance) {
      p.bitten = true;
      this.infect();
      toast('🦷 你被咬咗……');
    } else if (r < Z.biteChance + Z.scratchChance) {
      toast('被抓傷');
      if (this.rand() < Z.scratchInfectChance) this.infect();
    } else if (r < Z.biteChance + Z.scratchChance + Z.lacerationChance) {
      if (!p.bleeding) toast('🩸 傷口出血！用繃帶止血');
      p.bleeding = true;
    }
    this.stampBlood(this.player.x, this.player.y);
  }

  private infect() {
    const p = this.s.player;
    if (p.infectDeath !== null) return;
    const N = CONFIG.needs;
    p.infectAt = this.s.minutes;
    p.infectDeath = this.s.minutes + N.infectMinMin + this.rand() * (N.infectMaxMin - N.infectMinMin);
  }

  // ───────────────────────── 每幀 ─────────────────────────
  update(_t: number, dtMs: number) {
    const s = this.s;
    const dtReal = Math.min(dtMs, 50) / 1000;
    const overlay = inventoryOpen() || mapOpen();
    const slow = overlay ? CONFIG.time.overlaySlow : 1;
    this.physics.world.timeScale = 1 / slow;
    const dt = dtReal * slow;
    const dtMin = dt * MIN_PER_SEC * (this.sleeping ? CONFIG.time.sleepSpeed : 1);
    s.minutes += dtMin;
    if (this.dead) return;

    this.checkDay();
    this.checkEvac();
    const p = this.player;
    const P = s.player;

    // 移動
    let mx = 0;
    let my = 0;
    let wantRun = false;
    if (!this.sleeping) {
      const k = this.keys;
      mx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
      my = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
      wantRun = k.SHIFT.isDown;
      if (stick.mag > 0.15) {
        mx = stick.x;
        my = stick.y;
        wantRun = stick.mag >= CONFIG.touch.runAt;
      }
    }
    const len = Math.hypot(mx, my);
    const moving = len > 0;
    const running = moving && wantRun && P.stamina > 5 && !this.sneak;
    let speed = running ? PL.runSpeed : this.sneak ? PL.sneakSpeed : PL.walkSpeed;
    const here = defAt(this.grid, Math.floor(p.x / T), Math.floor(p.y / T));
    if (here?.ch === '~' && isStorm(s.minutes)) speed *= CONFIG.rain.floodSlow;
    if (carried(P) > capacity(s)) speed *= 0.6;
    p.body.setVelocity(moving ? (mx / len) * speed : 0, moving ? (my / len) * speed : 0);
    P.x = p.x;
    P.y = p.y;

    // 面向
    if (this.touch) {
      if (moving) p.rotation = Math.atan2(my, mx);
    } else {
      const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      p.rotation = Math.atan2(ptr.y - p.y, ptr.x - p.x);
    }

    // 腳步聲
    this.stepT -= dt;
    if (moving && this.stepT <= 0) {
      this.stepT = NZ.stepEverySec;
      const r = running ? NZ.run * (profOf(s).runNoiseMul ?? 1) : this.sneak ? NZ.sneak : NZ.walk;
      this.noise(p.x, p.y, r);
    }
    if (moving) this.search = null;

    this.attackCd -= dt;
    this.shoveCd -= dt;
    this.tickSearch(dt);
    this.updateFocus();

    const night = isNight(s.minutes);
    let sight = this.flashlight ? Z.sightTilesFlashlight : night ? Z.sightTilesNight : Z.sightTiles;
    if (isStorm(s.minutes)) sight *= V.stormMul;
    this.zombies.update(dt, p.x, p.y, PL.radius, sight * T, true);

    const cause = tickNeeds(s, dt, dtMin, {
      running,
      zombiesNear: this.zombiesNear,
      dark: nightness(s.minutes) > 0.5,
      flashlight: this.flashlight,
    });
    if (this.flashlight && P.battery <= 0) {
      this.flashlight = false;
      toast('電筒冇電');
    }
    if (P.hp <= 0) return this.die(this.hitThisFrame ? '被喪屍殺死' : cause ?? '傷重');
    this.hitThisFrame = false;

    this.tickEvents(dtReal);
    this.tickSleep();

    if (this.frame++ % V.updateEveryFrames === 0) this.updateVision();
    if (this.frame % V.exploreEveryFrames === 0) this.markExplored();
    if (mapOpen() && this.frame % 30 === 0) this.drawMapPanel();

    const wv = this.cameras.main.worldView;
    this.rainRect.setTo(wv.x - 40, wv.y - 60, wv.width + 120, wv.height * 0.6);

    renderHud({
      day: dayOf(s.minutes),
      title: dayInfo(s.minutes).title,
      time: clock(s.minutes),
      weather: weatherOf(s.minutes),
      hp: P.hp,
      hunger: P.hunger,
      thirst: P.thirst,
      stamina: P.stamina,
      staminaMax: staminaMax(s),
      panic: P.panic,
      battery: P.battery,
      flashlight: this.flashlight,
      sneak: this.sneak,
      status: statusList(s),
      fps: this.game.loop.actualFps,
    });

    if (s.minutes - this.lastSave >= CONFIG.save.everyMin) this.saveNow();
  }

  // ───────────────────────── 噪音 / 視野 ─────────────────────────
  noise(x: number, y: number, tiles: number) {
    const mul = isStorm(this.s.minutes) ? NZ.stormMul : 1;
    this.zombies.hear(x, y, tiles * T * mul);
  }

  private updateVision() {
    const p = this.player;
    const g = this.grid;
    const s = this.s;
    const cone = coneTiles(s.minutes, profOf(s).nightVision ?? 0) * T;
    const shake = s.player.panic >= CONFIG.needs.panicShakeAt ? 0.85 : 1;
    this.cones = [
      { angle: p.rotation, half: (rad(V.coneDeg) / 2) * shake, radius: cone },
      { angle: 0, half: Math.PI, radius: V.auraTiles * T },
    ];
    if (this.flashlight) this.cones.push({ angle: p.rotation, half: rad(V.flashConeDeg) / 2, radius: V.flashTiles * T });

    const gfx = this.lightGfx.clear();
    for (const c of this.cones) {
      const { outer, inner } = visibilityPolygon(g, p.x, p.y, c, V.softEdgeInner);
      gfx.fillStyle(0xffffff, V.softEdgeAlpha).fillPoints(outer as Phaser.Math.Vector2[], true);
      gfx.fillStyle(0xffffff, 1).fillPoints(inner as Phaser.Math.Vector2[], true);
    }
    // 只填鏡頭見到嘅範圍，慳 GPU
    const wv = this.cameras.main.worldView;
    this.dark.clear().fill(0x000000, darkness(s.minutes), wv.x - T, wv.y - T, wv.width + 2 * T, wv.height + 2 * T).erase(gfx).render();

    // 牆後 / 視野外嘅喪屍唔顯示；順手數附近見到幾多隻（驚恐用）
    let near = 0;
    const nearPx = CONFIG.needs.panicNearTiles * T;
    for (const z of this.zombies.list) {
      const v = canSee(g, p.x, p.y, this.cones, z.sprite.x, z.sprite.y);
      z.sprite.setVisible(v);
      if (v && Math.hypot(z.sprite.x - p.x, z.sprite.y - p.y) < nearPx) near++;
    }
    this.zombiesNear = near;

    const w = weatherOf(s.minutes);
    this.rain.emitting = w === 'rain' || w === 'storm';
    this.rain.quantity = w === 'storm' ? 7 : 2;
  }

  private markExplored() {
    const p = this.player;
    const g = this.grid;
    const r = Math.max(...this.cones.map((c) => c.radius));
    const x0 = Math.max(0, Math.floor((p.x - r) / T));
    const x1 = Math.min(g.w - 1, Math.floor((p.x + r) / T));
    const y0 = Math.max(0, Math.floor((p.y - r) / T));
    const y1 = Math.min(g.h - 1, Math.floor((p.y + r) / T));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * g.w + tx;
        if (this.explored[i >> 3] & (1 << (i & 7))) continue;
        let cx = (tx + 0.5) * T;
        let cy = (ty + 0.5) * T;
        if (isSolid(g, tx, ty)) {
          // 牆格：試佢面向玩家嗰邊
          const a = Math.atan2(p.y - cy, p.x - cx);
          cx += Math.cos(a) * (T * 0.55);
          cy += Math.sin(a) * (T * 0.55);
        }
        if (canSee(g, p.x, p.y, this.cones, cx, cy)) this.explored[i >> 3] |= 1 << (i & 7);
      }
  }

  // ───────────────────────── 戰鬥 ─────────────────────────
  private facing() {
    const P = this.s.player;
    let a = this.player.rotation;
    if (this.touch) {
      // 手機：自動面向最近喪屍
      let best = CONFIG.touch.autoAimTiles * T;
      for (const z of this.zombies.list) {
        const d = Math.hypot(z.sprite.x - this.player.x, z.sprite.y - this.player.y);
        if (z.active && z.sprite.visible && d < best) {
          best = d;
          a = Math.atan2(z.sprite.y - this.player.y, z.sprite.x - this.player.x);
        }
      }
      this.player.rotation = a;
    }
    if (P.panic >= CONFIG.needs.panicShakeAt) a += rad((this.rand() * 2 - 1) * CONFIG.needs.panicShakeDeg);
    return a;
  }

  private targetsInArc(reach: number, arcDeg: number, angle: number) {
    const p = this.player;
    return this.zombies.list
      .filter((z) => z.active)
      .map((z) => ({ z, d: Math.hypot(z.sprite.x - p.x, z.sprite.y - p.y) }))
      .filter(({ z, d }) => d <= reach + Z.radius + PL.radius && (d < 8 || angDiff(Math.atan2(z.sprite.y - p.y, z.sprite.x - p.x), angle) <= rad(arcDeg) / 2))
      .sort((a, b) => a.d - b.d);
  }

  attack() {
    if (this.dead || this.sleeping || this.attackCd > 0 || inventoryOpen()) return;
    const s = this.s;
    const P = s.player;
    const w = P.weapon ? ITEMS[P.weapon.id] : null;
    const cost = w?.stamina ?? PL.fistStamina;
    if (P.stamina < cost) return toast('冇晒氣力');
    P.stamina -= cost;
    this.attackCd = w?.cooldown ?? PL.fistCooldown;
    const reach = w?.reach ?? PL.fistReach;
    const angle = this.facing();
    this.drawSwing(angle, reach);
    this.noise(this.player.x, this.player.y, NZ.melee);
    const hit = this.targetsInArc(reach, PL.attackArcDeg, angle)[0];
    if (!hit) return;
    const z = hit.z;
    let dmg = (w?.damage ?? PL.fistDamage) * (profOf(s).damageMul ?? 1);
    if (z.mode === 'down') {
      dmg *= PL.stompMul;
      toast('踩頭！');
    }
    z.hp -= dmg;
    z.mode = z.mode === 'down' ? 'down' : 'chase';
    z.timer = Math.max(z.timer, z.mode === 'chase' ? Z.chaseMemorySec : z.timer);
    this.stampBlood(z.sprite.x, z.sprite.y);
    this.zombies.knock(z, this.player.x, this.player.y, w?.knockback ?? 1, false);
    this.physics.pause();
    this.time.delayedCall(CONFIG.combat.hitStopMs, () => this.physics.resume());
    this.cameras.main.shake(CONFIG.combat.shakeMs, CONFIG.combat.shakeIntensity);
    if (P.weapon && P.weapon.dur !== undefined && --P.weapon.dur <= 0) {
      toast(`${ITEMS[P.weapon.id].name}爛咗`);
      P.weapon = null;
      this.renderHotbar();
    }
    if (z.hp <= 0) this.killZombie(z);
  }

  shove() {
    if (this.dead || this.sleeping || this.shoveCd > 0 || inventoryOpen()) return;
    const P = this.s.player;
    if (P.stamina < PL.shoveStamina) return toast('冇晒氣力');
    P.stamina -= PL.shoveStamina;
    this.shoveCd = PL.shoveCooldown;
    const angle = this.facing();
    this.drawSwing(angle, PL.shoveReach);
    const power = 1.3 * (profOf(this.s).shoveMul ?? 1);
    for (const { z } of this.targetsInArc(PL.shoveReach, PL.shoveArcDeg, angle)) this.zombies.knock(z, this.player.x, this.player.y, power, true);
  }

  private drawSwing(angle: number, reach: number) {
    const g = this.swingGfx.clear();
    g.lineStyle(2, 0xffffff, 0.6);
    g.beginPath();
    g.arc(this.player.x, this.player.y, reach, angle - 0.7, angle + 0.7);
    g.strokePath();
    this.time.delayedCall(90, () => g.clear());
  }

  private killZombie(z: Zombie) {
    this.s.player.kills++;
    this.stampBlood(z.sprite.x + 3, z.sprite.y - 2);
    this.stampBlood(z.sprite.x - 3, z.sprite.y + 2);
    if (z.carry?.length) {
      const pile: Pile = { x: z.sprite.x, y: z.sprite.y, items: z.carry };
      this.s.piles.push(pile);
      this.pileSprite(pile);
      toast('你認得佢……係上一個你。佢身上仲有你嘅裝備');
    }
    this.zombies.kill(z);
  }

  private stampBlood(x: number, y: number) {
    const b = this.s.blood;
    b.push(Math.round(x), Math.round(y));
    if (b.length > CONFIG.save.maxBlood * 2) b.splice(0, 2);
    this.bloodRT.stamp('blood', undefined, x, y).render();
  }

  // ───────────────────────── 互動 / 搜刮 ─────────────────────────
  private updateFocus() {
    const p = this.player;
    const g = this.grid;
    const s = this.s;
    let best: Focus | null = null;
    let bestScore = Infinity;
    const ptx = Math.floor(p.x / T);
    const pty = Math.floor(p.y / T);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        const d = defAt(g, tx, ty);
        if (!d) continue;
        const cx = (tx + 0.5) * T;
        const cy = (ty + 0.5) * T;
        const dist = Math.hypot(cx - p.x, cy - p.y);
        if (dist > PL.reach + 8) continue;
        const off = angDiff(Math.atan2(cy - p.y, cx - p.x), p.rotation);
        if (dist > 10 && off > rad(80)) continue;
        const score = dist + off * 10;
        if (score >= bestScore) continue;
        const tile = ty * g.w + tx;
        let f: Focus | null = null;
        if (d.ch === 'D') f = { kind: 'door', tile, label: 'E 開門' };
        else if (d.ch === 'O') f = { kind: 'door', tile, label: 'E 關門' };
        else if (CONTAINER_CH.includes(d.ch)) {
          const name = CONFIG.containers[d.ch].name;
          f = { kind: 'container', tile, label: s.containers[tile] ? `E 打開${name}（搜過）` : `E 搜${name}` };
        } else if (d.ch === 'A') f = { kind: 'car', tile, label: 'E 弄響汽車警報（引開喪屍）' };
        else if (d.ch === 'T') f = { kind: 'tap', tile, label: waterOn(s.minutes) ? 'E 飲水' : '水龍頭（斷咗水）' };
        else if (d.ch === 'b') f = { kind: 'bed', tile, label: 'E 瞓覺' };
        if (f) {
          best = f;
          bestScore = score;
        }
      }
    for (const pile of s.piles) {
      const dist = Math.hypot(pile.x - p.x, pile.y - p.y);
      if (dist <= PL.reach && dist < bestScore) {
        best = { kind: 'pile', pile, label: pile.turnAt !== undefined ? 'E 搜你嘅屍體' : 'E 睇地上' };
        bestScore = dist;
      }
    }
    this.focus = best;
    setPrompt(this.search ? null : best?.label ?? null);
  }

  interact() {
    if (this.dead || this.sleeping) return;
    if (inventoryOpen()) return this.toggleInventory();
    const f = this.focus;
    if (!f) return;
    const s = this.s;
    if (f.kind === 'pile') return this.openWith(f.pile.items, f.pile.turnAt !== undefined ? '你嘅屍體' : '地上', f.pile);
    const g = this.grid;
    const ch = DEF_BY_INDEX[g.tiles[f.tile]].ch;
    const cx = ((f.tile % g.w) + 0.5) * T;
    const cy = (Math.floor(f.tile / g.w) + 0.5) * T;
    switch (f.kind) {
      case 'door':
        if (ch === 'O') {
          const blocked = [this.player, ...this.zombies.list.map((z) => z.sprite)].some((o) => Math.abs(o.x - cx) < T * 0.7 && Math.abs(o.y - cy) < T * 0.7);
          if (blocked) return toast('有嘢擋住道門');
          this.setTile(f.tile, 'D');
        } else this.setTile(f.tile, 'O');
        this.noise(cx, cy, NZ.door);
        break;
      case 'container':
        if (s.containers[f.tile]) this.openWith(s.containers[f.tile], CONFIG.containers[ch].name);
        else this.search = { tile: f.tile, t: 0, total: CONFIG.containers[ch].sec };
        break;
      case 'car':
        if (this.alarms.some((a) => Math.hypot(a.x - cx, a.y - cy) < T * 3)) return;
        this.alarms.push({ x: cx, y: cy, left: NZ.carAlarmSec, next: 0 });
        toast('嗶嗶嗶——汽車警報響起！');
        break;
      case 'tap':
        if (!waterOn(s.minutes)) return toast('冇水……第三日開始斷咗水');
        s.player.thirst = 100;
        toast('飲飽咗水');
        break;
      case 'bed':
        if (this.zombies.chasingCount > 0) return toast('附近有喪屍，瞓唔落');
        this.sleeping = true;
        document.getElementById('sleep')!.classList.remove('hidden');
        break;
    }
  }

  private tickSearch(dt: number) {
    const sr = this.search;
    if (!sr) return setProgress(null);
    sr.t += dt;
    setProgress(Math.min(1, sr.t / sr.total));
    if (sr.t < sr.total) return;
    this.search = null;
    setProgress(null);
    const s = this.s;
    s.containers[sr.tile] = rollContainer(s.seed, sr.tile, this.grid.loot[sr.tile]);
    const ch = DEF_BY_INDEX[this.grid.tiles[sr.tile]].ch;
    this.openWith(s.containers[sr.tile], CONFIG.containers[ch].name);
  }

  // ───────────────────────── 背包 / 地圖 / 快捷欄 ─────────────────────────
  private openWith(items: Item[], name: string, pile?: Pile) {
    this.ground = { items, name, pile };
    this.showInventory();
  }

  toggleInventory() {
    if (this.dead) return;
    if (inventoryOpen()) {
      closeInventory();
      this.ground = null;
      this.cleanPiles();
      return;
    }
    // 冇開容器：右邊係腳下嘅地
    const p = this.player;
    const pile = this.s.piles.find((pl) => pl.turnAt === undefined && Math.hypot(pl.x - p.x, pl.y - p.y) < PL.reach);
    this.ground = pile ? { items: pile.items, name: '地上', pile } : { items: [], name: '地上' };
    this.showInventory();
  }

  private showInventory() {
    if (mapOpen()) toggleMap(false);
    const s = this.s;
    const after = (msg: string) => {
      if (msg) toast(msg);
      autoHotbar(s);
      this.renderHotbar();
    };
    openInventory(
      () => ({
        body: s.player.inv,
        weapon: s.player.weapon,
        bag: s.player.bag,
        weight: carried(s.player),
        cap: capacity(s),
        other: this.ground?.items ?? [],
        otherName: this.ground?.name ?? '地上',
      }),
      {
        use: (i) => after(useItem(s, i)),
        take: (j) => this.ground && after(takeItem(s, this.ground.items, j)),
        takeAll: () => {
          if (!this.ground) return;
          let msg = '';
          while (this.ground.items.length && !msg) msg = takeItem(s, this.ground.items, 0);
          after(msg);
        },
        drop: (i) => {
          if (!this.ground) return;
          if (!this.ground.pile && this.ground.name === '地上') {
            // 第一次放低：喺腳下開一堆
            const pile: Pile = { x: this.player.x, y: this.player.y, items: this.ground.items };
            s.piles.push(pile);
            this.pileSprite(pile);
            this.ground.pile = pile;
          }
          dropItem(s, this.ground.items, i);
          after('');
        },
        unequip: (slot) => after((unequip(s, slot), '')),
      },
    );
  }

  private pileSprite(pile: Pile) {
    const img = this.add.image(pile.x, pile.y, pile.turnAt !== undefined ? 'corpse' : 'pile').setDepth(5);
    this.pileSprites.set(pile, img);
  }

  /** 空咗嘅地上物品堆清走 */
  private cleanPiles() {
    this.s.piles = this.s.piles.filter((p) => {
      if (p.items.length || p.turnAt !== undefined) return true;
      this.pileSprites.get(p)?.destroy();
      this.pileSprites.delete(p);
      return false;
    });
  }

  private renderHotbar() {
    const P = this.s.player;
    renderHotbar(P.hotbar, P.inv, P.weapon, (i) => this.hotbar(i), (i, id) => {
      P.hotbar[i] = id;
      this.renderHotbar();
    });
  }

  private hotbar(i: number) {
    if (this.dead) return;
    const msg = useHotbar(this.s, i);
    if (msg) toast(msg);
    this.renderHotbar();
    refreshInventory();
  }

  private toggleFlash() {
    if (this.s.player.battery <= 0) return toast('電筒冇電，要換電池');
    this.flashlight = !this.flashlight;
  }

  toggleMapPanel() {
    if (this.dead) return;
    if (inventoryOpen()) this.toggleInventory();
    toggleMap(!mapOpen());
    if (mapOpen()) this.drawMapPanel();
  }

  private drawMapPanel() {
    const marks = this.s.piles.filter((p) => p.turnAt !== undefined).map((p) => ({ x: p.x / T, y: p.y / T, color: '#e0384f' }));
    drawMap(this.grid, this.explored, this.player.x / T, this.player.y / T, marks);
  }

  private pause() {
    if (this.dead) return;
    if (inventoryOpen()) return this.toggleInventory();
    if (mapOpen()) return toggleMap(false);
    this.scene.pause();
    showPause(
      () => {
        closeMenu();
        this.scene.resume();
      },
      () => {
        this.saveNow();
        location.reload();
      },
    );
  }

  // ───────────────────────── 時間 / 事件 ─────────────────────────
  private tickSleep() {
    if (!this.sleeping) return;
    const h = hourOf(this.s.minutes);
    if (this.zombies.list.some((z) => z.mode === 'chase' || (z.active && Math.hypot(z.sprite.x - this.player.x, z.sprite.y - this.player.y) < CONFIG.time.sleepWakeTiles * T && z.mode === 'investigate')))
      return this.wake('有喪屍接近，你驚醒咗！');
    if (h >= CONFIG.time.wakeHour && h < CONFIG.time.wakeHour + 0.5) this.wake('天光，瞓醒');
  }

  private wake(msg: string) {
    this.sleeping = false;
    document.getElementById('sleep')!.classList.add('hidden');
    toast(msg);
  }

  /** 新一日：標題卡 + 世界變化（DESIGN.md §2.3） */
  private checkDay() {
    const s = this.s;
    const day = Math.min(dayOf(s.minutes), CONFIG.time.lastDay);
    if (s.daysStarted >= day) return;
    s.daysStarted = day;
    const g = this.grid;
    const p = this.player;
    const cityH = g.h - CONFIG.map.dockRows;
    if (day >= 2) this.zombies.spawnRandom(Z.perDay, p.x, p.y, Z.minSpawnTiles, (tx, ty) => tx < 6 || tx > g.w - 7 || ty < 6);
    if (day === 2) for (const i of g.barricades) if (!isSolid(g, i % g.w, Math.floor(i / g.w))) this.setTile(i, 'X');
    if (day === 6) {
      const horde = this.zombies.spawnRandom(Z.hordeSize, p.x, p.y, Z.minSpawnTiles, (tx, ty) => tx < 5 && ty < cityH);
      const e = g.evac[0];
      this.zombies.sendTo(horde, ((e % g.w) + 0.5) * T, (Math.floor(e / g.w) - 3) * T);
    }
    if (day === 7) this.zombies.spawnRandom(Z.dockExtra, p.x, p.y, 8, (_tx, ty) => ty > cityH - 6);
    if (this.sleeping) this.wake('新一日');
    const info = dayInfo(s.minutes);
    this.scene.pause();
    showDayCard(day, info.title, info.radio, () => {
      this.scene.resume();
      this.saveNow();
    });
  }

  private tickEvents(dtReal: number) {
    const s = this.s;
    // 汽車警報
    for (const a of this.alarms) {
      a.left -= dtReal;
      a.next -= dtReal;
      if (a.next <= 0) {
        a.next = 2;
        this.noise(a.x, a.y, NZ.carAlarm);
      }
    }
    this.alarms = this.alarms.filter((a) => a.left > 0);

    // 第 2 日：直升機盤旋，巨大噪音拉走屍群
    if (dayOf(s.minutes) === 2 && !isNight(s.minutes)) {
      if (!this.heliPass) {
        this.heliWait -= dtReal;
        if (this.heliWait <= 0) {
          const fromLeft = this.rand() < 0.5;
          const w = this.grid.w * T;
          this.heli.setPosition(fromLeft ? -40 : w + 40, (0.15 + this.rand() * 0.6) * this.grid.h * T).setVisible(true);
          this.heliPass = { left: 30, next: 0, vx: ((fromLeft ? 1 : -1) * (w + 80)) / 30 };
          toast('🚁 直升機飛過，好大聲……');
        }
      } else {
        const h = this.heliPass;
        h.left -= dtReal;
        h.next -= dtReal;
        this.heli.x += h.vx * dtReal;
        this.heli.rotation += dtReal * 20;
        if (h.next <= 0) {
          h.next = 3;
          this.noise(this.heli.x, this.heli.y, NZ.helicopter);
        }
        if (h.left <= 0) {
          this.heliPass = null;
          this.heli.setVisible(false);
          this.heliWait = 50 + this.rand() * 40;
        }
      }
    } else if (this.heliPass) {
      this.heliPass = null;
      this.heli.setVisible(false);
    }

    // 屍體變喪屍（上一輪嘅你）
    for (const pile of [...s.piles]) {
      if (pile.turnAt === undefined || s.minutes < pile.turnAt) continue;
      this.zombies.spawn(pile.x, pile.y, Z.hp, pile.items);
      this.pileSprites.get(pile)?.destroy();
      this.pileSprites.delete(pile);
      s.piles.splice(s.piles.indexOf(pile), 1);
    }
  }

  /** 第 7 日碼頭撤離 / 錯過條船 */
  private checkEvac() {
    const s = this.s;
    const T7 = CONFIG.time;
    const h = hourOf(s.minutes);
    const present = dayOf(s.minutes) === T7.lastDay && h >= T7.boatArriveHour && h < T7.boatLeaveHour;
    this.boat.setVisible(present);
    if (s.ended) return;
    if (present) {
      const g = this.grid;
      const i = Math.floor(this.player.y / T) * g.w + Math.floor(this.player.x / T);
      if (g.evac.includes(i)) return this.ending('escaped');
    }
    if (s.minutes >= deadline()) this.ending('stayed');
  }

  private survived() {
    const m = this.s.minutes - this.s.player.bornAt;
    return `${Math.floor(m / 1440)} 日 ${Math.floor((m % 1440) / 60)} 小時`;
  }

  private ending(kind: 'escaped' | 'stayed') {
    const s = this.s;
    s.ended = kind;
    this.scene.pause();
    showHud(false);
    const stats = `生存 ${this.survived()} · 殺咗 ${s.player.kills} 隻喪屍 · 死過 ${s.deaths} 次`;
    if (kind === 'escaped') {
      deleteSave();
      showEnding('撤離成功', `第七日 ${clock(s.minutes)}，你登上咗北汐碼頭最後一班撤離船。<br>${stats}`, {
        返回標題: () => location.reload(),
      });
    } else {
      this.saveNow();
      showEnding('留低', `18:00，撤離船開走咗。你望住佢消失喺海平線……<br>${stats}<br>北汐仍然有路走：你可以繼續生存落去。`, {
        繼續生存: () => {
          closeMenu();
          showHud(true);
          this.scene.resume();
        },
        返回標題: () => location.reload(),
      });
    }
  }

  // ───────────────────────── 死亡 / 存檔 ─────────────────────────
  private die(cause: string) {
    const s = this.s;
    const P = s.player;
    this.dead = true;
    this.sleeping = false;
    document.getElementById('sleep')!.classList.add('hidden');
    closeInventory();
    toggleMap(false);
    this.player.body.setVelocity(0, 0);
    this.player.setVisible(false);
    const items = [...P.inv, ...(P.weapon ? [P.weapon] : []), ...(P.bag ? [P.bag] : [])];
    const corpse: Pile = { x: this.player.x, y: this.player.y, items, turnAt: s.minutes + CONFIG.corpseTurnMin };
    s.piles.push(corpse);
    this.pileSprite(corpse);
    this.stampBlood(this.player.x, this.player.y);
    s.deaths++;
    const text = `你喺澳汐生存咗 ${this.survived()}。死因：${cause}。殺咗 ${P.kills} 隻喪屍。`;
    this.saveNow();
    showHud(false);
    showDeath(
      text,
      () =>
        showProfessions('揀新角色（同一個世界、同一日）', (prof) => {
          closeMenu();
          s.player = newPlayer(prof, 0, 0, s.minutes);
          this.snapshot();
          this.scene.restart({ state: s });
        }),
      () => {
        deleteSave().then(() => location.reload());
      },
    );
  }

  /** 將 Phaser 物件嘅狀態寫返入 GameState */
  private snapshot() {
    const s = this.s;
    if (!this.dead) {
      s.player.x = this.player.x;
      s.player.y = this.player.y;
    }
    s.zombies = this.zombies.toSave();
    s.explored = bitsToB64(this.explored);
  }

  saveNow() {
    this.snapshot();
    this.lastSave = this.s.minutes;
    return saveGame(this.s);
  }
}
