// The delivery sheet (roadmap Phase 4/5): a small manifest top-right. In the calm acts it is just an honest record of the
// one real stop. As the story gets worse it starts to be wrong in small, specific ways: a stop marked delivered before you
// reach it, a repeating timestamp, a counter that implies an enormous history. It never names or shows another driver.
import { state } from '../game/state.js';
import { getStop } from '../game/stops.js';
import { getDirectorState } from '../game/director.js';

const W = 30; // characters per row

const row = (n, place, status) => `${n}  ${place}`.padEnd(W - status.length) + status;

export function createSheet() {
  const el = document.createElement('div');
  el.id = 'delivery-sheet';
  document.body.appendChild(el);
  let last = '';

  function update() {
    const stop = getStop();
    const act = getDirectorState(); // calm | uneasy | wrong | horror | finale
    const looped = state.loops > 0;
    const pct = Math.round(stop.progress * 100);
    const first = looped ? 'DELIVERED 06:12' : stop.done ? 'DELIVERED' : stop.progress > 0 ? `PARKING ${pct}%` : 'PENDING';
    const lines = ['DELIVERY SHEET', '-'.repeat(W), row(1, 'MILL LANE', first)];
    let count = looped || stop.done ? 1 : 0;

    if (act === 'uneasy') {
      lines.push(row(2, 'BELLWEATHER', 'PENDING'));
    } else if (act === 'wrong') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'));
      count += 1;
    } else if (act === 'horror') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'));
      lines.push(row(3, '????????', 'DELIVERED 18:04'));
      count = 4817 + state.loops;
    } else if (act === 'finale') {
      lines.push(row(2, 'BELLWEATHER', 'DELIVERED 18:04'));
      lines.push(row(3, 'HOME', 'DELIVERED 18:04'));
      count = 4818 + state.loops;
    }
    lines.push('-'.repeat(W), `DELIVERIES: ${count}`);

    const text = lines.join('\n');
    if (text !== last) {
      last = text;
      el.textContent = text;
    }
  }

  return { update };
}
