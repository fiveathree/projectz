// 主遊戲（Phase 0 技術驗證）
import * as Phaser from 'phaser';
import { CONFIG } from '../config';
import { generateMap, type Grid, mulberry32, solidIndices } from '../world/mapgen';
import { canSee, type ViewCone, visibilityPolygon } from '../world/vision';
import { Zombies } from '../systems/zombies';
import { hud } from '../ui/hud';

const T = CONFIG.tile;
const V = CONFIG.vision;
const rad = (deg: number) => (deg * Math.PI) / 180;

type Body = Phaser.Physics.Arcade.Body;

export class WorldScene extends Phaser.Scene {
  private grid!: Grid;
  private player!: Phaser.Physics.Arcade.Sprite & { body: Body };
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private zombies!: Zombies;
  private dark!: Phaser.GameObjects.RenderTexture;
  private lightGfx!: Phaser.GameObjects.Graphics;
  private flashlight = false;
  private cones: ViewCone[] = [];
  private frame = 0;

  constructor() {
    super('world');
  }

  create() {
    const rand = mulberry32(CONFIG.seed);
    const g = (this.grid = generateMap(rand));
    const mapW = g.w * T;
    const mapH = g.h * T;

    // 地圖
    const rows: number[][] = [];
    for (let y = 0; y < g.h; y++) rows.push(Array.from(g.tiles.subarray(y * g.w, (y + 1) * g.w)));
    const map = this.make.tilemap({ data: rows, tileWidth: T, tileHeight: T });
    const layer = map.createLayer(0, map.addTilesetImage('tiles')!, 0, 0)!;
    map.setCollision(solidIndices());
    this.physics.world.setBounds(0, 0, mapW, mapH);

    // 玩家：街口中間出生
    const p = this.physics.add.sprite((Math.floor(g.w / 2) + 0.5) * T, (Math.floor(g.h / 2) + 0.5) * T, 'player');
    const r = CONFIG.player.radius;
    p.setCircle(r, p.width / 2 - r, p.height / 2 - r).setCollideWorldBounds(true).setDepth(11);
    this.player = p as typeof this.player;

    this.zombies = new Zombies(this, g, rand, p.x, p.y);
    this.physics.add.collider(p, layer);
    this.physics.add.collider(this.zombies.group, layer);

    // 鏡頭
    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH).startFollow(p, true, 0.15, 0.15);
    const fitZoom = () => {
      const { width, height } = this.scale;
      cam.setZoom(Math.max(CONFIG.minZoom, Math.ceil(Math.max(width / mapW, height / mapH))));
    };
    fitZoom();
    this.scale.on('resize', fitZoom);

    // 夜晚遮罩：鋪滿地圖嘅黑色 RenderTexture，每次挖走可見範圍
    this.dark = this.add.renderTexture(0, 0, mapW, mapH).setOrigin(0).setDepth(20);
    this.lightGfx = this.make.graphics({}, false);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    kb.on('keydown-F', () => (this.flashlight = !this.flashlight));
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    const p = this.player;

    // 移動
    const k = this.keys;
    const vx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    const vy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    const len = Math.hypot(vx, vy) || 1;
    p.body.setVelocity((vx / len) * CONFIG.player.walkSpeed, (vy / len) * CONFIG.player.walkSpeed);

    // 面向滑鼠
    const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    p.rotation = Math.atan2(ptr.y - p.y, ptr.x - p.x);

    this.zombies.update(dt, p.x, p.y, CONFIG.player.radius, this.flashlight);

    if (this.frame++ % V.updateEveryFrames === 0) this.updateVision();
  }

  private updateVision() {
    const p = this.player;
    const g = this.grid;
    this.cones = [
      { angle: p.rotation, half: rad(V.coneDeg) / 2, radius: V.coneTiles * T },
      { angle: 0, half: Math.PI, radius: V.auraTiles * T },
    ];
    if (this.flashlight) this.cones.push({ angle: p.rotation, half: rad(V.flashConeDeg) / 2, radius: V.flashTiles * T });

    // 每個視野來源挖兩層：外圈半透，內圈全透，邊緣柔啲
    const gfx = this.lightGfx.clear();
    for (const c of this.cones) {
      gfx.fillStyle(0xffffff, V.softEdgeAlpha).fillPoints(visibilityPolygon(g, p.x, p.y, c) as Phaser.Math.Vector2[], true);
      const inner = { ...c, radius: c.radius * V.softEdgeInner };
      gfx.fillStyle(0xffffff, 1).fillPoints(visibilityPolygon(g, p.x, p.y, inner) as Phaser.Math.Vector2[], true);
    }
    this.dark.clear().fill(0x000000, CONFIG.night.darkness).erase(gfx).render();

    // 牆後 / 視野外嘅喪屍唔顯示
    let seen = 0;
    for (const z of this.zombies.list) {
      const v = canSee(g, p.x, p.y, this.cones, z.sprite.x, z.sprite.y);
      z.sprite.setVisible(v);
      if (v) seen++;
    }

    hud({
      fps: this.game.loop.actualFps,
      flashlight: this.flashlight,
      seen,
      total: this.zombies.list.length,
      chasing: this.zombies.chasingCount,
    });
  }
}
