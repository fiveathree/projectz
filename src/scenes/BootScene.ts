// 臨時美術：全部用 Canvas 2D 程式畫（DESIGN.md §5.4），Phase 2 先換正式素材
import * as Phaser from 'phaser';
import { CONFIG, PALETTE as P } from '../config';
import { DEF_BY_INDEX, TILE_COUNT } from '../world/mapgen';

const T = CONFIG.tile;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.context);
  tex.refresh();
}

/** 每種地點嘅地板色（1 便利店 … 9 碼頭） */
const FLOOR_TINT: Record<string, [number, number]> = {
  '1': [0x3c4650, 0x4a5662], // 便利店：冷白膠地
  '2': [0x3e4a48, 0x4b5a57], // 藥房：青白
  '3': [0x3d3a33, 0x4a463d], // 五金：水泥
  '4': [0x4a3a2e, 0x57453a], // 茶餐廳：紙皮石
  '5': [0x2f3a33, 0x3a473f], // 街市：濕地
  '6': [0x353a48, 0x404657], // 警崗
  '7': [P.floor, P.floorLine], // 唐樓
  '8': [0x2a2430, 0x352d3c], // 夜市空地
  '9': [0x3a3c40, 0x46484d], // 碼頭
};

function drawTile(c: CanvasRenderingContext2D, ch: string) {
  const box = (col: number, x = 0, y = 0, w: number = T, h: number = T) => {
    c.fillStyle = hex(col);
    c.fillRect(x, y, w, h);
  };
  const floor = () => box(P.floor);
  const furniture = (col: number, detail: number) => {
    floor();
    box(P.ink, 1, 1, 14, 14);
    box(col, 2, 2, 12, 12);
    box(detail, 4, 4, 8, 2);
  };
  if (FLOOR_TINT[ch]) {
    const [a, b] = FLOOR_TINT[ch];
    box(a);
    box(b, 0, 0, T, 1);
    box(b, 0, 0, 1, T);
    return;
  }
  switch (ch) {
    case ',':
      box(P.asphalt);
      box(P.asphaltLight, 3, 9, 2, 1);
      box(P.asphaltLight, 11, 4, 1, 1);
      break;
    case '=':
      box(P.sidewalk);
      box(P.sidewalkLine, 0, 0, T, 1);
      box(P.sidewalkLine, 0, 0, 1, T);
      break;
    case '_': // 騎樓：較暗、有招牌光
      box(0x2c3240);
      box(P.neonMagenta, 0, 15, T, 1);
      break;
    case 'P':
      box(0x2c3240);
      box(P.wall, 3, 3, 10, 10);
      box(P.wallTop, 3, 3, 10, 2);
      break;
    case '#':
      box(P.wall);
      box(P.wallTop, 0, 0, T, 3);
      box(P.ink, 0, T - 1, T, 1);
      break;
    case 'W':
      box(P.wall);
      box(P.glass, 2, 2, 12, 12);
      box(P.neonCyan, 3, 3, 3, 1);
      break;
    case 'D': // 關咗嘅門
      box(P.wall);
      box(P.wood, 1, 1, 14, 14);
      box(P.skin, 11, 7, 2, 2);
      break;
    case 'O': // 開咗
      floor();
      box(P.wood, 0, 0, 3, T);
      break;
    case 'B': // 打爛咗
      floor();
      box(P.wood, 0, 0, 3, 6);
      box(P.wood, 8, 11, 5, 3);
      box(P.blood, 4, 6, 3, 2);
      break;
    case '~':
      box(P.asphalt);
      box(P.asphaltLight, 2, 4, 12, 8);
      box(P.neonMagenta, 5, 6, 4, 1);
      break;
    case 'T': furniture(P.wallTop, P.neonCyan); break; // 洗手盆
    case 'b': floor(); box(P.blood, 1, 2, 14, 12); box(P.fridgeWhite, 2, 3, 4, 10); break; // 床
    case 'f': furniture(P.fridgeWhite, P.neonCyan); break; // 雪櫃
    case 'k': furniture(P.wood, P.wallTop); break; // 櫃
    case 'r': furniture(P.wood, P.neonRed); break; // 貨架
    case 'c': furniture(P.wallTop, P.neonRed); break; // 收銀
    case 'w': furniture(0x4a3628, P.wood); break; // 衣櫃
    case 'x': floor(); box(0x2a2430); box(P.neonRed, 1, 1, 14, 4); box(P.wood, 2, 5, 12, 9); break; // 攤檔 / 貨箱
    case 's':
      floor();
      for (let y = 1; y < T; y += 4) box(P.wallTop, 1, y, 14, 2);
      break;
    case 't': floor(); box(P.wood, 2, 4, 12, 8); break; // 枱
    case 'A': // 車
      box(P.asphalt);
      box(P.ink, 0, 2, 16, 12);
      box(0x8a2c35, 1, 3, 14, 10);
      box(P.glass, 4, 4, 8, 3);
      break;
    case 'X': // 路障
      box(P.asphalt);
      for (let x = 0; x < T; x += 4) box(x % 8 ? P.fridgeWhite : P.neonRed, x, 5, 4, 6);
      break;
    case 'S':
      box(P.sea);
      box(0x18405a, 2, 5, 6, 1);
      box(0x18405a, 9, 11, 5, 1);
      break;
    case ':':
      box(0x3a3c40);
      box(0x2e3034, 0, 7, T, 1);
      break;
    case 'E': // 撤離點
      box(0x3a3c40);
      box(0xe0c040, 0, 0, T, 2);
      box(0xe0c040, 0, 14, T, 2);
      box(0xe0c040, 6, 5, 4, 6);
      break;
  }
}

