import * as Phaser from 'phaser';
import './ui/ui.css';
import { CONFIG, PALETTE } from './config';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { type GameState, newGame } from './state';
import { loadGame } from './systems/save';
import { initAudio } from './systems/audio';
import { closeMenu, showProfessions, showTitle } from './ui/menu';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: PALETTE.ink,
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  physics: { default: 'arcade' },
  scene: [BootScene, WorldScene],
  disableContextMenu: true,
  // 音效用自己嘅 WebAudio 合成（systems/audio.ts），唔使 Phaser 嘅聲音系統
  audio: { noAudio: true },
});

function start(state: GameState) {
  closeMenu();
  game.scene.start('world', { state });
}

async function title() {
  const save = await loadGame();
  showTitle(
    !!save,
    () => start(save!),
    () =>
      showProfessions(
        '揀職業',
        (prof) => start(newGame(CONFIG.seed || Math.floor(Math.random() * 2 ** 31), prof)),
        title,
      ),
  );
}
initAudio();
title();

// 方便瀏覽器測試時檢查
(window as unknown as { game: Phaser.Game }).game = game;
