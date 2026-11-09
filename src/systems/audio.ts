// 音效：全部用 WebAudio 即場合成（瀏覽器原生，唔使素材檔）— DESIGN.md §5.2 第 5 點環境音層
import { CONFIG } from '../config';

const VOL_KEY = 'typhoon-dead-volume';
let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let volume = (() => {
  try {
    const v = localStorage.getItem(VOL_KEY);
    return v === null ? CONFIG.audio.volume : Number(v);
  } catch {
    return CONFIG.audio.volume;
  }
})();
const loops: Record<'rain' | 'heli' | 'alarm', GainNode | null> = { rain: null, heli: null, alarm: null };

export const getVolume = () => volume;
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx) master.gain.value = volume;
  try {
    localStorage.setItem(VOL_KEY, String(volume));
  } catch {
    /* 私密模式：唔記得都照玩 */
  }
}

/** 瀏覽器要用戶撳過先俾出聲：第一次撳掣 / 撳鍵先建立 */
export function initAudio() {
  const start = () => {
    if (ctx) return void ctx.resume();
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    loops.rain = loopNoise('lowpass', 1800, 0);
    loops.heli = loopHeli();
    loops.alarm = loopAlarm();
  };
  addEventListener('pointerdown', start);
  addEventListener('keydown', start);
}

function noise(dur: number, type: BiquadFilterType, freq: number, gain: number, at = 0, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur);
}

// 每次播放前設定嘅輸出節點（帶位置聲道）
let out: AudioNode;

function loopNoise(type: BiquadFilterType, freq: number, gain: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start();
  return g;
}

function loopHeli() {
  const g = loopNoise('lowpass', 220, 0);
  const lfo = ctx!.createOscillator();
  lfo.frequency.value = 11; // 旋翼
  const depth = ctx!.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(g.gain);
  lfo.start();
  return g;
}

function loopAlarm() {
  const o = ctx!.createOscillator();
  o.type = 'square';
  o.frequency.value = 700;
  const lfo = ctx!.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 2;
  const depth = ctx!.createGain();
  depth.gain.value = 180;
  lfo.connect(depth).connect(o.frequency);
  const g = ctx!.createGain();
  g.gain.value = 0;
  o.connect(g).connect(master);
  o.start();
  lfo.start();
  return g;
}

/** 環境聲音量（0–1） */
export function setLoop(name: 'rain' | 'heli' | 'alarm', level: number) {
  const g = loops[name];
  if (!g || !ctx) return;
  const scale = name === 'rain' ? 0.35 : name === 'heli' ? 0.5 : 0.06;
  g.gain.setTargetAtTime(level * scale, ctx.currentTime, 0.3);
}

export type Sfx =
  | 'step' | 'swing' | 'hit' | 'kill' | 'hurt' | 'groan' | 'door' | 'bash' | 'glass' | 'hammer'
  | 'search' | 'eat' | 'pickup' | 'fire' | 'heart' | 'chime' | 'click';

/** 播一個音效；畀 dist / dx（px）就按距離細聲同左右聲道 */
export function play(name: Sfx, dist = 0, dx = 0, maxTiles = 20) {
  if (!ctx || volume <= 0) return;
  const fall = 1 - dist / (maxTiles * CONFIG.tile);
  if (fall <= 0) return;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, dx / 240));
  const g = ctx.createGain();
  g.gain.value = fall;
  pan.connect(g).connect(master);
  out = pan;
  const r = Math.random();
  switch (name) {
    case 'step': noise(0.05, 'lowpass', 500 + r * 200, 0.12); break;
    case 'swing': noise(0.14, 'bandpass', 1400 + r * 600, 0.25, 0, 0.8); break;
    case 'hit': tone('sine', 140, 45, 0.14, 0.7); noise(0.05, 'lowpass', 1500, 0.4); break;
    case 'kill': tone('sine', 90, 30, 0.3, 0.8); noise(0.2, 'lowpass', 600, 0.4); break;
    case 'hurt': tone('sawtooth', 240, 90, 0.25, 0.25); noise(0.1, 'bandpass', 900, 0.3); break;
    case 'groan': {
      const f = 70 + r * 40;
      tone('sawtooth', f, f * 0.8, 0.9, 0.12);
      noise(0.8, 'bandpass', 500 + r * 200, 0.08, 0, 4);
      break;
    }
    case 'door': tone('sawtooth', 260, 520, 0.28, 0.06); noise(0.06, 'lowpass', 400, 0.3, 0.25); break;
    case 'bash': tone('sine', 110, 50, 0.18, 0.6); noise(0.12, 'lowpass', 800, 0.5); break;
    case 'glass':
      noise(0.3, 'highpass', 3000, 0.6);
      for (let k = 0; k < 4; k++) tone('sine', 2500 + Math.random() * 2500, 1800, 0.12, 0.12, k * 0.04);
      break;
    case 'hammer': tone('triangle', 900, 500, 0.05, 0.4); noise(0.03, 'highpass', 2000, 0.3); break;
    case 'search': noise(0.35, 'bandpass', 1500 + r * 800, 0.15, 0, 1.5); break;
    case 'eat': noise(0.04, 'bandpass', 2000, 0.25); noise(0.04, 'bandpass', 1800, 0.25, 0.12); break;
    case 'pickup': tone('sine', 700, 1100, 0.08, 0.15); break;
    case 'fire': noise(0.6, 'lowpass', 900, 0.6); for (let k = 0; k < 6; k++) noise(0.02, 'highpass', 3000, 0.2, 0.1 + k * 0.07); break;
    case 'heart': tone('sine', 65, 40, 0.12, 0.6); tone('sine', 60, 38, 0.12, 0.45, 0.18); break;
    case 'chime': tone('sine', 660, 660, 0.25, 0.2); tone('sine', 990, 990, 0.35, 0.2, 0.12); break;
    case 'click': tone('square', 1200, 900, 0.03, 0.05); break;
  }
}
