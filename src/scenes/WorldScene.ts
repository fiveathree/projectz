// 主遊戲（Phase 2：安全屋、製作煮食、技能、手機、線索、音效、調色）
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import story from '../data/story.json';
import { BREAKS_TO, DEF_BY_INDEX, defAt, generateMap, type Grid, isSolid, mulberry32, solidIndices, tileIndex } from '../world/mapgen';
import { canSee, castRay, type ViewCone, visibilityPolygon } from '../world/vision';
import { type Zombie, Zombies, type ZWorld } from '../systems/zombies';
import { coneTiles, darkness, dayInfo, isNight, isStorm, minPerSec, nightness, powerOn, sandboxEvent, setWorldSeed, waterOn, weatherOf } from '../systems/time';
import { type Human, Humans, type HWorld } from '../systems/humans';
import npcsJson from '../data/npcs.json';
import { statusList, tickNeeds } from '../systems/needs';
import {
  autoHotbar, canCraft, consume, cookAll, countOf, craft, dropItem, fillBottles, PLACE, RECIPES, takeItem, unequip, useHotbar, useItem,
} from '../systems/inventory';
import { rollContainer } from '../systems/loot';
import { b64ToBits, bitsToB64, deleteSave, saveGame } from '../systems/save';
import { carpHpMul, carpTimeMul, gainXp, meleeDamageMul, meleeStaminaMul, SKILL_HELP, sneakNoiseMul, sneakSightMul } from '../systems/skills';
import { play, setLoop } from '../systems/audio';
import {
  capacity, carried, clock, dayOf, deadline, DISTRICT_NAMES, type DistrictId, type GameState, type HumanSave, switchDistrict, hourOf, ITEMS, type Item, makeItem, newPlayer, type Pile, profOf,
  SKILL_NAMES, type SkillId, skillLevel, staminaMax, type Structure,
} from '../state';
import { renderHotbar, renderHud, setProgress, setPrompt, showHud, toast } from '../ui/hud';
import { closeInventory, inventoryOpen, openInventory, refreshInventory } from '../ui/inventory';
import { drawMap } from '../ui/map';
import { closePhone, openPhone, phoneCanvas, phoneOpen, phoneTab, renderPhone } from '../ui/phone';
import { closeMenu, showDayCard, showDeath, showEnding, showPause, showProfessions } from '../ui/menu';
import { isTouch, setupTouch, showTouch, stick } from '../ui/touch';

const T = CONFIG.tile;
const V = CONFIG.vision;
const PL = CONFIG.player;
const Z = CONFIG.zombie;
const NZ = CONFIG.noise;
const B = CONFIG.build;
const rad = (deg: number) => (deg * Math.PI) / 180;
const angDiff = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
const CONTAINER_CH = 'fkrcwx';
const OUTDOOR_CH = ',=_~:8E';

type Body = Phaser.Physics.Arcade.Body;
interface Action {
  label: string;
  run: () => void;
}
/** 面前可以互動嘅嘢：E = 主要動作，R = 第二動作（釘板 / 拆） */
interface Focus {
  e?: Action;
  r?: Action;
}
/** 要時間嘅動作（搜刮、釘板、煮嘢…）：郁身或者被打就中斷 */
interface Task {
  t: number;
  total: number;
  done: () => void;
  tick?: number;
  sfx?: 'search' | 'hammer';
}

export interface WorldData {
  state: GameState;
  /** 啱啱由另一個區過嚟：喺出入口出現 */
  arrive?: boolean;
}
const NPCS = Object.entries(npcsJson).filter(([k]) => !k.startsWith('_')) as [string, { name: string; district: DistrictId; want: 'food' | 'drink' | 'med'; weapon: string; ask: string; join: string }][];
const HC = CONFIG.humans;
const WANT_NAME = { food: '食物', drink: '嘢飲', med: '藥物 / 繃帶' };

export class WorldScene extends Phaser.Scene implements ZWorld, HWorld {
  s!: GameState;
  grid!: Grid;
  tilesVersion = 0;
  zombies!: Zombies;
  humans!: Humans;
  player!: Phaser.Physics.Arcade.Sprite & { body: Body };
  explored!: Uint8Array;
  private rand!: () => number;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dark!: Phaser.GameObjects.RenderTexture;
  private bloodRT!: Phaser.GameObjects.RenderTexture;
  private lightGfx!: Phaser.GameObjects.Graphics;
  private swingGfx!: Phaser.GameObjects.Graphics;
  private boat!: Phaser.GameObjects.Image;
  private heli!: Phaser.GameObjects.Image;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private grade!: Phaser.Filters.ColorMatrix;
  private gradeKey = '';
  private rainRect = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private pileSprites = new Map<Pile, Phaser.GameObjects.Image>();
  private structSprites = new Map<Structure, Phaser.GameObjects.Image>();
  flashlight = false;
  sneak = false;
  private cones: ViewCone[] = [];
  private frame = 0;
  private attackCd = 0;
  private shoveCd = 0;
  private stepT = 0;
  focus: Focus | null = null;
  task: Task | null = null;
  private ground: { items: Item[]; pile?: Pile; name: string } | null = null;
  sleeping = false;
  dead = false;
  private zombiesNear = 0;
  private alarms: { x: number; y: number; left: number; next: number }[] = [];
  private fires: { x: number; y: number; left: number }[] = [];
  /** 飛緊嘅燃燒樽（跟遊戲時間行，開背包減慢時一樣減慢） */
  private flying: { img: Phaser.GameObjects.Image; sx: number; sy: number; tx: number; ty: number; t: number }[] = [];
  private heliPass: { left: number; next: number; vx: number } | null = null;
  private heliWait = 20;
  private lightLureT = 0;
  private groanT = 0;
  private heartT = 0;
  private lastSave = 0;
  /** 今幀邊個打中你（死因用） */
  private hitCause = '';
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
    this.task = null;
    this.fires = [];
    this.flying = [];
    this.alarms = [];
    this.gradeKey = '';
    this.rand = mulberry32((s.seed ^ (s.minutes * 7919)) >>> 0);
    setWorldSeed(s.seed);
    const g = (this.grid = generateMap(mulberry32(this.districtSeed()), s.district));
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
    if (data.arrive) this.placeAtExit();
    else if (!s.player.x) this.placePlayer();
    const p = this.physics.add.sprite(s.player.x, s.player.y, 'player', 0);
    p.setCircle(PL.radius, p.width / 2 - PL.radius, p.height / 2 - PL.radius).setCollideWorldBounds(true).setDepth(11);
    this.player = p as typeof this.player;
    this.physics.add.collider(p, this.layer);

    // 喪屍
    this.zombies = new Zombies(this, this, this.rand);
    this.zombies.speedMul = s.settings.speed;
    this.physics.add.collider(this.zombies.group, this.layer);
    if (s.zombies) for (const z of s.zombies) this.zombies.spawn(z.x, z.y, z.hp, z.carry, z.who);
    else this.zombies.spawnRandom(Math.round((s.district === 'estate' ? CONFIG.estate.startZombies : Z.startCount) * s.settings.zombies), p.x, p.y, Z.minSpawnTiles);

    // 人類：呢區嘅倖存者 / 掠奪者 + 跟住你嘅盟友
    this.humans = new Humans(this, this, this.rand);
    this.physics.add.collider(this.humans.group, this.layer);
    if (!s.humans) s.humans = this.initialAllies();
    for (const h of s.humans) this.humans.spawn(h);
    // 跟隨者喺你後面（入城方向）兩格出現，唔會擋住出入口
    const inward = s.district === 'estate' ? -1 : 1; // 北汐出口喺北面（向下入城），汐景邨喺南面
    s.followers.forEach((h, i) => this.humans.spawn({ ...h, x: p.x + ((i % 3) - 1) * 14, y: data.arrive ? p.y + inward * 2 * T : p.y + 14 }));
    s.followers = [];

    for (const pile of s.piles) this.pileSprite(pile);
    for (const st of s.structures) this.structSprite(st);

