import * as Phaser from 'phaser';
import './ui/ui.css';
import { PALETTE } from './config';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: PALETTE.ink,
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  physics: { default: 'arcade' },
  scene: [BootScene, WorldScene],
});

// 方便瀏覽器測試時檢查
(window as unknown as { game: Phaser.Game }).game = game;
