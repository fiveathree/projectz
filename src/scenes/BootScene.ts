// 美術：原創像素圖，全部用 Canvas 2D 程式畫（DESIGN.md §5.4「原創繪製」），跟 config.ts 16 色調色盤
import * as Phaser from 'phaser';
import { CONFIG, PALETTE as P } from '../config';
import { DEF_BY_INDEX, TILE_COUNT } from '../world/mapgen';

const T = CONFIG.tile;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** 固定種子嘅雜點，令每格紋理一樣但唔死板 */
const hash = (x: number, y: number, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.context);
  tex.refresh();
  return tex;
}

type Ctx = CanvasRenderingContext2D;
const box = (c: Ctx, col: number | string, x = 0, y = 0, w: number = T, h: number = T) => {
  c.fillStyle = typeof col === 'number' ? hex(col) : col;
  c.fillRect(x, y, w, h);
};
const speckle = (c: Ctx, col: number, n: number, k: number) => {
  for (let i = 0; i < n; i++) box(c, col, Math.floor(hash(i, k) * T), Math.floor(hash(k, i, 3) * T), 1, 1);
};

/** 每種地點嘅地板（1 便利店 … 9 碼頭） */
function floor(c: Ctx, ch: string) {
  switch (ch) {
    case '1': // 便利店：白色膠地磚
      box(c, 0x46505c);
      box(c, 0x55606c, 0, 0, T, 1);
      box(c, 0x55606c, 0, 0, 1, T);
      box(c, 0x3c444f, 8, 0, 1, T);
      box(c, 0x3c444f, 0, 8, T, 1);
      break;
    case '2': // 藥房：青白格
      for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x += 4) box(c, (x + y) % 8 ? 0x3e4a48 : 0x485754, x, y, 4, 4);
      break;
    case '3': // 五金：水泥
      box(c, 0x3d3a33);
      speckle(c, 0x4a463d, 14, 3);
      speckle(c, 0x332f29, 10, 4);
      break;
    case '4': // 茶餐廳：紙皮石
      for (let y = 0; y < T; y += 2) for (let x = 0; x < T; x += 2) box(c, hash(x, y, 4) < 0.15 ? 0x6a3a32 : hash(x, y, 5) < 0.5 ? 0x4e4038 : 0x564840, x, y, 2, 2);
      break;
    case '5': // 街市：濕地 + 坑渠
      box(c, 0x2f3a33);
      box(c, 0x3a473f, 0, 0, T, 1);
      box(c, 0x24302a, 0, 12, T, 1);
      speckle(c, 0x4a6a5a, 4, 5);
      break;
    case '6': // 警崗
      box(c, 0x353a48);
      box(c, 0x404657, 0, 0, T, 1);
      box(c, 0x2c3140, 0, 15, T, 1);
      break;
    case '8': // 夜市空地：柏油 + 油漆線
      box(c, 0x2a2430);
      speckle(c, 0x352d3c, 10, 8);
      box(c, 0x5a4a20, 0, 14, T, 1);
      break;
    case '9': // 碼頭 / 凍倉
      box(c, 0x3a3c40);
      box(c, 0x2e3034, 0, 7, T, 1);
      speckle(c, 0x46484d, 8, 9);
      break;
    default: // 唐樓：磨石地
      box(c, P.floor);
      speckle(c, 0x4f4640, 12, 7);
      speckle(c, 0x2e2925, 8, 17);
  }
}

function brickWall(c: Ctx) {
  box(c, P.wall);
  for (let y = 3; y < T; y += 4) {
    box(c, 0x4c5262, 0, y, T, 1);
    const off = (y >> 2) % 2 ? 0 : 4;
    for (let x = off; x < T; x += 8) box(c, 0x4c5262, x, y - 3, 1, 3);
  }
  box(c, P.wallTop, 0, 0, T, 2);
  box(c, P.ink, 0, T - 1, T, 1);
}

function windowFrame(c: Ctx) {
  box(c, P.wall);
  box(c, P.ink, 1, 1, 14, 14);
  box(c, 0x8a91a4, 2, 2, 12, 12);
}

