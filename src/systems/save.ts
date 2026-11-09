// 存檔：IndexedDB via idb-keyval（DESIGN.md §6.1）；讀檔失敗唔覆蓋舊檔（§9）
import { get, set, del } from 'idb-keyval';
import { CONFIG } from '../config';
import type { GameState } from '../state';

const KEY = CONFIG.save.key;

export async function loadGame(): Promise<GameState | null> {
  try {
    const s = (await get(KEY)) as GameState | undefined;
    if (!s) return null;
    if (s.version !== CONFIG.save.version) {
      await set(`${KEY}-v${s.version}-backup`, s);
      return null;
    }
    return s;
  } catch (e) {
    console.warn('讀檔失敗，舊檔保留', e);
    return null;
  }
}

export const saveGame = (s: GameState) => set(KEY, s).catch((e) => console.warn('存檔失敗', e));
export const deleteSave = () => del(KEY);

export const bitsToB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};
export const b64ToBits = (s: string, len: number) => {
  const out = new Uint8Array(len);
  if (!s) return out;
  const raw = atob(s);
  for (let i = 0; i < Math.min(raw.length, len); i++) out[i] = raw.charCodeAt(i);
  return out;
};
