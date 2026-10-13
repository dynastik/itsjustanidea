// Story modes.
//  short: one typed run; the day clock follows how much you have typed (ACT_TIME).
//  long:  a journey of highway LEGS (storyLong.js) separated by city visits (route.js). Each leg has its own stretch of the
//         continuous day clock (1.0 = one full day), so the story passes through several days and nights. The world clock
//         follows typing progress inside the current leg (getLongClock).
import { SHORT, ENDING_LINE } from './storyText.js';
import { LEGS } from './storyLong.js';
export { ENDING_LINE };

const KEY = 'itsjustanidea.storyMode';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ACT_TIME = { calm: [0, 0.10], uneasy: [0.10, 0.40], wrong: [0.40, 0.66], horror: [0.66, 0.76], finale: [0.76, 0.93] };

function index(list) {
  const offsets = [], acts = {};
  let total = 0;
  list.forEach((p) => {
    offsets.push(total);
    if (!acts[p.act]) acts[p.act] = { first: total, len: 0 };
    acts[p.act].len += p.text.length;
    total += p.text.length;
  });
  return { offsets, acts, total };
}
const si = index(SHORT);
const legIndexes = LEGS.map((leg) => index(leg.items));

const LABELS = { narration: 'THE STORY', message: 'THE ROAD', sign: 'ROAD SIGN' };
export const getSourceLabel = (s) => LABELS[s] || LABELS.narration;
export const isCaseInsensitive = () => true;

let mode = 'short';
try {
  const q = new URLSearchParams(window.location.search).get('mode');
  const saved = q || window.localStorage.getItem(KEY);
  if (saved === 'short' || saved === 'long') mode = saved;
} catch { /* ignore */ }

let cursor = 0, legIndex = 0, finished = false, currentAct = 'calm';

export const getStoryMode = () => mode;
export function setStoryMode(m) {
  if (m !== 'short' && m !== 'long') return;
  mode = m;
  try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ }
  resetStory();
}
export const getStoryLengthChars = () => (mode === 'long' ? legIndexes.reduce((n, l) => n + l.total, 0) : si.total);
export function resetStory() {
  cursor = 0; legIndex = 0; finished = false; currentAct = 'calm';
}

// Next typing prompt, or null. null means the story is over (isStoryFinished) or, in long mode, this leg is over (legDone).
export function pickPrompt() {
  if (mode === 'long') {
    const leg = LEGS[legIndex];
    if (!leg) { finished = true; return null; }
    if (cursor >= leg.items.length) {
      if (legIndex >= LEGS.length - 1) finished = true;
      return null;
    }
    const p = leg.items[cursor++];
    currentAct = p.act;
    return { text: p.text, source: p.kind || 'narration', act: p.act };
  }
  if (cursor >= SHORT.length) { finished = true; return null; }
  const p = SHORT[cursor++];
  currentAct = p.act;
  return { text: p.text, source: p.kind || 'narration', act: p.act };
}

export const getAct = () => currentAct;
export const isStoryFinished = () => finished;

// ---- long mode: legs ----
export const getLegIndex = () => legIndex;
export const getLegCount = () => LEGS.length;
export const getLegTitle = () => (LEGS[legIndex] ? LEGS[legIndex].title : '');
export function advanceLeg() {
  if (legIndex < LEGS.length - 1) legIndex++;
  cursor = 0;
  currentAct = LEGS[legIndex].items[0].act;
}

// Continuous day clock for long mode (1.0 = one day). Sits at the start of the leg until you type, then follows progress.
export function getLongClock(bufferLen = 0) {
  const i = Math.min(legIndex, LEGS.length - 1);
  const leg = LEGS[i], ix = legIndexes[i];
  let typed = 0;
  if (cursor >= leg.items.length) typed = ix.total;
  else if (cursor > 0) typed = ix.offsets[cursor - 1] + bufferLen;
  return leg.from + (leg.to - leg.from) * clamp01(typed / Math.max(1, ix.total));
}

// short mode only: clock position (0..1) from typing progress
export function getStoryTime(bufferLen = 0) {
  if (finished) return ACT_TIME.finale[1];
  const i = Math.max(cursor - 1, 0), p = SHORT[i];
  if (!p) return 0;
  const inf = si.acts[p.act];
  const typed = si.offsets[i] - inf.first + (cursor > 0 ? bufferLen : 0);
  const [a, b] = ACT_TIME[p.act] || ACT_TIME.calm;
  return a + (b - a) * clamp01(typed / Math.max(1, inf.len));
}

// dev (F6): jump to the first paragraph of the next act (long: within the current leg)
export function skipToNextAct() {
  const list = mode === 'long' ? (LEGS[legIndex] || LEGS[0]).items : SHORT;
  const cur = (list[Math.max(cursor - 1, 0)] || list[0]).act;
  let i = cursor;
  while (i < list.length && list[i].act === cur) i++;
  cursor = i;
}
