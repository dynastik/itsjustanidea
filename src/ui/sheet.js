// The delivery sheet: a small manifest top-right.
//  short: one real stop, then wrong in small specific ways as the story gets worse.
//  long:  one row per city visited. The first stops are honest. From the third city on the sheet says the stop is already delivered
//         before you arrive, at a time that has not happened yet (18:04), and the counter implies an enormous history.
// After a loop the first stop is already complete ("your first delivery is already complete"). It never shows another driver.
import { state } from '../game/state.js';
import { getStop, STOP_DEFS } from '../game/stops.js';
import { getDirectorState } from '../game/director.js';
import { getStoryMode, getLegIndex, getLegCount } from '../game/story.js';

const W = 34; // characters per row
const row = (n, place, status) => `${n}  ${place}`.padEnd(W - status.length) + status;
const dashes = '-'.repeat(W);
const FIXED = ['', '', 'DELIVERED 18:04', 'DELIVERED 18:04', 'DELIVERED 18:04']; // stops that were done before you got there
const pad2 = (n) => String(n).padStart(2, '0');

// The sun rises at world time 0.84 = 06:00; a day is 24 h.
function clockString(worldTime) {
  const h = (((6 + (worldTime - 0.84) * 24) % 24) + 24) % 24;
  const hh = Math.floor(h);
  return `${pad2(hh)}:${pad2(Math.floor((h - hh) * 60))}`;
}

export function createSheet() {
  const el = document.createElement('div');
  el.id = 'delivery-sheet';
  document.body.appendChild(el);
  let last = '';
  const stamps = []; // clock times at which the player really delivered

  function shortLines() {
    const stop = getStop();
    const act = getDirectorState();
    const pct = Math.round(stop.progress * 100);
    const first = stop.pre ? 'DELIVERED 06:12' : stop.done ? 'DELIVERED' : stop.progress > 0 ? `PARKING ${pct}%` : 'PENDING';
    const lines = ['DELIVERY SHEET', dashes, row(1, 'MILL LANE', first)];
    let count = stop.done ? 1 : 0;
    if (act === 'uneasy') {
      lines.push(row(2, 'BELLWEATHER', 'PENDING'));
    } else if (act === 'wrong') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'));
      count += 1;
    } else if (act === 'horror') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'), row(3, '????????', 'DELIVERED 18:04'));
      count = 4817 + state.loops;
    } else if (act === 'finale') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'), row(3, 'HOME', 'DELIVERED 18:04'));
      count = 4818 + state.loops;
    }
    lines.push(dashes, `DELIVERIES: ${count}`);
    return lines;
  }

  function longLines() {
    const stop = getStop();
    const v = state.visit || 0;
    const act = getDirectorState();
    const now = act === 'horror' || act === 'finale' ? '18:04' : clockString(state.worldTime);
    if (v === 0 && !stop.done && stamps.length) stamps.length = 0;
    if (stop.done && !stop.pre && !stamps[stop.index]) stamps[stop.index] = now;
    const lines = ['DELIVERY SHEET'.padEnd(W - now.length) + now, dashes];
    let delivered = 0;
    for (let i = 0; i <= v; i++) {
      const name = STOP_DEFS[Math.min(i, STOP_DEFS.length - 1)].name;
      let status;
      if (i < v) { status = FIXED[i] || `DELIVERED ${stamps[i] || '--:--'}`; delivered++; }
      else if (stop.done) { status = stop.pre ? 'DELIVERED 18:04' : `DELIVERED ${stamps[i] || now}`; delivered++; }
      else status = stop.progress > 0 ? `PARKING ${Math.round(stop.progress * 100)}%` : 'PENDING';
      lines.push(row(i + 1, name, status));
    }
    const count = v >= 3 ? 4814 + v + state.loops : delivered;
    lines.push(dashes, `DELIVERIES: ${count}`);
    lines.push(state.outro ? 'LEG COMPLETE: EXIT AHEAD' : state.mode === 'highway' ? `LEG ${getLegIndex() + 1} OF ${getLegCount()}` : stop.done ? 'NEXT: BACK TO THE HIGHWAY' : `NEXT: ${stop.name}`);
    return lines;
  }

  function update() {
    const text = (getStoryMode() === 'long' ? longLines() : shortLines()).join('\n');
    if (text !== last) { last = text; el.textContent = text; }
  }
  return { update };
}
