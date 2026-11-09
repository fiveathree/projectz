// 全畫面：標題、揀職業、日卡、死亡、結局、暫停（純 DOM）
import { PROFESSIONS } from '../state';
import { getVolume, setVolume } from '../systems/audio';

const menu = document.getElementById('menu')!;
const card = document.getElementById('daycard')!;

const open = (html: string) => {
  menu.innerHTML = html;
  menu.classList.remove('hidden');
};
export const closeMenu = () => menu.classList.add('hidden');
export const menuOpen = () => !menu.classList.contains('hidden');
const bind = (handlers: Record<string, () => void>) => {
  for (const [id, fn] of Object.entries(handlers)) {
    const b = menu.querySelector<HTMLButtonElement>(`[data-b="${id}"]`);
    if (b) b.onclick = fn;
  }
};

const KEYS = 'WASD 移動 · 滑鼠面向 · 左鍵攻擊（打窗）· Space 推撞 · Shift 跑 · C 潛行 · E 互動 · R 釘板 / 拆 · G 掟燃燒樽 · Tab 背包 / 製作 · P 手機 · M 地圖 · F 電筒 · 1–5 快捷欄 · Esc 暫停';

export function showTitle(hasSave: boolean, onContinue: () => void, onNew: () => void) {
  open(`
    <h1>澳汐七日</h1><h2>TYPHOON DEAD</h2>
    <p>颱風夜，北汐舊城爆發「潮病」。電台話：第七日 18:00，碼頭有最後一班撤離船。<br>生存七日，帶足補給，趕上條船。</p>
    <div class="row">${hasSave ? '<button data-b="cont">繼續</button>' : ''}<button data-b="new">新遊戲</button></div>
    <p class="keys">${KEYS}</p>`);
  bind({ cont: onContinue, new: onNew });
}

export function showProfessions(title: string, onPick: (id: string) => void, onBack?: () => void) {
  open(`
    <h1 style="font-size:28px">${title}</h1>
    <div class="profs">${Object.entries(PROFESSIONS)
      .map(([id, p]) => `<button data-b="p-${id}"><b>${p.name}</b>＋${p.pro}<small>－${p.con}</small></button>`)
      .join('')}</div>
    ${onBack ? '<div class="row"><button data-b="back">返回</button></div>' : ''}`);
  bind(Object.fromEntries([...Object.keys(PROFESSIONS).map((id) => [`p-${id}`, () => onPick(id)]), ['back', () => onBack?.()]]));
}

export function showDayCard(day: number, title: string, radio: string, onDone: () => void) {
  const nums = '一二三四五六七';
  card.innerHTML = `<h1>第${nums[day - 1] ?? day}日 · ${title}</h1><p>📻 ${radio}</p><p class="keys">（點擊繼續）</p>`;
  card.classList.remove('hidden');
  const done = () => {
    clearTimeout(timer);
    card.classList.add('hidden');
    onDone();
  };
  const timer = setTimeout(done, 6000);
  card.onclick = done;
}

export function showDeath(text: string, onNewChar: () => void, onReset: () => void) {
  open(`
    <h1 style="color:var(--red)">你死咗</h1>
    <p>${text}</p>
    <p>你嘅屍體會留喺原地，過一陣會變成喪屍，身上仲有你嘅裝備。</p>
    <div class="row"><button data-b="again">新角色 · 同一個世界</button><button data-b="reset">重置世界</button></div>`);
  bind({ again: onNewChar, reset: onReset });
}

export function showEnding(title: string, text: string, buttons: Record<string, () => void>) {
  open(`<h1>${title}</h1><p>${text}</p><div class="row">${Object.keys(buttons)
    .map((k, i) => `<button data-b="e${i}">${k}</button>`)
    .join('')}</div>`);
  bind(Object.fromEntries(Object.values(buttons).map((fn, i) => [`e${i}`, fn])));
}

export function showPause(onResume: () => void, onQuit: () => void) {
  open(`<h1>暫停</h1><p class="keys">${KEYS}</p>
    <label class="vol">🔊 音量 <input type="range" min="0" max="100" value="${Math.round(getVolume() * 100)}" /></label>
    <div class="row"><button data-b="go">繼續</button><button data-b="quit">存檔並返回標題</button></div>`);
  menu.querySelector<HTMLInputElement>('input[type=range]')!.oninput = (e) => setVolume(Number((e.target as HTMLInputElement).value) / 100);
  bind({ go: onResume, quit: onQuit });
}