/** 俯視人形：圓頭 + 手指住面向方向（向右） */
function drawPerson(c: CanvasRenderingContext2D, body: number, head: number, arms: boolean) {
  const circle = (x: number, y: number, r: number, col: number) => {
    c.fillStyle = hex(col);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  circle(8, 8, 6, P.ink);
  circle(8, 8, 5, body);
  circle(9, 8, 3, head);
  c.fillStyle = hex(head);
  if (arms) {
    c.fillRect(10, 3, 5, 2);
    c.fillRect(10, 11, 5, 2);
  } else c.fillRect(11, 10, 4, 2);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    canvasTexture(this, 'tiles', T * TILE_COUNT, T, (c) => {
      DEF_BY_INDEX.forEach((d, i) => {
        c.save();
        c.translate(i * T, 0);
        drawTile(c, d.ch);
        c.restore();
      });
    });
    canvasTexture(this, 'player', 16, 16, (c) => drawPerson(c, 0x2f5d8a, P.skin, false));
    canvasTexture(this, 'zombie', 16, 16, (c) => drawPerson(c, P.blood, P.zombie, true));
    canvasTexture(this, 'pile', 16, 16, (c) => {
      c.fillStyle = hex(P.wood);
      c.fillRect(4, 6, 8, 6);
      c.fillStyle = hex(P.fridgeWhite);
      c.fillRect(6, 4, 4, 3);
    });
    canvasTexture(this, 'corpse', 16, 16, (c) => {
      c.fillStyle = hex(P.blood);
      c.fillRect(2, 6, 12, 5);
      c.fillStyle = hex(0x2f5d8a);
      c.fillRect(4, 6, 7, 5);
      c.fillStyle = hex(P.skin);
      c.fillRect(11, 7, 3, 3);
    });
    canvasTexture(this, 'blood', 8, 8, (c) => {
      c.fillStyle = hex(P.blood);
      c.globalAlpha = 0.8;
      c.fillRect(1, 2, 5, 4);
      c.fillRect(3, 1, 3, 6);
    });
    canvasTexture(this, 'rain', 2, 10, (c) => {
      c.fillStyle = '#9fd8e8';
      c.globalAlpha = 0.55;
      c.fillRect(0, 0, 1, 10);
    });
    canvasTexture(this, 'boat', 80, 40, (c) => {
      c.fillStyle = hex(P.ink);
      c.fillRect(0, 6, 80, 30);
      c.fillStyle = hex(0xd8d8d0);
      c.fillRect(2, 8, 76, 26);
      c.fillStyle = hex(P.neonRed);
      c.fillRect(2, 30, 76, 4);
      c.fillStyle = hex(P.glass);
      for (let x = 10; x < 70; x += 12) c.fillRect(x, 14, 8, 6);
    });
    canvasTexture(this, 'heli', 48, 48, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(18, 12, 12, 26);
      c.fillRect(4, 22, 40, 3);
      c.fillRect(22, 4, 3, 40);
    });
  }
}
