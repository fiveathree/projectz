// 所有可調數值集中喺度（CLAUDE.md 硬性規則）

/** 16 色調色盤（DESIGN.md §9：所有素材跟佢）— 颱風夜 · 霓虹殘光 */
export const PALETTE = {
  ink: 0x07090d, // 最深黑
  asphalt: 0x1c2230, // 濕柏油
  asphaltLight: 0x283040,
  sidewalk: 0x343c4c,
  sidewalkLine: 0x404a5c,
  floor: 0x3a3430, // 室內地板（暖灰）
  floorLine: 0x433c37,
  wall: 0x5a6070,
  wallTop: 0x7a8194,
  glass: 0x3f7f8f, // 窗（青）
  wood: 0x6b4a32, // 門、傢俬
  neonRed: 0xe0384f,
  neonCyan: 0x39d0d8,
  neonMagenta: 0xc04ad0,
  fridgeWhite: 0xcfe3ea, // 便利店冷白光
  blood: 0x6e1420, // 血、喪屍
  skin: 0xd8b48a, // 玩家
  zombie: 0x7d9a6a, // 喪屍膚色
} as const;

export const CONFIG = {
  tile: 16,
  /** 鏡頭最細放大倍數；大螢幕會自動加大，令地圖永遠鋪滿畫面 */
  minZoom: 2,
  seed: 20261110,

  map: {
    blocksX: 2,
    blocksY: 2,
    /** 街道闊度（格） */
    road: 4,
  },

  player: {
    walkSpeed: 80, // px/s（DESIGN.md §8）
    radius: 5,
  },

  zombie: {
    count: 50,
    wanderSpeed: 25,
    chaseSpeed: 70,
    radius: 5,
    /** 喪屍視距（格）；玩家開電筒時用較遠嗰個 */
    sightTiles: 6,
    sightTilesFlashlight: 11,
    /** 跟丟玩家之後繼續用流場追幾耐 */
    chaseMemorySec: 4,
    wanderTurnMinSec: 2,
    wanderTurnMaxSec: 5,
    /** 開局喪屍離玩家至少幾多格 */
    minSpawnTiles: 9,
    /** 每幀只檢查部分喪屍嘅視線，分攤計算 */
    sightChecksPerFrame: 10,
    /** 擠埋一齊時互相推開嘅速度（px/s） */
    separationSpeed: 60,
  },

  vision: {
    coneDeg: 120,
    coneTiles: 5,
    /** 身邊圓形感知（DESIGN.md §3.3：1.5 格） */
    auraTiles: 1.5,
    flashConeDeg: 50,
    flashTiles: 12,
    /** 均勻射線角距；另外每個牆角會額外補射線 */
    rayStepDeg: 2,
    /** 每幾幀重算一次視野（DESIGN.md §9） */
    updateEveryFrames: 2,
    /** 柔邊：外圈挖走幾多黑、內圈佔半徑幾多 */
    softEdgeAlpha: 0.55,
    softEdgeInner: 0.75,
    /** 光入牆幾多 px，照亮牆面 */
    wallBleed: 6,
  },

  night: {
    /** 視野以外嘅黑色遮罩透明度（1 = 全黑） */
    darkness: 0.9,
  },
} as const;