function drawTile(c: Ctx, ch: string) {
  const furniture = (col: number, detail: number) => {
    floor(c, '7');
    box(c, P.ink, 1, 1, 14, 14);
    box(c, col, 2, 2, 12, 12);
    box(c, detail, 4, 4, 8, 2);
    box(c, 0x202020, 2, 13, 12, 1);
  };
  if (/[1-9]/.test(ch)) return floor(c, ch);
  switch (ch) {
    case ',':
      box(c, P.asphalt);
      speckle(c, P.asphaltLight, 9, 1);
      speckle(c, 0x161b26, 7, 2);
      break;
    case '=': // 行人路方磚
      box(c, P.sidewalk);
      box(c, P.sidewalkLine, 0, 0, T, 1);
      box(c, P.sidewalkLine, 0, 0, 1, T);
      box(c, 0x2e3544, 8, 0, 1, T);
      box(c, 0x2e3544, 0, 8, T, 1);
      break;
    case '_': // 騎樓：較暗、招牌霓虹反光
      box(c, 0x2c3240);
      speckle(c, 0x343b4a, 6, 11);
      box(c, P.neonMagenta, 0, 15, T, 1);
      box(c, 0x5a2a62, 0, 14, T, 1);
      break;
    case 'P':
      box(c, 0x2c3240);
      box(c, P.ink, 2, 2, 12, 12);
      box(c, P.wall, 3, 3, 10, 10);
      box(c, P.wallTop, 3, 3, 10, 2);
      box(c, P.neonRed, 3, 8, 10, 1);
      break;
    case '#':
      brickWall(c);
      break;
    case 'W':
      windowFrame(c);
      box(c, P.glass, 3, 3, 10, 10);
      box(c, P.neonCyan, 4, 4, 3, 1);
      box(c, P.neonCyan, 4, 5, 1, 2);
      box(c, 0x8a91a4, 7, 3, 1, 10);
      break;
    case 'C': // 拉咗窗簾
      windowFrame(c);
      for (let x = 3; x < 13; x++) box(c, x % 3 ? 0x7a3040 : 0x5a2030, x, 3, 1, 10);
      box(c, P.skin, 3, 3, 10, 1);
      break;
    case 'H': // 釘板窗
      windowFrame(c);
      box(c, P.glass, 3, 3, 10, 10);
      box(c, P.wood, 1, 3, 14, 4);
      box(c, P.wood, 1, 9, 14, 4);
      box(c, 0x8a6a4a, 1, 3, 14, 1);
      box(c, 0x8a6a4a, 1, 9, 14, 1);
      for (const [x, y] of [[2, 5], [13, 5], [2, 11], [13, 11]]) box(c, P.fridgeWhite, x, y, 1, 1);
      break;
    case 'J': // 釘板門
      box(c, P.wall);
      box(c, 0x4a3628, 1, 1, 14, 14);
      box(c, P.wood, 0, 3, T, 3);
      box(c, P.wood, 0, 10, T, 3);
      box(c, 0x8a6a4a, 0, 3, T, 1);
      box(c, 0x8a6a4a, 0, 10, T, 1);
      break;
    case 'V': // 爛窗
      floor(c, '7');
      box(c, P.wall, 0, 0, 1, T);
      box(c, P.wall, 15, 0, 1, T);
      for (const [x, y] of [[3, 2], [9, 5], [5, 11], [12, 12], [7, 8]]) box(c, P.neonCyan, x, y, 2, 1);
      break;
    case 'D': // 關咗嘅門
      box(c, P.wall);
      box(c, 0x4a3628, 1, 1, 14, 14);
      box(c, P.wood, 2, 2, 12, 12);
      box(c, 0x7a5638, 2, 2, 12, 1);
      box(c, P.skin, 11, 7, 2, 2);
      break;
    case 'O':
      floor(c, '7');
      box(c, P.wood, 0, 0, 3, T);
      box(c, 0x4a3628, 2, 0, 1, T);
      break;
    case 'B':
      floor(c, '7');
      box(c, P.wood, 0, 0, 3, 6);
      box(c, P.wood, 8, 11, 5, 3);
      box(c, P.wood, 4, 3, 3, 2);
      box(c, P.blood, 4, 6, 3, 2);
      break;
    case 'K': // 凍倉鐵門 + 鐵鏈
      box(c, 0x4a5058);
      for (let x = 1; x < T; x += 3) box(c, 0x5c636c, x, 0, 1, T);
      for (let x = 0; x < T; x += 3) box(c, 0xb0b8c0, x, 7, 2, 2);
      box(c, 0xe0c040, 6, 9, 4, 4);
      break;
    case '~':
      box(c, P.asphalt);
      box(c, 0x2c3a4c, 2, 4, 12, 8);
      box(c, 0x34465a, 3, 5, 10, 1);
      box(c, P.neonMagenta, 5, 7, 4, 1);
      box(c, P.neonCyan, 9, 9, 2, 1);
      break;
    case 'T': furniture(P.wallTop, P.neonCyan); box(c, 0x9aa4b8, 6, 7, 4, 4); break; // 洗手盆
    case 'G': // 煤氣爐
      furniture(0x3a3e48, 0x3a3e48);
      for (const [x, y] of [[4, 4], [9, 4], [4, 9], [9, 9]]) {
        box(c, P.ink, x, y, 4, 4);
        box(c, 0x4060c0, x + 1, y + 1, 2, 2);
      }
      break;
    case 'b': floor(c, '7'); box(c, P.ink, 1, 1, 14, 14); box(c, 0x8a2c35, 2, 2, 12, 12); box(c, P.fridgeWhite, 3, 3, 4, 10); box(c, 0xa04050, 8, 2, 1, 12); break;
    case 'f': furniture(P.fridgeWhite, P.neonCyan); box(c, 0x9aa4b8, 2, 8, 12, 1); break;
    case 'k': furniture(P.wood, P.wallTop); box(c, 0x4a3628, 7, 2, 1, 12); break;
    case 'r': furniture(P.wood, P.neonRed); box(c, 0xe0c040, 4, 8, 2, 2); box(c, P.neonCyan, 8, 8, 2, 2); break;
    case 'c': furniture(P.wallTop, P.neonRed); box(c, P.ink, 5, 7, 6, 4); box(c, 0x40c060, 6, 8, 4, 1); break;
    case 'w': furniture(0x4a3628, P.wood); box(c, P.skin, 7, 7, 2, 2); break;
    case 'x': // 攤檔 / 貨箱
      box(c, 0x2a2430);
      box(c, P.ink, 1, 1, 14, 14);
      for (let x = 1; x < 15; x += 4) box(c, x % 8 === 1 ? P.neonRed : P.fridgeWhite, x, 1, 4, 4);
      box(c, P.wood, 2, 5, 12, 9);
      box(c, 0x7a5638, 2, 9, 12, 1);
      break;
    case 's':
      floor(c, '7');
      for (let y = 1; y < T; y += 4) {
        box(c, P.wallTop, 1, y, 14, 2);
        box(c, 0x5a6070, 1, y + 2, 14, 1);
      }
      break;
    case 't': floor(c, '7'); box(c, P.ink, 2, 3, 12, 10); box(c, P.wood, 3, 4, 10, 8); box(c, 0x7a5638, 3, 4, 10, 1); break;
    case 'A': // 車（由上望落）
      box(c, P.asphalt);
      box(c, P.ink, 0, 2, 16, 12);
      box(c, 0x8a2c35, 1, 3, 14, 10);
      box(c, 0xa83a44, 1, 3, 14, 2);
      box(c, P.glass, 4, 5, 8, 6);
      box(c, 0x2a5a66, 4, 8, 8, 3);
      break;
    case 'X':
      box(c, P.asphalt);
      for (let x = 0; x < T; x += 4) box(c, x % 8 ? P.fridgeWhite : P.neonRed, x, 5, 4, 6);
      box(c, P.ink, 0, 11, T, 1);
      break;
    case 'S':
      box(c, P.sea);
      box(c, 0x18405a, 2, 5, 6, 1);
      box(c, 0x18405a, 9, 11, 5, 1);
      box(c, 0x0a2230, 0, 15, T, 1);
      break;
    case ':':
      box(c, 0x3a3c40);
      box(c, 0x2e3034, 0, 7, T, 1);
      box(c, 0x2e3034, 7, 0, 1, 7);
      speckle(c, 0x46484d, 6, 23);
      break;
    case 'E':
      box(c, 0x3a3c40);
      for (let x = -T; x < T; x += 6) {
        c.fillStyle = '#e0c040';
        c.beginPath();
        c.moveTo(x, 16);
        c.lineTo(x + 3, 16);
        c.lineTo(x + 19, 0);
        c.lineTo(x + 16, 0);
        c.fill();
      }
      break;
  }
}

