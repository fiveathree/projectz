// 背包（DESIGN.md §3.6）：重量制、兩欄（身上 / 地上或容器）、點擊或原生拖放
import { ITEMS, type Item, isRotten } from '../state';

export interface InvView {
  body: Item[];
  weapon: Item | null;
  bag: Item | null;
  weight: number;
  cap: number;
  other: Item[];
  otherName: string;
  minutes: number;
  recipes: { id: string; name: string; needs: string; ok: boolean; help: string }[];
}
export interface InvActions {
  use(i: number): void;
  drop(i: number): void;
  take(j: number): void;
  takeAll(): void;
  unequip(slot: 'weapon' | 'bag'): void;
  craft(id: string): void;
}

const el = document.getElementById('inv')!;
let view: (() => InvView) | null = null;
let actions: InvActions | null = null;
let tab: 'bag' | 'craft' = 'bag';

const USE_LABEL: Record<string, string> = { food: '食', drink: '飲', med: '用', battery: '換', weapon: '拎', bag: '揹', phone: '叉', throw: '掟', place: '放', misc: '睇' };
let now = 0;
const desc = (it: Item) => {
  const d = ITEMS[it.id];
  const dur = it.dur !== undefined && d.durability ? ` ${Math.round((it.dur / d.durability) * 100)}%` : '';
  const rot = isRotten(it, now) ? ' <b style="color:var(--red)">變壞</b>' : it.exp !== undefined && it.exp - now < 360 ? ' <b style="color:var(--gold)">就壞</b>' : '';
  const raw = d.raw ? ' <b style="color:var(--gold)">生</b>' : '';
  return `${d.name}${raw}${rot}<em> ${d.weight}kg${dur}</em>`;
};

export const inventoryOpen = () => view !== null;

export function openInventory(get: () => InvView, act: InvActions) {
  view = get;
  actions = act;
  el.classList.remove('hidden');
  refreshInventory();
}

export function closeInventory() {
  view = actions = null;
  el.classList.add('hidden');
}

export function refreshInventory() {
  if (!view || !actions) return;
  const v = view();
  const a = actions;
  now = v.minutes;
  const over = v.weight > v.cap;
  const tabs = `<div class="tabs"><button data-tab="bag" class="${tab === 'bag' ? 'on' : ''}">背包</button><button data-tab="craft" class="${tab === 'craft' ? 'on' : ''}">製作</button></div>`;
  if (tab === 'craft') {
    el.innerHTML = `${tabs}<div class="craft">${v.recipes
      .map((r) => `<div class="row"><span><b>${r.name}</b> <em>${r.needs}</em> <span class="info" tabindex="0">ⓘ<span class="pop">${r.help}</span></span></span><button data-craft="${r.id}" ${r.ok ? '' : 'disabled style="opacity:.4"'}>製作</button></div>`)
      .join('')}</div>`;
  } else el.innerHTML = `${tabs}
    <div class="col">
      <h3>身上 <span style="color:${over ? 'var(--red)' : 'inherit'}">${v.weight.toFixed(1)} / ${v.cap.toFixed(1)} kg</span></h3>
      <div class="slots">
        <div>主手：${v.weapon ? desc(v.weapon) : '空手'} ${v.weapon ? '<button data-un="weapon">除</button>' : ''}</div>
        <div>背囊：${v.bag ? desc(v.bag) : '冇'} ${v.bag ? '<button data-un="bag">除</button>' : ''}</div>
      </div>
      <div class="list" data-zone="body">${
        v.body.map((it, i) => `<div class="row" draggable="true" data-from="body" data-i="${i}" data-id="${it.id}"><span>${desc(it)}</span><button data-use="${i}">${USE_LABEL[ITEMS[it.id].kind]}</button><button data-drop="${i}">放低</button></div>`).join('') ||
        '<div class="empty">乜都冇</div>'
      }</div>
      <div class="foot">拖物品落快捷欄 1–5 · Tab 關閉 · 開住背包時間會慢落（唔會停）</div>
    </div>
    <div class="col">
      <h3>${v.otherName} ${v.other.length ? '<button data-all="1">全部攞</button>' : ''}</h3>
      <div class="list" data-zone="other">${
        v.other.map((it, j) => `<div class="row" draggable="true" data-from="other" data-i="${j}" data-id="${it.id}"><span>${desc(it)}</span><button data-take="${j}">攞</button></div>`).join('') ||
        '<div class="empty">空嘅</div>'
      }</div>
    </div>`;

  el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.onclick = () => {
      const d = b.dataset;
      if (d.tab) tab = d.tab as 'bag' | 'craft';
      else if (d.craft) a.craft(d.craft);
      else if (d.use) a.use(+d.use);
      else if (d.drop) a.drop(+d.drop);
      else if (d.take) a.take(+d.take);
      else if (d.all) a.takeAll();
      else if (d.un) a.unequip(d.un as 'weapon' | 'bag');
      refreshInventory();
    };
  });
  el.querySelectorAll<HTMLDivElement>('.row').forEach((r) => {
    r.ondragstart = (e) => {
      e.dataTransfer!.setData('text/plain', `${r.dataset.from}:${r.dataset.i}`);
      e.dataTransfer!.setData('text/item-id', r.dataset.id!);
    };
  });
  el.querySelectorAll<HTMLDivElement>('.list').forEach((list) => {
    list.ondragover = (e) => {
      e.preventDefault();
      list.classList.add('over');
    };
    list.ondragleave = () => list.classList.remove('over');
    list.ondrop = (e) => {
      e.preventDefault();
      const [from, i] = (e.dataTransfer?.getData('text/plain') ?? '').split(':');
      if (from === 'body' && list.dataset.zone === 'other') a.drop(+i);
      if (from === 'other' && list.dataset.zone === 'body') a.take(+i);
      refreshInventory();
    };
  });
}