    const evac0 = g.evac[0] ?? 0;
    this.boat = this.add
      .image(((evac0 % g.w) + CONFIG.map.evacWidth / 2) * T, (Math.floor(evac0 / g.w) + 3.2) * T, 'boat')
      .setDepth(6)
      .setVisible(false);
    this.heli = this.add.image(0, 0, 'heli').setDepth(23).setVisible(false);
    this.swingGfx = this.add.graphics().setDepth(12);

    // 夜晚遮罩
    this.dark = this.add.renderTexture(0, 0, mapW, mapH).setOrigin(0).setDepth(20);
    this.lightGfx = this.make.graphics({}, false);

    // 雨 / 火
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
    this.fireFx = this.add
      .particles(0, 0, 'fire', {
        speedY: { min: -40, max: -15 },
        speedX: { min: -12, max: 12 },
        lifespan: 600,
        scale: { start: 1.4, end: 0.2 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(21);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH).startFollow(p, true, 0.15, 0.15);
    const fitZoom = () => {
      const { width, height } = this.scale;
      cam.setZoom(Math.max(CONFIG.minZoom, Math.ceil(Math.max(width / mapW, height / mapH))));
    };
    fitZoom();
    this.scale.on('resize', fitZoom);
    this.events.once('shutdown', () => this.scale.off('resize', fitZoom));
    // 每日調色（DESIGN.md §5.1）
    this.grade = cam.filters.external.addColorMatrix();

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

  private districtSeed() {
    return this.s.district === 'estate' ? (this.s.seed ^ 0x5eed) >>> 0 : this.s.seed;
  }

  /** 由另一個區過嚟：企喺出入口內一格 */
  private placeAtExit() {
    const g = this.grid;
    const e = g.exits[Math.floor(g.exits.length / 2)];
    const inward = this.s.district === 'estate' ? -1 : 1;
    this.s.player.x = ((e % g.w) + 0.5) * T;
    this.s.player.y = (Math.floor(e / g.w) + 0.5 + inward * 2) * T;
  }

  /** 每區開頭嘅倖存者：喺唐樓 / 屋邨單位入面等救 */
  private initialAllies(): HumanSave[] {
    const g = this.grid;
    const rand = mulberry32((this.districtSeed() ^ 0x77) >>> 0);
    const resident = tileIndex('7');
    const out: HumanSave[] = [];
    const avoid = [{ x: this.s.player.x, y: this.s.player.y }];
    for (const [id, n] of NPCS.filter(([, n]) => n.district === this.s.district)) {
      for (let tries = 0; tries < 4000; tries++) {
        const i = Math.floor(rand() * g.tiles.length);
        if (g.tiles[i] !== resident) continue;
        const x = ((i % g.w) + 0.5) * T;
        const y = (Math.floor(i / g.w) + 0.5) * T;
        if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < 14 * T)) continue;
        avoid.push({ x, y });
        out.push({ id, name: n.name, faction: 'ally', x, y, hp: HC.ally.hp, mode: 'idle', want: n.want, weapon: n.weapon || undefined });
        break;
      }
    }
    return out;
  }

  /** 掠奪者喺地圖邊出現 */
  private spawnRaiders(n: number) {
    const g = this.grid;
    const p = this.player;
    const R = HC.raider;
    for (let k = 0, tries = 0; k < n && tries < 3000; tries++) {
      const tx = Math.floor(this.rand() * g.w);
      const ty = Math.floor(this.rand() * g.h);
      if (isSolid(g, tx, ty) || (tx > 6 && tx < g.w - 7 && ty > 6)) continue;
      const x = (tx + 0.5) * T;
      const y = (ty + 0.5) * T;
      if (Math.hypot(x - p.x, y - p.y) < 20 * T) continue;
      const weapon = R.weapons[Math.floor(this.rand() * R.weapons.length)];
      const loot = [makeItem(weapon), makeItem(this.rand() < 0.5 ? 'water' : 'luncheon'), ...(this.rand() < 0.5 ? [makeItem('bandage')] : [])];
      this.humans.spawn({ id: `raider${Date.now() % 100000}${k}`, name: '掠奪者', faction: 'raider', x, y, hp: R.hp, mode: 'hostile', weapon, loot });
      k++;
    }
    toast('⚠ 有掠奪者出現！佢哋會追殺你');
  }

  /** 只喺北汐發生嘅一次性事件（人唔喺北汐就等返嚟先做） */
  private districtEvents() {
    const s = this.s;
    if (s.district !== 'beixi') return;
    const g = this.grid;
    const day = dayOf(s.minutes);
    if (day >= 2 && !s.flags.barricades) {
      s.flags.barricades = true;
      for (const i of g.barricades) if (!isSolid(g, i % g.w, Math.floor(i / g.w))) this.setTile(i, 'X');
    }
    if (day >= 7 && !s.flags.dock) {
      s.flags.dock = true;
      const cityH = g.h - CONFIG.map.dockRows;
      this.zombies.spawnRandom(Math.round(Z.dockExtra * s.settings.zombies), this.player.x, this.player.y, 8, (_tx, ty) => ty > cityH - 6);
    }
  }