/** 俯視人形：兩幀行路（腳前後），向右 */
function drawPerson(c: Ctx, ox: number, frame: number, body: number, head: number, kind: 'player' | 'zombie', detail: number) {
  const circle = (x: number, y: number, r: number, col: number) => {
    c.fillStyle = hex(col);
    c.beginPath();
    c.arc(ox + x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  const f = frame ? 1 : -1;
  box(c, P.ink, ox + 6 + f, 3, 3, 3);
  box(c, P.ink, ox + 6 - f, 10, 3, 3);
  circle(8, 8, 6, P.ink);
  circle(8, 8, 5, body);
  box(c, detail, ox + 5, 4, 2, 8);
  circle(9, 8, 3, head);
  if (kind === 'zombie') {
    box(c, head, ox + 10, 3 + f, 5, 2);
    box(c, head, ox + 10, 11 - f, 5, 2);
    box(c, P.blood, ox + 8, 6, 2, 1);
  } else {
    box(c, head, ox + 11, 10, 4, 2);
    box(c, P.fridgeWhite, ox + 14, 10, 2, 2); // 電筒
    box(c, 0x1a1a1a, ox + 8, 6, 2, 4); // 頭髮
  }
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
        // 剪裁喺自己格入面，斜紋唔會溢去隔籬格
        c.beginPath();
        c.rect(0, 0, T, T);
        c.clip();
        drawTile(c, d.ch);
        c.restore();
      });
    });

    // 玩家：2 幀
    const pt = canvasTexture(this, 'player', 32, 16, (c) => {
      for (let fr = 0; fr < 2; fr++) drawPerson(c, fr * 16, fr, 0x2f5d8a, P.skin, 'player', 0x24476a);
    });
    pt.add(0, 0, 0, 0, 16, 16);
    pt.add(1, 0, 16, 0, 16, 16);
    // 喪屍：3 款 × 2 幀（血衫、白恤衫、地盤背心）
    const variants: [number, number][] = [[P.blood, 0x4a0e18], [0xb8bcc4, 0x8a2c35], [0xd07020, 0xe0c040]];
    const zt = canvasTexture(this, 'zombie', 96, 16, (c) => {
      variants.forEach(([body, detail], v) => {
        for (let fr = 0; fr < 2; fr++) drawPerson(c, (v * 2 + fr) * 16, fr, body, P.zombie, 'zombie', detail);
      });
    });
    for (let i = 0; i < 6; i++) zt.add(i, 0, i * 16, 0, 16, 16);
    this.anims.create({ key: 'p-walk', frames: [{ key: 'player', frame: 0 }, { key: 'player', frame: 1 }], frameRate: 7, repeat: -1 });
    for (let v = 0; v < 3; v++)
      this.anims.create({ key: `z${v}-walk`, frames: [{ key: 'zombie', frame: v * 2 }, { key: 'zombie', frame: v * 2 + 1 }], frameRate: 3, repeat: -1 });

    canvasTexture(this, 'pile', 16, 16, (c) => {
      box(c, P.ink, 3, 5, 10, 8);
      box(c, P.wood, 4, 6, 8, 6);
      box(c, P.fridgeWhite, 6, 4, 4, 3);
      box(c, 0xe0c040, 9, 8, 2, 2);
    });
    canvasTexture(this, 'corpse', 16, 16, (c) => {
      box(c, P.blood, 1, 5, 14, 7);
      box(c, 0x2f5d8a, 4, 6, 7, 5);
      box(c, P.skin, 11, 7, 3, 3);
    });
    canvasTexture(this, 'blood', 8, 8, (c) => {
      c.globalAlpha = 0.8;
      box(c, P.blood, 1, 2, 5, 4);
      box(c, P.blood, 3, 1, 3, 6);
      box(c, 0x4a0e18, 2, 3, 2, 2);
    });
    canvasTexture(this, 'rain', 2, 10, (c) => {
      c.globalAlpha = 0.55;
      box(c, '#9fd8e8', 0, 0, 1, 10);
    });
    canvasTexture(this, 'fire', 6, 6, (c) => {
      box(c, 0xe0384f, 1, 2, 4, 4);
      box(c, 0xe0a040, 2, 1, 2, 4);
      box(c, 0xfff0a0, 2, 3, 2, 2);
    });
    canvasTexture(this, 'molotov', 8, 8, (c) => {
      box(c, P.glass, 2, 2, 4, 6);
      box(c, P.fridgeWhite, 3, 0, 2, 2);
      box(c, 0xe0a040, 3, 0, 2, 1);
    });
    canvasTexture(this, 'collector', 16, 16, (c) => {
      box(c, P.ink, 2, 2, 12, 12);
      box(c, 0x3060a0, 3, 3, 10, 10);
      box(c, 0x5080c0, 3, 3, 10, 2);
      box(c, P.wood, 1, 1, 2, 14);
      box(c, P.wood, 13, 1, 2, 14);
    });
    canvasTexture(this, 'boat', 80, 40, (c) => {
      box(c, P.ink, 0, 6, 80, 30);
      box(c, 0xd8d8d0, 2, 8, 76, 26);
      box(c, P.neonRed, 2, 30, 76, 4);
      for (let x = 10; x < 70; x += 12) box(c, P.glass, x, 14, 8, 6);
      box(c, 0x8a91a4, 30, 0, 20, 8);
    });
    canvasTexture(this, 'heli', 48, 48, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(18, 12, 12, 26);
      c.fillRect(4, 22, 40, 3);
      c.fillRect(22, 4, 3, 40);
    });
  }
}
