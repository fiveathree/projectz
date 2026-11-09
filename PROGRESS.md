# PROGRESS

## Phase 0 — 技術驗證（2026-11-10）✅

### 做咗咩
- **骨架**：Vite 8 + Phaser 4.2.1（npm 最新穩定）+ TypeScript 7；`npm run dev` 開發、`npm run build` 打包。
- **地圖**（`src/world/mapgen.ts`、`prefabs/*.txt`）：兩個 22×18 ASCII 街區樣板，按種子（mulberry32）隨機揀 + 鏡像，砌成 2×2 街區（56×48 格）→ Phaser Tilemap。牆 / 窗 / 傢俬擋路；只有牆擋視線（窗睇得穿）。
- **玩家**：WASD 行（80 px/s）、滑鼠面向、Arcade 撞牆、鏡頭跟隨；鏡頭倍數自動加大，令地圖永遠鋪滿畫面。
- **視野**（`src/world/vision.ts`）：120° 視錐 5 格 + 身邊 1.5 格感知；格仔 DDA Raycast，只對附近牆角補射線，每 2 幀更新。夜晚黑色 RenderTexture 遮罩挖出可見範圍（外圈半透柔邊）；光入牆 6px 照亮牆面。
- **電筒**：F 鍵開關，50° 光錐 12 格；開咗喪屍視距由 6 格升到 11 格（電筒會被見到）。
- **喪屍**（`src/systems/zombies.ts`）：50 隻；遊蕩 25 px/s → 見到玩家（Raycast 視線）→ 追擊 70 px/s，用全體共用嘅 BFS 流場（8 方向、唔切牆角）繞牆 → 跟丟 4 秒後返去遊蕩。視線檢查每幀分攤 10 隻。
- **防穿牆**：喪屍之間、喪屍同玩家之間唔用 Arcade 物理碰撞（會將成群喪屍擠入牆），改用只改速度嘅「軟分隔」，所以 Arcade 撞牆永遠食得住。
- **HUD**：純 DOM 疊層，顯示 FPS、電筒、視野內喪屍數、追擊數。
- **favicon（像素喪屍手）+ og:image 1200×630**：`scripts/make-images.ps1` 生成，`index.html` 已掛好 og / twitter meta。
- 所有可調數值同 16 色調色盤喺 `src/config.ts`。

### 驗收（DESIGN.md §7 Phase 0）
| 項目 | 結果 | 點驗 |
|---|---|---|
| 桌機 60fps | ✅ | 1024×768、電筒開、50 隻喪屍，逐幀計時（update + render + `gl.finish()`）600 幀：平均 3.0ms、中位 1.9ms、p99 8.8ms，遠低於 16.7ms 預算。 |
| 喪屍唔穿牆 | ✅ | 強制 50 隻全部追擊 40 秒（2400 幀），每幀檢查每隻喪屍中心：入牆 0 次；玩家亦冇被擠入牆。50 隻全部經流場繞過建築去到玩家身邊。 |
| 牆後喪屍見唔到 | ✅ | 擺一隻喺牆後（4 格、喺視錐範圍內）→ 隱藏；一隻喺開揚行人路 → 顯示；一隻喺玩家背後 → 隱藏。截圖確認光錐被牆切斷。 |
| 一個畫面冇捲軸 | ✅ | `scrollWidth/Height` ≤ 視窗；`body { overflow: hidden }`，Phaser RESIZE 模式鋪滿。 |
| WASD / 撞牆 / 鏡頭 / 電筒 | ✅ | 合成按鍵：D 1 秒行 80px；S 行到牆前 5px（= 玩家半徑）停；鏡頭中心跟住玩家；F 切換電筒。 |
| favicon + og:image | ✅ | 三個檔 HTTP 200，og.png 實測 1200×630。 |

### 已知問題
- 測試時瀏覽器面板收埋，`requestAnimationFrame` 被節流，**未量到真實螢幕 FPS**；60fps 係用逐幀計時證明。下次開住面板再睇 HUD 嘅 FPS。
- **未部署 Cloudflare Pages**（DESIGN.md Phase 0 有寫，但今次任務清單冇要求；部署要另外批准）。部署後要將 og:image 改成絕對網址，社交平台先讀到。
- 喪屍貼住玩家會同玩家 sprite 少少重疊（Phase 0 冇攻擊，所以冇碰撞）。
- 視錐邊緣用均勻射線（2°）+ 牆角射線，遠距離邊緣有少少鋸齒。
- 冇「地形記憶」：視野外地形一律用 90% 黑遮住，未記錄「見過嘅格」。
- JS bundle 1.38MB（Phaser 本身），之後可考慮 code split / 自訂 Phaser build。
- 字體仲係系統字，俐方體 11 號未加入。

### 下一步（Phase 1）
1. 部署 Cloudflare Pages（要你批准），og:image 改絕對網址；開住面板量真實 FPS。
2. 4×4 街區北汐區、10 種地點樣板（便利店、藥房、五金舖…）。
3. 噪音系統（喪屍走去最後聽到嘅位置，流場目標改做聲源）。
4. 搜刮 + 背包（重量制）+ 快捷欄；近戰 / 推撞 / 踩頭。
5. 生存數值、時間日夜、雨、七日事件、存檔（idb-keyval）。
