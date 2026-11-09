# 澳汐七日 · TYPHOON DEAD

瀏覽器 2D 俯視末日生存遊戲：颱風夜，亞洲舊城爆發「潮病」，生存七日，趕上第 7 日 18:00 碼頭最後一班撤離船。

- 企劃與開發規格：[`DESIGN.md`](./DESIGN.md)
- 開發守則：[`CLAUDE.md`](./CLAUDE.md)

技術：Phaser + TypeScript + Vite，HTML/CSS UI，IndexedDB 存檔，Cloudflare Pages 部署。

## 開發

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 輸出 dist/
```

重新生成 favicon / og 圖：`powershell -File scripts/make-images.ps1`。進度見 [`PROGRESS.md`](./PROGRESS.md)。
