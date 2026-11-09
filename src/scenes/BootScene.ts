// Phase 0 臨時美術：全部用 Canvas 2D 程式畫（DESIGN.md §5.4）
import * as Phaser from 'phaser';
import { CONFIG, PALETTE as P } from '../config';
import { TILE_COUNT } from '../world/mapgen';

const T = CONFIG.tile;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.context);
  tex.refresh();
}

/** tileset：次序要同 mapgen.ts LEGEND 嘅 index 一致 */
function drawTile(c: CanvasRenderingContext2D, i: number) {
  const box = (col: number, x = 0, y = 0, w: number = T, h: number = T) => {
    c.fillStyle = hex(col);
    c.fillRect(x, y, w, h);
  };
  const furniture = (col: number, detail: number) => {
    box(P.floor);
    box(col, 2, 2, 12, 12);
    box(detail, 4, 4, 8, 2);
  };
  switch (i) {
    case 0: // 街道
      box(P.asphalt);
      box(P.asphaltLight, 3, 9, 2, 1);
      box(P.asphaltLight, 11, 4, 1, 1);
      break;
    case 1: // 行人路
      box(P.sidewalk);
      box(P.sidewalkLine, 0, 0, T, 1);
      box(P.sidewalkLine, 0, 0, 1, T);
      break;
    case 2: // 地板
      box(P.floor);
      box(P.floorLine, 0, 7, T, 1);
      break;
    case 3: // 牆
      box(P.wall);
      box(P.wallTop, 0, 0, T, 3);
      box(P.ink, 0, T - 1, T, 1);
      break;
    case 4: // 窗
      box(P.wall);
      box(P.glass, 2, 2, 12, 12);
      box(P.neonCyan, 3, 3, 3, 1);
      break;
    case 5: // 門（開住）
      box(P.floor);
      box(P.wood, 0, 0, 3, T);
      break;
    case 6: // 水窪
      box(P.asphalt);
      box(P.asphaltLight, 2, 4, 12, 8);
      box(P.neonMagenta, 5, 6, 4, 1);
      break;
    case 7: furniture(P.fridgeWhite, P.neonCyan); break; // 雪櫃
    case 8: furniture(P.blood, P.skin); break; // 床
    case 9: furniture(P.wood, P.wallTop); break; // 廚櫃
    case 10: furniture(P.wood, P.neonRed); break; // 貨架
    case 11: furniture(P.wallTop, P.neonRed); break; // 收銀
    case 12: // 梯
      box(P.floor);
      for (let y = 1; y < T; y += 4) box(P.wallTop, 1, y, 14, 2);
      break;
  }
}

/** 俯視人形：圓頭 + 一隻手指住面向方向（向右） */
function drawPerson(c: CanvasRenderingContext2D, body: number, head: number, arms: boolean) {
  c.fillStyle = hex(P.ink);
  c.beginPath();
  c.arc(8, 8, 6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = hex(body);
  c.beginPath();
  c.arc(8, 8, 5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = hex(head);
  c.beginPath();
  c.arc(9, 8, 3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = hex(head);
  if (arms) {
    c.fillRect(10, 3, 5, 2); // 喪屍：雙手向前伸
    c.fillRect(10, 11, 5, 2);
  } else {
    c.fillRect(11, 10, 4, 2); // 玩家：拎住電筒嗰隻手
  }
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    canvasTexture(this, 'tiles', T * TILE_COUNT, T, (c) => {
      for (let i = 0; i < TILE_COUNT; i++) {
        c.save();
        c.translate(i * T, 0);
        drawTile(c, i);
        c.restore();
      }
    });
    canvasTexture(this, 'player', 16, 16, (c) => drawPerson(c, 0x2f5d8a, P.skin, false));
    canvasTexture(this, 'zombie', 16, 16, (c) => drawPerson(c, P.blood, P.zombie, true));
    this.scene.start('world');
  }
}
