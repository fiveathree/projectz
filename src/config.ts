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
  sea: 0x0e2a3a,
} as const;

export const CONFIG = {
  tile: 16,
  /** 鏡頭最細放大倍數；大螢幕會自動加大，令畫面唔會見到地圖外 */
  minZoom: 2,
  /** 新世界嘅種子；0 = 每次新遊戲隨機 */
  seed: 0,

  map: {
    blocksX: 4,
    blocksY: 4,
    /** 街道闊度（格） */
    road: 4,
    /** 南面碼頭帶高度（格） */
    dockRows: 11,
    /** 撤離點闊度（格） */
    evacWidth: 4,
    cars: 14,
    /** 北汐北面出口喺第幾條直路 */
    exitRoad: 2,
  },

  /** 人類：盟友倖存者、掠奪者（Phase 3） */
  humans: {
    reach: 16,
    fistDamage: 5,
    cooldown: 0.9,
    /** 被喪屍咬中幾多機會感染、幾耐屍變（遊戲分鐘） */
    biteChance: 0.15,
    turnMin: 60,
    /** 盟友數量（每區）同幫佢包紮回幾多血 */
    perDistrict: 3,
    bandageHeal: 30,
    ally: { hp: 60, speed: 82, runSpeed: 130, followTiles: 2.2, fightTiles: 3.5, guardTiles: 5 },
    raider: { hp: 70, speed: 88, sightTiles: 8, alertSec: 8, damageMin: 5, damageMax: 9, cooldown: 1.3, count: 4, weapons: ['crowbar', 'bat', 'knife', 'pipe'] },
  },

  /** 沙盒：喪屍上限、每日隨機事件 */
  sandbox: {
    maxZombies: 600,
    events: ['horde', 'raiders', 'storm', 'heli', 'calm'],
  },

  /** 第二個區：汐景邨（屋邨） */
  estate: {
    blocks: 3,
    exitRoad: 1,
    startZombies: 90,
  },

  time: {
    /** 1 遊戲日 = 幾多秒真實時間（DESIGN.md §8） */
    dayRealSec: 420,
    startHour: 7,
    /** 第 7 日幾點有船、幾點開 */
    boatArriveHour: 16,
    boatLeaveHour: 18,
    lastDay: 7,
    /** 開背包 / 地圖時遊戲時間減慢到幾多倍（唔暫停） */
    overlaySlow: 0.25,
    /** 瞓覺快轉倍數 */
    sleepSpeed: 24,
    wakeHour: 7,
    /** 喪屍喺幾多格內會嘈醒你 */
    sleepWakeTiles: 10,
    dawnHour: 6,
    duskHour: 19,
  },

  player: {
    walkSpeed: 80, // px/s（DESIGN.md §8）
    runSpeed: 140,
    sneakSpeed: 45,
    radius: 5,
    /** 互動距離（px） */
    reach: 22,
    capacityKg: 12,
    fistDamage: 4,
    fistReach: 14,
    fistCooldown: 0.5,
    fistStamina: 4,
    attackArcDeg: 100,
    shoveReach: 20,
    shoveArcDeg: 110,
    shoveStamina: 12,
    shoveCooldown: 0.8,
    /** 踩頭（攻擊跌低嘅喪屍）傷害倍數 */
    stompMul: 4,
  },

  needs: {
    hpMax: 100,
    /** 每遊戲分鐘跌幾多（100 / 2 日、100 / 1.5 日） */
    hungerPerMin: 100 / (2 * 1440),
    thirstPerMin: 100 / (1.5 * 1440),
    /** 歸零時每遊戲分鐘扣幾多血 */
    starveHpPerMin: 0.05,
    dehydrateHpPerMin: 0.1,
    /** 飽肚又唔渴時回血（每遊戲分鐘） */
    regenHpPerMin: 0.04,
    regenNeedsAbove: 30,
    staminaMax: 100,
    runStaminaPerSec: 12,
    staminaRegenPerSec: 10,
    /** 肚餓到零時體力上限變幾多倍 */
    starveStaminaMul: 0.6,
    bleedHpPerSec: 0.25,
    /** 出血幾多秒後自己止（2026-11 調易：之前唔會自己停，好易流血至死） */
    bleedStopSec: 40,
    /** 每個職業開局都有嘅基本物資 */
    startKit: ['bandage', 'water'],
    /** 每隻視野內（6 格內）喪屍每秒加幾多驚恐 */
    panicPerZombie: 2.5,
    panicNearTiles: 6,
    panicDarkPerSec: 0.4,
    panicDecayPerSec: 3,
    /** 驚恐高過呢個數，攻擊會手震 */
    panicShakeAt: 60,
    panicShakeDeg: 25,
    /** 咬傷 / 抓傷感染後幾多遊戲分鐘死 */
    infectMinMin: 1440,
    infectMaxMin: 2880,
    /** 感染幾耐之後先見到「發燒」 */
    feverShowMin: 360,
    flashDrainPerSec: 0.5,
  },

  noise: {
    /** 噪音半徑（格）（DESIGN.md §3.2） */
    sneak: 2,
    walk: 5,
    run: 10,
    melee: 6,
    door: 4,
    doorBreak: 12,
    carAlarm: 30,
    helicopter: 30,
    /** 暴雨時噪音倍數 */
    stormMul: 0.5,
    /** 走路時每幾秒發一次腳步聲 */
    stepEverySec: 0.5,
    carAlarmSec: 12,
    glass: 18,
    hammer: 8,
    cook: 3,
    molotov: 10,
    /** 夜晚電筒照住冇窗簾嘅窗：外面幾多格內嘅喪屍會被光引過嚟 */
    windowLight: 8,
    windowLightEverySec: 2,
  },

  /** 喪屍打爛各種格要幾多「耐久」（打一秒扣 doorBashPerSec） */
  tileHp: { D: 12, W: 3, C: 3 } as Record<string, number>,

  build: {
    /** 釘板：耐久、要幾耐、每級木工加幾多 */
    boardHp: 20,
    boardSec: 3,
    perCarpHp: 0.25,
    perCarpSpeed: 0.15,
    dismantleSec: 3,
    /** 拆傢俬得到咩 */
    dismantle: { t: ['plank', 'plank'], b: ['plank', 'cloth', 'cloth'], w: ['plank', 'cloth'] } as Record<string, string[]>,
  },

  cook: {
    sec: 3,
    /** 非廚師煮燶機率（每級急救冇關，係廚師先 0） */
    burnChance: 0.2,
    /** 第幾分鐘斷電（第 5 日 00:00）：雪櫃保鮮到呢個時間 */
    powerOutMin: 4 * 1440,
    poisonMin: 240,
    poisonHpPerMin: 0.06,
    poisonThirstPerMin: 0.05,
  },

  throw: {
    rangeTiles: 6,
    flightSec: 0.4,
    radiusTiles: 1.6,
    burnSec: 10,
    dps: 18,
    playerDps: 8,
  },

  collector: {
    /** 落雨時每遊戲分鐘儲幾多（100 = 一樽） */
    rainPerMin: 0.8,
    stormPerMin: 2,
    capacity: 400,
  },

  phone: {
    /** 斷電後待機每遊戲分鐘耗幾多 %；開住再加 */
    idlePerMin: 100 / (2.5 * 1440),
    openPerMin: 100 / (8 * 60),
  },

  skills: {
    /** 升到第 n 級要幾多經驗 */
    levels: [0, 20, 60, 130, 230, 360],
    xp: { meleeHit: 2, sneakSec: 0.2, aid: 6, carp: 8, craft: 4 },
    /** 每級效果 */
    meleeDmg: 0.1,
    meleeStamina: 0.08,
    sneakNoise: 0.12,
    sneakSight: 0.07,
    aidHeal: 0.2,
  },

  /** 每日調色（ColorMatrix）：飽和度、亮度、對比、藍調 */
  grade: {
    clear: { sat: -0.15, bright: 1.03, contrast: 0.05, blue: 0 },
    cloudy: { sat: -0.3, bright: 0.97, contrast: 0, blue: 0.04 },
    rain: { sat: -0.35, bright: 0.94, contrast: -0.05, blue: 0.08 },
    storm: { sat: -0.5, bright: 0.88, contrast: -0.15, blue: 0.14 },
    blackout: { sat: -0.6, bright: 0.85, contrast: 0.1, blue: 0.06 },
  } as Record<string, { sat: number; bright: number; contrast: number; blue: number }>,

  audio: {
    /** 預設音量（0–1）；暫停選單可以改 */
    volume: 0.6,
    groanEverySec: 3,
    groanTiles: 10,
  },

  zombie: {
    startCount: 120,
    perDay: 40,
    /** 第 7 日碼頭附近額外幾多隻 */
    dockExtra: 50,
    /** 第 6 日屍群 */
    hordeSize: 60,
    wanderSpeed: 25,
    chaseSpeed: 62,
    radius: 5,
    hp: 30,
    hpVariance: 10,
    /** 喪屍視距（格）；玩家開電筒時用較遠嗰個；夜晚 / 暴雨會縮 */
    sightTiles: 7,
    sightTilesNight: 4,
    sightTilesFlashlight: 11,
    /** 跟丟玩家之後繼續用流場追幾耐 */
    chaseMemorySec: 5,
    wanderTurnMinSec: 2,
    wanderTurnMaxSec: 5,
    /** 開局喪屍離玩家至少幾多格 */
    minSpawnTiles: 18,
    sightChecksPerFrame: 20,
    separationSpeed: 60,
    /** 每隻每幀最多同幾多隻隔籬互推（屍群擠埋時慳計算） */
    separationMaxNeighbours: 8,
    /** 離玩家幾多格以外用粗略模擬（每秒一步、唔碰撞） */
    activeTiles: 22,
    coarseStepSec: 1,
    attackCooldown: 1.6,
    attackRange: 4,
    damageMin: 3,
    damageMax: 6,
    /** 每次被打中：咬傷、抓傷、割傷（出血）機率 */
    biteChance: 0.03,
    scratchChance: 0.25,
    scratchInfectChance: 0.15,
    lacerationChance: 0.2,
    /** 推跌之後瞓幾耐 */
    downSec: 2.5,
    staggerSec: 0.25,
    knockback: 120,
    /** 撞門每秒扣幾多門耐久 */
    doorBashPerSec: 1,
    doorHp: 12,
    /** 同時記住幾多張聲源流場 */
    flowCache: 8,
    /** 新聲源喺已有流場幾多格內就借用 */
    flowReuseTiles: 3,
    /** 每幀最多計幾多次聲源流場（BFS） */
    flowBudget: 2,
  },

  vision: {
    coneDeg: 120,
    /** 視錐長度（格）：日頭 / 夜晚 */
    coneTilesDay: 12,
    coneTilesNight: 5,
    stormMul: 0.7,
    /** 身邊圓形感知（DESIGN.md §3.3：1.5 格） */
    auraTiles: 1.5,
    flashConeDeg: 50,
    flashTiles: 12,
    rayStepDeg: 2,
    updateEveryFrames: 2,
    softEdgeAlpha: 0.55,
    softEdgeInner: 0.75,
    wallBleed: 6,
    /** 每幾幀記錄一次「見過嘅格」 */
    exploreEveryFrames: 10,
  },

  light: {
    /** 視野以外嘅黑色遮罩透明度（1 = 全黑） */
    day: 0.45,
    night: 0.88,
    nightNoPower: 0.96,
    storm: 0.6,
  },

  combat: {
    hitStopMs: 50,
    shakeMs: 80,
    shakeIntensity: 0.004,
  },

  /** 容器名同搜刮秒數（DESIGN.md §3.5：0.5–2 秒） */
  containers: {
    f: { name: '雪櫃', sec: 1 },
    k: { name: '櫃', sec: 1.2 },
    r: { name: '貨架', sec: 0.8 },
    c: { name: '收銀機', sec: 0.5 },
    w: { name: '衣櫃', sec: 1.5 },
    x: { name: '攤檔', sec: 1 },
    pile: { name: '地上', sec: 0 },
    corpse: { name: '屍體', sec: 2 },
  } as Record<string, { name: string; sec: number }>,

  rain: {
    rain: 120,
    storm: 400,
    /** 暴雨時水窪行得幾慢 */
    floodSlow: 0.6,
  },

  save: {
    key: 'typhoon-dead-save',
    version: 3,
    /** 每幾遊戲分鐘自動存檔 */
    everyMin: 60,
    maxBlood: 400,
  },

  /** 屍體幾多遊戲分鐘後變喪屍 */
  corpseTurnMin: 30,

  touch: {
    joystickRadius: 50,
    /** 推到幾盡就跑 */
    runAt: 0.9,
    autoAimTiles: 2.5,
  },
} as const;
