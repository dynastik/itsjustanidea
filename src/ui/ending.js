// The ending: fade to black, a brief silence, the closing line(s), a quiet run-stats line, then the run restarts from the morning
// (onDone resets behind the black). Short story: "NEXT DRIVER, PLEASE." Long story: the roadmap cliffhanger, which pairs with the
// delivery sheet (sheet.js shows the first stop already delivered on the next loop).
import { ENDING_LINE } from '../game/storyText.js';
import { getStoryMode } from '../game/story.js';
import { LONG_ENDING } from '../game/storyLong.js';
import * as runstats from '../game/runstats.js';

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createEnding() {
  const el = document.createElement('div');
  el.id = 'ending';
  const line = document.createElement('div');
  line.id = 'ending-line';
  const stats = document.createElement('div');
  stats.id = 'ending-stats';
  el.append(line, stats);
  document.body.appendChild(el);

  let running = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    get active() { return running; },
    async play(onDone) {
      if (running) return;
      running = true;
      const lines = getStoryMode() === 'long' ? LONG_ENDING : [ENDING_LINE];
      const s = runstats.summary();
      const isBest = runstats.commitBest();
      el.classList.add('on');                       // fade to black (CSS transition, 2.5 s)
      await wait(5000);                             // the fade, then a brief silence
      for (let i = 0; i < lines.length; i++) {
        line.textContent = lines[i];
        line.classList.add('on');
        if (i < lines.length - 1) {
          await wait(3800);
          line.classList.remove('on');
          await wait(1700);
        } else {
          await wait(s.keys ? 2500 : 5500);
        }
      }
      if (s.keys) {
        stats.textContent = `${mmss(s.seconds)}  ·  ${Math.round(s.wpm)} WPM  ·  ${Math.round(s.accuracy * 100)}% ACCURACY` +
          (isBest ? '  ·  NEW BEST' : s.best ? `  ·  BEST ${s.best} WPM` : '');
        stats.classList.add('on');
        await wait(4500);
      }
      onDone();                                     // reset happens behind the black
      await wait(700);
      line.classList.remove('on');
      stats.classList.remove('on');
      el.classList.remove('on');                    // fade back up on a bright morning
      await wait(2600);
      running = false;
    },
  };
}