  /** 去另一個區 */
  private travel(to: DistrictId) {
    this.cancelTask();
    closeInventory();
    closePhone();
    this.snapshot();
    switchDistrict(this.s, to);
    saveGame(this.s); // 唔可以用 saveNow：佢會 snapshot 舊區嘅喪屍
    this.scene.restart({ state: this.s, arrive: true });
    toast(`去咗${DISTRICT_NAMES[to]}`);
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SHIFT,SPACE,E,R,G,C,F,M,P,TAB,ESC,ONE,TWO,THREE,FOUR,FIVE', true) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-F', () => this.toggleFlash());
    kb.on('keydown-C', () => (this.sneak = !this.sneak));
    kb.on('keydown-E', () => this.interact());
    kb.on('keydown-R', () => this.act2());
    kb.on('keydown-G', () => this.throwMolotov());
    kb.on('keydown-SPACE', () => this.shove());
    kb.on('keydown-TAB', () => this.toggleInventory());
    kb.on('keydown-M', () => this.togglePhone('map'));
    kb.on('keydown-P', () => this.togglePhone());
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
        if (a === 'phone') this.togglePhone();
        if (a === 'pause') this.pause();
      };
    }
    // 觸控掣：開局按主要輸入決定；之後用手指撳就轉手機模式，用滑鼠撳就轉返電腦模式
    this.touch = isTouch();
    showTouch(this.touch);
    const onPointer = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch === this.touch || (e.pointerType !== 'mouse' && !touch)) return;
      this.touch = touch;
      showTouch(touch);
    };
    addEventListener('pointerdown', onPointer, true);
    this.events.once('shutdown', () => removeEventListener('pointerdown', onPointer, true));
    setupTouch({
      attack: () => this.attack(),
      shove: () => this.shove(),
      use: () => this.interact(),
      act2: () => this.act2(),
      throw: () => this.throwMolotov(),
    });
  }

  // ───────────────────────── 格仔 / ZWorld ─────────────────────────
  setTile(i: number, ch: string) {
    const idx = tileIndex(ch);
    this.grid.tiles[i] = idx;
    this.s.tileOverrides[i] = idx;
    this.layer.putTileAt(idx, i % this.grid.w, Math.floor(i / this.grid.w));
    this.tilesVersion++;
  }

  private tileCenter(i: number) {
    return { x: ((i % this.grid.w) + 0.5) * T, y: (Math.floor(i / this.grid.w) + 0.5) * T };
  }

  private sfx(name: Parameters<typeof play>[0], x = this.player.x, y = this.player.y, maxTiles = 20) {
    play(name, Math.hypot(x - this.player.x, y - this.player.y), x - this.player.x, maxTiles);
  }

  /** 喪屍打門 / 窗 / 板 */
  bashTile(tile: number, amount: number) {
    const ch = DEF_BY_INDEX[this.grid.tiles[tile]].ch;
    const hp = (this.s.doorHp[tile] ?? CONFIG.tileHp[ch] ?? Z.doorHp) - amount;
    this.s.doorHp[tile] = hp;
    const { x, y } = this.tileCenter(tile);
    if (Math.floor(hp + amount) !== Math.floor(hp)) this.sfx('bash', x, y, 16);
    if (hp > 0) return;
    delete this.s.doorHp[tile];
    this.setTile(tile, BREAKS_TO[ch] ?? 'B');
    const glass = ch === 'W' || ch === 'C';
    this.noise(x, y, glass ? NZ.glass : NZ.doorBreak);
    this.sfx(glass ? 'glass' : 'bash', x, y, 30);
    if (Math.hypot(x - this.player.x, y - this.player.y) < 16 * T) toast(glass ? '乒！有隻窗被打爛咗' : '砰！有塊板 / 道門被撞爛咗');
  }

  onAttack(_z: Zombie) {
    if (this.dead) return;
    const p = this.s.player;
    if (this.sleeping) this.wake('你被襲擊嘈醒！');
    this.cancelTask();
    p.hp -= Z.damageMin + this.rand() * (Z.damageMax - Z.damageMin);
    this.hitCause = '被喪屍殺死';
    this.sfx('hurt');
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

  /** 倖存者 / 掠奪者行到門口會自己開門 */
  openDoor(tile: number) {
    this.setTile(tile, 'O');
    const { x, y } = this.tileCenter(tile);
    this.noise(x, y, NZ.door);
    this.sfx('door', x, y);
  }

  /** 喪屍附近最近嘅人類 */
  humanNear(x: number, y: number, r: number): Human | null {
    let best: Human | null = null;
    let bd = r;
    for (const h of this.humans.list) {
      const d = Math.hypot(h.sprite.x - x, h.sprite.y - y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  onAttackHuman(_z: Zombie, h: unknown) {
    const hu = h as Human;
    this.humans.damage(hu, Z.damageMin + this.rand() * (Z.damageMax - Z.damageMin), this.s.settings.infection, this.s.minutes);
    this.sfx('hurt', hu.sprite.x, hu.sprite.y, 14);
    this.stampBlood(hu.sprite.x, hu.sprite.y);
  }

  /** 掠奪者打你 */
  hurtPlayer(dmg: number, by: string) {
    if (this.dead) return;
    const p = this.s.player;
    if (this.sleeping) this.wake('有人襲擊你！');
    this.cancelTask();
    p.hp -= dmg;
    this.hitCause = by;
    this.sfx('hurt');
    this.cameras.main.flash(120, 110, 20, 32);
    if (this.rand() < Z.lacerationChance && !p.bleeding) {
      p.bleeding = true;
      toast('🩸 你被斬傷，出血！');
    }
    this.stampBlood(this.player.x, this.player.y);
  }

  /** 人類倒低：盟友留低屍體（會屍變），掠奪者跌物資 */
  onHumanDown(h: Human) {
    const s = this.s;
    const items = h.faction === 'raider' ? h.loot ?? [] : h.weapon ? [makeItem(h.weapon)] : [];
    const pile: Pile = { x: h.sprite.x, y: h.sprite.y, items, ...(h.faction === 'ally' ? { turnAt: s.minutes + CONFIG.corpseTurnMin, who: h.name } : {}) };
    s.piles.push(pile);
    this.pileSprite(pile);
    this.stampBlood(h.sprite.x, h.sprite.y);
    toast(h.faction === 'raider' ? '打低咗一個掠奪者，佢跌咗啲嘢' : `💀 ${h.name}死咗……`);
    if (h.faction === 'raider') s.player.kills++;
    this.humans.remove(h);
  }

  private infect() {
    if (!this.s.settings.infection) return; // 自訂難度：關咗感染
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
    const overlay = inventoryOpen() || phoneOpen();
    const slow = overlay ? CONFIG.time.overlaySlow : 1;
    this.physics.world.timeScale = 1 / slow;
    const dt = dtReal * slow;
    const dtMin = dt * minPerSec(s.settings.dayMin) * (this.sleeping ? CONFIG.time.sleepSpeed : 1);
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
    if (moving) p.anims.play('p-walk', true);
    else p.anims.stop();

    // 面向
    if (this.touch) {
      if (moving) p.rotation = Math.atan2(my, mx);
    } else {
      const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      p.rotation = Math.atan2(ptr.y - p.y, ptr.x - p.x);
    }

    // 腳步聲（潛行技能減細）
    this.stepT -= dt;
    if (moving && this.stepT <= 0) {
      this.stepT = NZ.stepEverySec;
      const r = running ? NZ.run * (profOf(s).runNoiseMul ?? 1) : this.sneak ? NZ.sneak * sneakNoiseMul(s) : NZ.walk;
      this.noise(p.x, p.y, r);
      play('step', 0, 0);
    }
    if (moving) this.cancelTask();
    // 潛行經驗：附近有喪屍但冇被發現
    if (this.sneak && moving && this.zombiesNear > 0 && this.zombies.chasingCount === 0) this.xp('sneak', CONFIG.skills.xp.sneakSec * dt);

    this.attackCd -= dt;
    this.shoveCd -= dt;
    this.tickTask(dt);
    this.updateFocus();

    const night = isNight(s.minutes);
    let sight = this.flashlight ? Z.sightTilesFlashlight : night ? Z.sightTilesNight : Z.sightTiles;
    if (isStorm(s.minutes)) sight *= V.stormMul;
    if (this.sneak) sight *= sneakSightMul(s);
    this.zombies.update(dt, p.x, p.y, PL.radius, sight * T, true);
    this.humans.update(dt, p.x, p.y, true, Math.floor(p.y / T) * this.grid.w + Math.floor(p.x / T), this.tilesVersion);

    const cause = tickNeeds(s, dt, dtMin, {
      running,
      zombiesNear: this.zombiesNear,
      dark: nightness(s.minutes) > 0.5,
      flashlight: this.flashlight,
      phoneOpen: phoneOpen(),
      powerOn: powerOn(s.minutes),
    });
    if (this.flashlight && P.battery <= 0) {
      this.flashlight = false;
      toast('電筒冇電');
    }
    this.tickFires(dt);
    if (P.hp <= 0) return this.die(this.hitCause || (cause ?? '傷重'));
    this.hitCause = '';

    this.tickEvents(dtReal, dtMin);
    this.tickSleep();
    this.tickAudio(dtReal);

    if (this.frame++ % V.updateEveryFrames === 0) this.updateVision();
    if (this.frame % V.exploreEveryFrames === 0) this.markExplored();
    if (phoneOpen() && this.frame % 20 === 0) this.renderPhonePanel();

    const wv = this.cameras.main.worldView;
    this.rainRect.setTo(wv.x - 40, wv.y - 60, wv.width + 120, wv.height * 0.6);

    renderHud({
      day: dayOf(s.minutes),
      title: `${dayInfo(s.minutes).title} · ${DISTRICT_NAMES[s.district]}${s.settings.mode === 'sandbox' ? '（沙盒）' : ''}`,
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

  private xp(k: SkillId, amount: number) {
    const msg = gainXp(this.s, k, amount);
    if (msg) {
      toast(msg);
      play('chime');
    }
  }

  // ───────────────────────── 噪音 / 視野 / 調色 ─────────────────────────
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
    // 火會照亮附近
    for (const f of this.fires) {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (castRay(g, p.x, p.y, Math.atan2(f.y - p.y, f.x - p.x), d) >= d) gfx.fillStyle(0xffffff, 0.8).fillCircle(f.x, f.y, CONFIG.throw.radiusTiles * T * 1.5);
    }
    const wv = this.cameras.main.worldView;
    this.dark.clear().fill(0x000000, darkness(s.minutes), wv.x - T, wv.y - T, wv.width + 2 * T, wv.height + 2 * T).erase(gfx).render();

    let near = 0;
    const nearPx = CONFIG.needs.panicNearTiles * T;
    for (const z of this.zombies.list) {
      const v = canSee(g, p.x, p.y, this.cones, z.sprite.x, z.sprite.y);
      z.sprite.setVisible(v);
      if (v && Math.hypot(z.sprite.x - p.x, z.sprite.y - p.y) < nearPx) near++;
    }
    this.zombiesNear = near;
    for (const h of this.humans.list) h.sprite.setVisible(canSee(g, p.x, p.y, this.cones, h.sprite.x, h.sprite.y));

    const w = weatherOf(s.minutes);
    this.rain.emitting = w === 'rain' || w === 'storm';
    this.rain.quantity = w === 'storm' ? 7 : 2;
    this.updateGrade();
  }

  /** 每日 / 天氣調色：晴日暖、暴雨偏藍低對比、斷電夜幾乎全黑 */
  private updateGrade() {
    const s = this.s;
    const key = !powerOn(s.minutes) && nightness(s.minutes) > 0.5 ? 'blackout' : weatherOf(s.minutes);
    if (key === this.gradeKey) return;
    this.gradeKey = key;
    const gr = CONFIG.grade[key];
    const b = gr.blue;
    this.grade.colorMatrix
      .reset()
      .saturate(gr.sat)
      .brightness(gr.bright, true)
      .contrast(gr.contrast, true)
      .multiply([1 - b, 0, 0, 0, 0, 0, 1 - b * 0.4, 0, 0, 0, 0, 0, 1 + b, 0, 0, 0, 0, 0, 1, 0], true);
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
    const cost = (w?.stamina ?? PL.fistStamina) * meleeStaminaMul(s);
    if (P.stamina < cost) return toast('冇晒氣力');
    P.stamina -= cost;
    this.attackCd = w?.cooldown ?? PL.fistCooldown;
    const reach = w?.reach ?? PL.fistReach;
    const angle = this.facing();
    this.drawSwing(angle, reach);
    this.sfx('swing');
    this.noise(this.player.x, this.player.y, NZ.melee);
    const hit = this.targetsInArc(reach, PL.attackArcDeg, angle)[0];
    if (!hit) return this.hitWindow(angle, reach, !w);
    const z = hit.z;
    let dmg = (w?.damage ?? PL.fistDamage) * (profOf(s).damageMul ?? 1) * meleeDamageMul(s);
    if (z.mode === 'down') {
      dmg *= PL.stompMul;
      toast('踩頭！');
    }
    z.hp -= dmg;
    if (z.mode !== 'down') {
      z.mode = 'chase';
      z.timer = Z.chaseMemorySec;
    }
    this.xp('melee', CONFIG.skills.xp.meleeHit);
    this.stampBlood(z.sprite.x, z.sprite.y);
    this.sfx('hit');
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

  /** 冇打中喪屍：面前係窗就打爛佢（爬得過，但好嘈） */
  private hitWindow(angle: number, reach: number, fists: boolean) {
    const g = this.grid;
    const tx = Math.floor((this.player.x + Math.cos(angle) * (reach * 0.8)) / T);
    const ty = Math.floor((this.player.y + Math.sin(angle) * (reach * 0.8)) / T);
    const ch = defAt(g, tx, ty)?.ch;
    if (ch !== 'W' && ch !== 'C') return;
    const i = ty * g.w + tx;
    this.setTile(i, 'V');
    const { x, y } = this.tileCenter(i);
    this.noise(x, y, NZ.glass);
    this.sfx('glass', x, y);
    if (fists && this.rand() < 0.5) {
      this.s.player.bleeding = true;
      toast('徒手打爛窗，割親手出血！');
    } else toast('打爛咗隻窗（好嘈）');
  }

  shove() {
    if (this.dead || this.sleeping || this.shoveCd > 0 || inventoryOpen()) return;
    const P = this.s.player;
    if (P.stamina < PL.shoveStamina) return toast('冇晒氣力');
    P.stamina -= PL.shoveStamina;
    this.shoveCd = PL.shoveCooldown;
    const angle = this.facing();
    this.drawSwing(angle, PL.shoveReach);
    this.sfx('swing');
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

  killZombie(z: Zombie) {
    this.s.player.kills++;
    this.sfx('kill', z.sprite.x, z.sprite.y);
    this.stampBlood(z.sprite.x + 3, z.sprite.y - 2);
    this.stampBlood(z.sprite.x - 3, z.sprite.y + 2);
    if (z.carry?.length) {
      const pile: Pile = { x: z.sprite.x, y: z.sprite.y, items: z.carry };
      this.s.piles.push(pile);
      this.pileSprite(pile);
      toast(z.who ? `${z.who}……安息。佢身上仲有啲嘢` : '你認得佢……係上一個你。佢身上仲有你嘅裝備');
    }
    this.zombies.kill(z);
  }

  private stampBlood(x: number, y: number) {
    const b = this.s.blood;
    b.push(Math.round(x), Math.round(y));
    if (b.length > CONFIG.save.maxBlood * 2) b.splice(0, 2);
    this.bloodRT.stamp('blood', undefined, x, y).render();
  }

  /** 燃燒樽：向滑鼠位置（手機：面前）掟，落地起火燒附近喪屍 */
  throwMolotov() {
    if (this.dead || this.sleeping || inventoryOpen()) return;
    const s = this.s;
    if (!countOf(s, 'molotov')) return toast('冇燃燒樽（製作：空樽 + 火酒 + 布碎）');
    const p = this.player;
    const range = CONFIG.throw.rangeTiles * T;
    let tx: number;
    let ty: number;
    if (this.touch) {
      tx = p.x + Math.cos(p.rotation) * range;
      ty = p.y + Math.sin(p.rotation) * range;
    } else {
      const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const d = Math.min(range, Math.hypot(ptr.x - p.x, ptr.y - p.y));
      const a = Math.atan2(ptr.y - p.y, ptr.x - p.x);
      tx = p.x + Math.cos(a) * d;
      ty = p.y + Math.sin(a) * d;
    }
    // 撞牆就喺牆前落地
    const a = Math.atan2(ty - p.y, tx - p.x);
    const d = Math.min(Math.hypot(tx - p.x, ty - p.y), castRay(this.grid, p.x, p.y, a, range) - 4);
    tx = p.x + Math.cos(a) * d;
    ty = p.y + Math.sin(a) * d;
    consume(s, 'molotov');
    this.renderHotbar();
    this.flying.push({ img: this.add.image(p.x, p.y, 'molotov').setDepth(21), sx: p.x, sy: p.y, tx, ty, t: 0 });
    this.sfx('swing');
  }

  private tickFires(dt: number) {
    for (const f of this.flying) {
      f.t += dt / CONFIG.throw.flightSec;
      const k = Math.min(1, f.t);
      f.img.setPosition(f.sx + (f.tx - f.sx) * k, f.sy + (f.ty - f.sy) * k - Math.sin(k * Math.PI) * 10).setAngle(k * 540);
      if (k < 1) continue;
      f.img.destroy();
      this.fires.push({ x: f.tx, y: f.ty, left: CONFIG.throw.burnSec });
      this.noise(f.tx, f.ty, NZ.molotov);
      this.sfx('glass', f.tx, f.ty);
      this.sfx('fire', f.tx, f.ty);
    }
    this.flying = this.flying.filter((f) => f.t < 1);
    if (!this.fires.length) return;
    const R = CONFIG.throw.radiusTiles * T;
    for (const f of this.fires) {
      f.left -= dt;
      this.fireFx.emitParticleAt(f.x + (this.rand() - 0.5) * R * 1.4, f.y + (this.rand() - 0.5) * R * 1.4, 2);
      for (const z of [...this.zombies.list]) {
        if (Math.hypot(z.sprite.x - f.x, z.sprite.y - f.y) > R) continue;
        z.hp -= CONFIG.throw.dps * dt;
        if (z.hp <= 0) this.killZombie(z);
      }
      if (Math.hypot(this.player.x - f.x, this.player.y - f.y) < R) {
        this.s.player.hp -= CONFIG.throw.playerDps * dt;
        if (this.frame % 30 === 0) toast('🔥 好熱！快啲走開');
      }
    }
    this.fires = this.fires.filter((f) => f.left > 0);
  }

  // ───────────────────────── 互動 ─────────────────────────
  private hasTool(...ids: string[]) {
    return ids.some((id) => countOf(this.s, id) > 0);
  }

  /** 面前格嘅可以做嘅動作 */
  private actionsFor(tile: number): Focus | null {
    const s = this.s;
    const g = this.grid;
    const ch = DEF_BY_INDEX[g.tiles[tile]].ch;
    const { x: cx, y: cy } = this.tileCenter(tile);
    const f: Focus = {};
    const canBoard = this.hasTool('hammer') && countOf(s, 'plank') > 0 && countOf(s, 'nails') > 0;
    const boardLabel = canBoard ? 'R 釘板' : 'R 釘板（要錘仔、木板、釘）';
    switch (ch) {
      case 'D':
        f.e = { label: 'E 開門', run: () => this.toggleDoor(tile, 'O') };
        f.r = { label: boardLabel, run: () => this.board(tile, 'J') };
        break;
      case 'O':
        f.e = { label: 'E 關門', run: () => this.toggleDoor(tile, 'D') };
        break;
      case 'W':
        f.e = { label: 'E 拉窗簾', run: () => this.curtain(tile, 'C') };
        f.r = { label: boardLabel, run: () => this.board(tile, 'H') };
        break;
      case 'C':
        f.e = { label: 'E 開窗簾', run: () => this.curtain(tile, 'W') };
        f.r = { label: boardLabel, run: () => this.board(tile, 'H') };
        break;
      case 'V':
        f.r = { label: boardLabel, run: () => this.board(tile, 'H') };
        break;
      case 'H':
      case 'J':
        f.r = {
          label: this.hasTool('hammer', 'crowbar') ? 'R 拆板' : 'R 拆板（要錘仔或撬棍）',
          run: () => this.unboard(tile, ch === 'H' ? 'W' : 'D'),
        };
        break;
      case 'K':
        f.e = {
          label: this.hasTool('crowbar') ? 'E 撬開凍倉門' : '凍倉鐵門鎖住咗（要撬棍）',
          run: () => this.pry(tile),
        };
        break;
      case 'Q': {
        const to: DistrictId = s.district === 'beixi' ? 'estate' : 'beixi';
        f.e = { label: `E 去${DISTRICT_NAMES[to]}`, run: () => this.travel(to) };
        break;
      }
      case 'A':
        f.e = { label: 'E 弄響汽車警報（引開喪屍）', run: () => this.carAlarm(cx, cy) };
        break;
      case 'T':
        f.e = { label: waterOn(s.minutes) ? 'E 飲水 / 裝水' : '水龍頭（斷咗水）', run: () => this.tap() };
        break;
      case 'G':
        f.e = { label: 'E 用爐頭煮生嘢', run: () => this.cook(cx, cy) };
        break;
      case 'b':
        f.e = { label: 'E 瞓覺', run: () => this.sleep() };
        f.r = this.dismantleAction(tile, ch);
        break;
      case 't':
        f.r = this.dismantleAction(tile, ch);
        break;
    }
    if (CONTAINER_CH.includes(ch)) {
      const name = CONFIG.containers[ch].name;
      f.e = {
        label: s.containers[tile] ? `E 打開${name}（搜過）` : `E 搜${name}`,
        run: () => this.searchContainer(tile, ch),
      };
      if (ch === 'w' && s.containers[tile]) f.r = this.dismantleAction(tile, ch);
    }
    return f.e || f.r ? f : null;
  }

  private dismantleAction(tile: number, ch: string): Action {
    return {
      label: this.hasTool('hammer', 'crowbar') ? 'R 拆（攞木板）' : 'R 拆（要錘仔或撬棍）',
      run: () => this.dismantle(tile, ch),
    };
  }

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
        if (!defAt(g, tx, ty)) continue;
        const cx = (tx + 0.5) * T;
        const cy = (ty + 0.5) * T;
        const dist = Math.hypot(cx - p.x, cy - p.y);
        if (dist > PL.reach + 8) continue;
        const off = angDiff(Math.atan2(cy - p.y, cx - p.x), p.rotation);
        if (dist > 10 && off > rad(80)) continue;
        const score = dist + off * 10;
        if (score >= bestScore) continue;
        const f = this.actionsFor(ty * g.w + tx);
        if (f) {
          best = f;
          bestScore = score;
        }
      }
    for (const pile of s.piles) {
      const dist = Math.hypot(pile.x - p.x, pile.y - p.y);
      if (dist <= PL.reach && dist < bestScore) {
        const corpse = pile.turnAt !== undefined;
        const name = pile.who ? `${pile.who}嘅屍體` : '你嘅屍體';
        best = { e: { label: corpse ? `E 搜${name}` : 'E 睇地上', run: () => this.openWith(pile.items, corpse ? name : '地上', pile) } };
        bestScore = dist;
      }
    }
    for (const st of s.structures) {
      const dist = Math.hypot(st.x - p.x, st.y - p.y);
      if (dist <= PL.reach && dist < bestScore) {
        best = {
          e: { label: `E 雨水收集器（${Math.floor(st.water / 100)} 樽水）`, run: () => this.useCollector(st) },
          r: { label: 'R 收返', run: () => this.pickupStructure(st) },
        };
        bestScore = dist;
      }
    }
    for (const h of this.humans.list) {
      if (h.faction !== 'ally') continue;
      const dist = Math.hypot(h.sprite.x - p.x, h.sprite.y - p.y);
      const off = angDiff(Math.atan2(h.sprite.y - p.y, h.sprite.x - p.x), p.rotation);
      const score = dist + off * 10; // 同其他互動一樣：要面向佢
      if (dist <= PL.reach + 4 && (dist < 10 || off <= rad(80)) && score < bestScore) {
        best = this.humanActions(h);
        bestScore = score;
      }
    }
    this.focus = best;
    const label = this.task ? null : [best?.e?.label, best?.r?.label].filter(Boolean).join(' · ') || null;
    setPrompt(label);
    const act2 = document.getElementById('t-act2')!;
    act2.classList.toggle('hidden', !best?.r || !!this.task);
    if (best?.r) act2.textContent = best.r.label.replace(/^R /, '').replace(/（.*/, '');
    document.getElementById('t-throw')!.classList.toggle('hidden', !this.touch || !countOf(s, 'molotov'));
  }

  /** 同倖存者互動：招募 / 叫佢跟 / 叫佢守 / 幫佢包紮 */
  private humanActions(h: Human): Focus {
    const s = this.s;
    const f: Focus = {};
    if (h.mode === 'idle') {
      f.e = {
        label: `E 同${h.name}傾偈（佢想要${WANT_NAME[h.want ?? 'food']}）`,
        run: () => {
          const npc = NPCS.find(([id]) => id === h.id)?.[1];
          const i = s.player.inv.findIndex((it) => ITEMS[it.id].kind === h.want || (h.want === 'med' && it.id === 'bandage'));
          if (i < 0) return toast(`${h.name}：「${npc?.ask ?? '有冇嘢幫到我？'}」`);
          s.player.inv.splice(i, 1);
          h.mode = 'follow';
          toast(`${h.name}：「${npc?.join ?? '多謝！'}」（加入咗）`);
          play('chime');
          this.renderHotbar();
        },
      };
    } else {
      f.e =
        h.mode === 'follow'
          ? { label: `E 叫${h.name}守喺度`, run: () => ((h.mode = 'guard'), (h.gx = h.sprite.x), (h.gy = h.sprite.y), toast(`${h.name}會守喺呢度`)) }
          : { label: `E 叫${h.name}跟住你`, run: () => ((h.mode = 'follow'), toast(`${h.name}跟住你`)) };
    }
    if (h.hp < HC.ally.hp - 5 && countOf(s, 'bandage'))
      f.r = {
        label: `R 幫${h.name}包紮（${Math.round(h.hp)}/${HC.ally.hp}）`,
        run: () => {
          consume(s, 'bandage');
          h.hp = Math.min(HC.ally.hp, h.hp + HC.bandageHeal * (profOf(s).healMul ?? 1));
          if (h.turnAt === undefined) toast(`幫${h.name}包紮好`);
          else toast(`幫${h.name}包紮好……但佢被咬過，唔知仲有幾耐`);
          this.xp('aid', CONFIG.skills.xp.aid);
          this.renderHotbar();
        },
      };
    return f;
  }

  interact() {
    if (this.dead || this.sleeping) return;
    if (inventoryOpen()) return this.toggleInventory();
    this.focus?.e?.run();
  }

  act2() {
    if (this.dead || this.sleeping || inventoryOpen()) return;
    this.focus?.r?.run();
  }

  private startTask(sec: number, done: () => void, sfx?: Task['sfx']) {
    this.task = { t: 0, total: sec, done, sfx, tick: 0 };
  }

  private cancelTask() {
    if (this.task) this.task = null;
  }

  private tickTask(dt: number) {
    const k = this.task;
    if (!k) return setProgress(null);
    k.t += dt;
    k.tick = (k.tick ?? 0) - dt;
    if (k.sfx && k.tick <= 0) {
      k.tick = k.sfx === 'hammer' ? 0.35 : 0.6;
      this.sfx(k.sfx);
      if (k.sfx === 'hammer') this.noise(this.player.x, this.player.y, NZ.hammer);
    }
    setProgress(Math.min(1, k.t / k.total));
    if (k.t < k.total) return;
    this.task = null;
    setProgress(null);
    k.done();
  }

  private toggleDoor(tile: number, to: 'O' | 'D') {
    const { x: cx, y: cy } = this.tileCenter(tile);
    if (to === 'D') {
      const blocked = [this.player, ...this.zombies.list.map((z) => z.sprite)].some((o) => Math.abs(o.x - cx) < T * 0.7 && Math.abs(o.y - cy) < T * 0.7);
      if (blocked) return toast('有嘢擋住道門');
    }
    this.setTile(tile, to);
    this.noise(cx, cy, NZ.door);
    this.sfx('door', cx, cy);
  }

  private curtain(tile: number, to: 'C' | 'W') {
    this.setTile(tile, to);
    this.sfx('search');
    if (to === 'C') toast('拉埋窗簾：外面望唔入嚟，夜晚開電筒都唔會引喪屍');
  }

  private board(tile: number, to: 'H' | 'J') {
    const s = this.s;
    if (!this.hasTool('hammer') || !countOf(s, 'plank') || !countOf(s, 'nails')) return toast('釘板要：錘仔、木板、一包釘');
    this.startTask(B.boardSec * carpTimeMul(s), () => {
      // 釘緊嗰陣隻窗可能已經俾喪屍打爛：爛窗照釘得
      const now = DEF_BY_INDEX[this.grid.tiles[tile]].ch;
      if (!(to === 'H' ? 'WCV' : 'D').includes(now)) return toast('釘唔到：嗰度已經變咗');
      consume(s, 'plank');
      consume(s, 'nails');
      this.setTile(tile, to);
      s.doorHp[tile] = B.boardHp * carpHpMul(s);
      this.xp('carp', CONFIG.skills.xp.carp);
      toast(`釘好咗（耐久 ${Math.round(s.doorHp[tile])}）`);
      this.renderHotbar();
    }, 'hammer');
  }

  private unboard(tile: number, to: 'W' | 'D') {
    if (!this.hasTool('hammer', 'crowbar')) return toast('拆板要錘仔或撬棍');
    this.startTask(B.dismantleSec * carpTimeMul(this.s), () => {
      this.setTile(tile, to);
      delete this.s.doorHp[tile];
      this.s.player.inv.push(makeItem('plank'));
      toast('拆返塊木板落嚟');
    }, 'hammer');
  }

  private dismantle(tile: number, ch: string) {
    if (!this.hasTool('hammer', 'crowbar')) return toast('拆傢俬要錘仔或撬棍');
    this.startTask(B.dismantleSec * carpTimeMul(this.s), () => {
      if (DEF_BY_INDEX[this.grid.tiles[tile]].ch !== ch) return;
      const loot = B.dismantle[ch] ?? ['plank'];
      // 衣櫃入面仲有嘢：放喺地上
      const left = this.s.containers[tile];
      this.setTile(tile, '7');
      const { x, y } = this.tileCenter(tile);
      const pile: Pile = { x, y, items: [...(left ?? []), ...loot.map(makeItem)] };
      delete this.s.containers[tile];
      this.s.piles.push(pile);
      this.pileSprite(pile);
      this.xp('carp', CONFIG.skills.xp.carp);
      toast('拆咗，材料喺地上');
    }, 'hammer');
  }

  private pry(tile: number) {
    if (!this.hasTool('crowbar')) return toast('鐵門鎖住咗，要撬棍先撬得開');
    const { x, y } = this.tileCenter(tile);
    this.startTask(4, () => {
      this.setTile(tile, 'B');
      this.noise(x, y, NZ.doorBreak);
      this.sfx('bash', x, y);
      toast('撬開咗凍倉鐵門，裡面好凍……');
    }, 'hammer');
  }

  private carAlarm(cx: number, cy: number) {
    if (this.alarms.some((a) => Math.hypot(a.x - cx, a.y - cy) < T * 3)) return;
    this.alarms.push({ x: cx, y: cy, left: NZ.carAlarmSec, next: 0 });
    toast('嗶嗶嗶——汽車警報響起！');
  }

  private tap() {
    const s = this.s;
    if (!waterOn(s.minutes)) return toast('冇水……第三日開始斷咗水。用雨水收集器或者樽裝水');
    s.player.thirst = 100;
    const n = fillBottles(s);
    toast(n ? `飲飽咗水，仲裝滿咗 ${n} 個空樽` : '飲飽咗水（有空樽可以順手裝水）');
    this.sfx('eat');
    refreshInventory();
  }

  private cook(cx: number, cy: number) {
    const s = this.s;
    if (!s.player.inv.some((it) => ITEMS[it.id].raw)) return toast('冇生嘢要煮（生雞翼、生魚、白米）');
    this.startTask(CONFIG.cook.sec, () => {
      toast(cookAll(s, this.rand));
      this.renderHotbar();
    }, 'search');
    this.noise(cx, cy, NZ.cook);
  }

  private sleep() {
    if (this.zombies.chasingCount > 0) return toast('附近有喪屍，瞓唔落');
    this.sleeping = true;
    document.getElementById('sleep')!.classList.remove('hidden');
  }

  private searchContainer(tile: number, ch: string) {
    const s = this.s;
    if (s.containers[tile]) return this.openWith(s.containers[tile], CONFIG.containers[ch].name);
    this.startTask(CONFIG.containers[ch].sec, () => {
      const g = this.grid;
      s.containers[tile] = rollContainer(this.districtSeed(), tile, g.loot[tile], {
        lootMul: s.settings.loot,
        minutes: s.minutes,
        fridge: ch === 'f',
        shelfMul: profOf(s).shelfMul ?? 1,
        clue: g.clues[tile],
        sample: tile === g.sampleTile,
      });
      this.openWith(s.containers[tile], CONFIG.containers[ch].name);
    }, 'search');
  }

  // ───────────────────────── 雨水收集器 ─────────────────────────
  private structSprite(st: Structure) {
    this.structSprites.set(st, this.add.image(st.x, st.y, 'collector').setDepth(5));
  }

  private placeCollector() {
    const s = this.s;
    const p = this.player;
    const ch = defAt(this.grid, Math.floor(p.x / T), Math.floor(p.y / T))?.ch ?? '';
    if (!OUTDOOR_CH.includes(ch)) return toast('雨水收集器要放喺室外先接到雨');
    consume(s, 'collector');
    const st: Structure = { x: p.x, y: p.y, kind: 'collector', water: 0 };
    s.structures.push(st);
    this.structSprite(st);
    toast('放低咗雨水收集器：落雨就會儲水');
    refreshInventory();
  }

  private useCollector(st: Structure) {
    const s = this.s;
    if (st.water < 100) return toast('仲未儲夠一樽水');
    let n = 0;
    while (st.water >= 100 && fillBottles(s, 1)) {
      st.water -= 100;
      n++;
    }
    if (!n) {
      st.water -= 100;
      s.player.thirst = Math.min(100, s.player.thirst + 40);
      toast('直接飲咗啲雨水');
    } else toast(`裝咗 ${n} 樽雨水`);
    this.sfx('eat');
  }

  private pickupStructure(st: Structure) {
    const s = this.s;
    s.structures.splice(s.structures.indexOf(st), 1);
    this.structSprites.get(st)?.destroy();
    this.structSprites.delete(st);
    s.player.inv.push(makeItem('collector'));
    toast('收返雨水收集器（儲咗嘅水冇咗）');
  }

  // ───────────────────────── 背包 / 手機 / 快捷欄 ─────────────────────────
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
    const p = this.player;
    const pile = this.s.piles.find((pl) => pl.turnAt === undefined && Math.hypot(pl.x - p.x, pl.y - p.y) < PL.reach);
    this.ground = pile ? { items: pile.items, name: '地上', pile } : { items: [], name: '地上' };
    this.showInventory();
  }

  private showInventory() {
    if (phoneOpen()) closePhone();
    const s = this.s;
    const after = (msg: string) => {
      if (msg === PLACE) return this.placeCollector();
      if (msg) {
        toast(msg);
        if (msg.startsWith('📱')) play('chime');
        else if (/食|飲/.test(msg)) play('eat');
      }
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
        minutes: s.minutes,
        recipes: Object.entries(RECIPES).map(([id, r]) => ({
          id,
          name: r.name,
          needs: Object.entries(r.needs)
            .map(([nid, n]) => `${ITEMS[nid].name} ${Math.min(countOf(s, nid), n)}/${n}`)
            .concat((r.tools ?? []).map((t) => `工具：${ITEMS[t].name}${countOf(s, t) ? '✓' : '✗'}`))
            .join('、'),
          ok: canCraft(s, r),
          help: `需要：${Object.entries(r.needs).map(([nid, n]) => `${ITEMS[nid].name}×${n}`).join('、')}${r.tools ? `；工具：${r.tools.map((t) => ITEMS[t].name).join('、')}（唔會用走）` : ''}。${r.skill ? `加${SKILL_NAMES[r.skill]}經驗。` : ''}`,
        })),
      }),
      {
        use: (i) => after(useItem(s, i, this.rand)),
        take: (j) => {
          if (!this.ground) return;
          after(takeItem(s, this.ground.items, j));
          play('pickup');
        },
        takeAll: () => {
          if (!this.ground) return;
          const msgs: string[] = [];
          for (let j = 0; j < this.ground.items.length; ) {
            const before = this.ground.items.length;
            const msg = takeItem(s, this.ground.items, j);
            if (msg) msgs.push(msg);
            if (this.ground.items.length === before) j++; // 太重攞唔到，試下一件
          }
          after([...new Set(msgs)].join('　'));
          play('pickup');
        },
        drop: (i) => {
          if (!this.ground) return;
          if (!this.ground.pile && this.ground.name === '地上') {
            const pile: Pile = { x: this.player.x, y: this.player.y, items: this.ground.items };
            s.piles.push(pile);
            this.pileSprite(pile);
            this.ground.pile = pile;
          }
          dropItem(s, this.ground.items, i);
          after('');
        },
        unequip: (slot) => after((unequip(s, slot), '')),
        craft: (id) => {
          after(craft(s, id));
          play('hammer');
        },
      },
    );
  }

  private pileSprite(pile: Pile) {
    this.pileSprites.set(pile, this.add.image(pile.x, pile.y, pile.turnAt !== undefined ? 'corpse' : 'pile').setDepth(5));
  }

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
    const id = this.s.player.hotbar[i];
    if (id && ITEMS[id].kind === 'throw') return this.throwMolotov();
    const msg = useHotbar(this.s, i, this.rand);
    if (msg === PLACE) this.placeCollector();
    else if (msg) toast(msg);
    this.renderHotbar();
    refreshInventory();
  }

  private toggleFlash() {
    if (this.s.player.battery <= 0) return toast('電筒冇電，要換電池');
    this.flashlight = !this.flashlight;
    play('click');
  }

  togglePhone(tab?: 'map') {
    if (this.dead) return;
    if (inventoryOpen()) this.toggleInventory();
    if (phoneOpen() && (!tab || phoneTab() === tab)) return closePhone();
    openPhone(tab ?? phoneTab(), () => this.renderPhonePanel());
    play('click');
  }

  /** 手機內容：地圖、筆記（線索）、電台、技能 */
  private renderPhonePanel() {
    const s = this.s;
    const P = s.player;
    const day = Math.min(dayOf(s.minutes), CONFIG.time.lastDay);
    const total = story.clues.length;
    const notes =
      `<p>已收集線索 <b>${s.clues.length}/${total}</b> <span class="info" tabindex="0">ⓘ<span class="pop">線索散落喺唔同地點嘅櫃、雪櫃、貨架。集齊 ${story.cluesForTruth} 件以上，再帶住凍倉入面嘅「密封樣本箱」上船，就會解鎖真相結局。</span></span></p>` +
      story.clues
        .map((c) => (s.clues.includes(c.id) ? `<div class="note"><b>${c.title}</b><br>${c.text}</div>` : `<div class="note locked">？？？（喺${['', '便利店', '藥房', '五金舖', '茶餐廳', '街市', '警崗', '唐樓', '夜市', '碼頭'][c.loc]}附近）</div>`))
        .join('');
    const radio = story.days
      .slice(0, day)
      .map((d, i) => `<div class="note"><b>第${i + 1}日 · ${d.title}</b><br>📻 ${d.radio}</div>`)
      .reverse()
      .join('');
    const skills = (Object.keys(SKILL_NAMES) as SkillId[])
      .map((k) => {
        const lv = skillLevel(P, k);
        const L = CONFIG.skills.levels;
        const pct = lv >= L.length - 1 ? 100 : ((P.skills[k] - L[lv]) / (L[lv + 1] - L[lv])) * 100;
        return `<div class="skill"><span style="width:40px">${SKILL_NAMES[k]}</span><span style="width:36px">Lv${lv}</span><i><b style="width:${pct}%"></b></i><span class="info" tabindex="0">ⓘ<span class="pop">${SKILL_HELP[k]}</span></span></div>`;
      })
      .join('');
    renderPhone({ clock: `第${dayOf(s.minutes)}日 ${clock(s.minutes)}`, battery: P.phone, notes, radio, skills });
    if (phoneTab() === 'map' && P.phone > 0) {
      const marks = s.piles.filter((p) => p.turnAt !== undefined).map((p) => ({ x: p.x / T, y: p.y / T, color: '#e0384f' }));
      for (const h of this.humans.list) if (h.faction === 'ally') marks.push({ x: h.sprite.x / T, y: h.sprite.y / T, color: h.mode === 'idle' ? '#7dc06a' : '#39d0d8' });
      for (const e of this.grid.exits) marks.push({ x: (e % this.grid.w) + 0.5, y: Math.floor(e / this.grid.w) + 0.5, color: '#e0c040' });
      if (s.clues.length >= 6 && this.grid.sampleTile >= 0) {
        // 線索夠多先知凍倉喺邊
        const st = this.tileCenter(this.grid.sampleTile);
        marks.push({ x: st.x / T, y: st.y / T, color: '#c04ad0' });
      }
      drawMap(phoneCanvas(), this.grid, this.explored, this.player.x / T, this.player.y / T, marks);
    }
  }

  private pause() {
    if (this.dead) return;
    if (inventoryOpen()) return this.toggleInventory();
    if (phoneOpen()) return closePhone();
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

  // ───────────────────────── 時間 / 事件 / 聲音 ─────────────────────────
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

  /** 新一日：標題卡 + 世界變化（DESIGN.md §2.3；第 7 日之後係沙盒隨機事件） */
  private checkDay() {
    const s = this.s;
    const day = dayOf(s.minutes);
    if (s.daysStarted >= day) return;
    s.daysStarted = day;
    const g = this.grid;
    const p = this.player;
    const cityH = g.h - CONFIG.map.dockRows;
    // 自訂難度喪屍倍數；沙盒有上限，唔好無限加到卡
    const n = (k: number) => Math.max(0, Math.min(CONFIG.sandbox.maxZombies - this.zombies.list.length, Math.round(k * s.settings.zombies)));
    const ev = day > CONFIG.time.lastDay ? sandboxEvent(s.seed, day) : null;
    if (day >= 2) this.zombies.spawnRandom(n(Z.perDay), p.x, p.y, Z.minSpawnTiles, (tx, ty) => tx < 6 || tx > g.w - 7 || ty < 6);
    if (day === 6 || ev === 'horde') {
      const horde = this.zombies.spawnRandom(n(Z.hordeSize), p.x, p.y, Z.minSpawnTiles, (tx, ty) => tx < 5 && ty < cityH);
      const e = g.evac[0];
      if (e !== undefined) this.zombies.sendTo(horde, ((e % g.w) + 0.5) * T, (Math.floor(e / g.w) - 3) * T);
      else this.zombies.sendTo(horde, p.x, p.y);
    }
    if (day === 6 || ev === 'raiders') this.spawnRaiders(HC.raider.count);
    this.districtEvents();
    if (this.sleeping) this.wake('新一日');
    const info = dayInfo(s.minutes);
    this.scene.pause();
    showDayCard(day, info.title, info.radio, () => {
      this.scene.resume();
      this.saveNow();
    });
  }

  private tickEvents(dtReal: number, dtMin: number) {
    const s = this.s;
    for (const a of this.alarms) {
      a.left -= dtReal;
      a.next -= dtReal;
      if (a.next <= 0) {
        a.next = 2;
        this.noise(a.x, a.y, NZ.carAlarm);
      }
    }
    this.alarms = this.alarms.filter((a) => a.left > 0);

    // 第 2 日：直升機
    const heliDay = dayOf(s.minutes) === 2 || (dayOf(s.minutes) > CONFIG.time.lastDay && sandboxEvent(s.seed, dayOf(s.minutes)) === 'heli');
    if (heliDay && !isNight(s.minutes)) {
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

    // 夜晚電筒照住冇窗簾嘅窗：外面嘅喪屍見到光會過嚟
    this.lightLureT -= dtReal;
    if (this.flashlight && this.cones[2] && nightness(s.minutes) > 0.5 && this.lightLureT <= 0) {
      this.lightLureT = NZ.windowLightEverySec;
      this.windowLightLure();
    }

    // 雨水收集器
    const w = weatherOf(s.minutes);
    if (w === 'rain' || w === 'storm') {
      const add = (w === 'storm' ? CONFIG.collector.stormPerMin : CONFIG.collector.rainPerMin) * dtMin;
      for (const st of s.structures) st.water = Math.min(CONFIG.collector.capacity, st.water + add);
    }

    // 被咬嘅倖存者屍變
    for (const h of [...this.humans.list]) {
      if (h.turnAt === undefined || s.minutes < h.turnAt) continue;
      this.zombies.spawn(h.sprite.x, h.sprite.y, Z.hp, h.weapon ? [makeItem(h.weapon)] : [], h.name);
      toast(`😱 ${h.name}屍變咗！`);
      this.humans.remove(h);
    }

    // 屍體變喪屍（上一輪嘅你）
    for (const pile of [...s.piles]) {
      if (pile.turnAt === undefined || s.minutes < pile.turnAt) continue;
      this.zombies.spawn(pile.x, pile.y, Z.hp, pile.items, pile.who);
      this.pileSprites.get(pile)?.destroy();
      this.pileSprites.delete(pile);
      s.piles.splice(s.piles.indexOf(pile), 1);
    }
  }

  private windowLightLure() {
    const flash = this.cones[2];
    if (!flash) return;
    const g = this.grid;
    const p = this.player;
    const r = flash.radius;
    const W = tileIndex('W');
    const Vw = tileIndex('V');
    let lured = 0;
    for (let ty = Math.floor((p.y - r) / T); ty <= Math.floor((p.y + r) / T) && lured < 3; ty++)
      for (let tx = Math.floor((p.x - r) / T); tx <= Math.floor((p.x + r) / T) && lured < 3; tx++) {
        const t = g.tiles[ty * g.w + tx];
        if (t !== W && t !== Vw) continue;
        const cx = (tx + 0.5) * T;
        const cy = (ty + 0.5) * T;
        // 用面向玩家嗰邊試，光照到隻窗
        const a = Math.atan2(p.y - cy, p.x - cx);
        if (!canSee(g, p.x, p.y, [flash], cx + Math.cos(a) * 9, cy + Math.sin(a) * 9)) continue;
        // 光喺窗外嗰格（窗本身係實心格，聲源要放喺行得嘅地方）
        this.noise(cx - Math.cos(a) * T, cy - Math.sin(a) * T, NZ.windowLight);
        lured++;
      }
  }

  private tickAudio(dtReal: number) {
    const s = this.s;
    const w = weatherOf(s.minutes);
    setLoop('rain', w === 'storm' ? 1 : w === 'rain' ? 0.5 : 0);
    setLoop('heli', this.heliPass ? Math.max(0, 1 - Math.hypot(this.heli.x - this.player.x, this.heli.y - this.player.y) / (40 * T)) : 0);
    const alarm = this.alarms.reduce((m, a) => Math.max(m, 1 - Math.hypot(a.x - this.player.x, a.y - this.player.y) / (40 * T)), 0);
    setLoop('alarm', Math.max(0, alarm));
    // 附近喪屍呻吟
    this.groanT -= dtReal;
    if (this.groanT <= 0) {
      this.groanT = CONFIG.audio.groanEverySec * (0.5 + this.rand());
      const near = this.zombies.list.filter((z) => z.active && Math.hypot(z.sprite.x - this.player.x, z.sprite.y - this.player.y) < CONFIG.audio.groanTiles * T);
      const z = near[Math.floor(this.rand() * near.length)];
      if (z) this.sfx('groan', z.sprite.x, z.sprite.y, CONFIG.audio.groanTiles);
    }
    // 驚恐心跳
    this.heartT -= dtReal;
    if (s.player.panic >= CONFIG.needs.panicShakeAt && this.heartT <= 0) {
      this.heartT = 1.2 - (s.player.panic / 100) * 0.5;
      play('heart');
    }
  }

  private checkEvac() {
    const s = this.s;
    const T7 = CONFIG.time;
    const h = hourOf(s.minutes);
    const present = dayOf(s.minutes) === T7.lastDay && h >= T7.boatArriveHour && h < T7.boatLeaveHour;
    this.boat.setVisible(present);
    if (s.ended || s.settings.mode === 'sandbox') return;
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
    setLoop('rain', 0);
    setLoop('alarm', 0);
    setLoop('heli', 0);
    const saved = this.humans.list.filter((h) => h.mode === 'follow' && Math.hypot(h.sprite.x - this.player.x, h.sprite.y - this.player.y) < 5 * T);
    const stats = `生存 ${this.survived()} · 殺咗 ${s.player.kills} 隻喪屍 · 死過 ${s.deaths} 次 · 線索 ${s.clues.length}/${story.clues.length} · 救咗 ${saved.length} 個人${saved.length ? `（${saved.map((h) => h.name).join('、')}）` : ''}`;
    if (kind === 'escaped') {
      deleteSave();
      const truth = countOf(s, 'sample') > 0 && s.clues.length >= story.cluesForTruth;
      showEnding(
        truth ? '真相結局' : '撤離成功',
        truth
          ? `${story.truth}<br><br>${stats}`
          : `第七日 ${clock(s.minutes)}，你登上咗北汐碼頭最後一班撤離船。${countOf(s, 'sample') ? '<br>你帶住個樣本箱，但係唔夠證據證明佢係咩……' : ''}<br>${stats}`,
        { 返回標題: () => location.reload() },
      );
    } else {
      this.saveNow();
      showEnding('留低', `18:00，撤離船開走咗。你望住佢消失喺海平線……<br>${stats}<br>北汐仍然有路走：你可以繼續生存落去。`, {
        繼續生存: () => {
          s.settings.mode = 'sandbox'; // 之後每日隨機事件
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
    this.task = null;
    setProgress(null);
    document.getElementById('sleep')!.classList.add('hidden');
    closeInventory();
    closePhone();
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

  private snapshot() {
    const s = this.s;
    if (!this.dead) {
      s.player.x = this.player.x;
      s.player.y = this.player.y;
    }
    s.zombies = this.zombies.toSave();
    s.explored = bitsToB64(this.explored);
    s.humans = this.humans.list.filter((h) => h.mode !== 'follow').map((h) => this.humans.toSave(h));
    s.followers = this.humans.list.filter((h) => h.mode === 'follow').map((h) => this.humans.toSave(h));
  }

  saveNow() {
    this.snapshot();
    this.lastSave = this.s.minutes;
    return saveGame(this.s);
  }
}
