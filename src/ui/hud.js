import { state } from '../game/state.js';
import { getWpm, getAccuracy } from '../game/typing.js';
import { getSourceLabel } from '../game/story.js';
import * as director from '../game/director.js';
import { HANDOFF_UI_FADE_S } from '../game/zones.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const modeLabel = $('mode-label');
  const typingPanel = $('typing-panel');
  const sourceEl = $('prompt-source');
  const targetWordEl = $('target-word');
  const typedInputEl = $('typed-input');
  const statsEl = $('stats');
  const speedoEl = $('speedo');
  const pauseEl = $('pause-overlay');

  const cache = {};
  function set(el, key, value, prop = 'textContent') {
    if (cache[key] !== value) {
      cache[key] = value;
      el[prop] = value;
    }
  }

  function update() {
    const highway = state.mode === 'highway';
    const dev = state.zoneAuto ? '' : ' [DEV]';
    const directorState = highway ? ` [${director.getDirectorState().toUpperCase()}]` : '';
    set(modeLabel, 'mode', (highway ? 'MODE: HIGHWAY (TYPE)' : 'MODE: CITY (WASD)') + dev + directorState);
    const typing = highway && !state.storyDone; // the panel goes away once the last line is typed
    set(typingPanel.style, 'panel', typing ? 'block' : 'none', 'display');
    // typing panel fades in over the handoff instead of popping on
    const fade = Math.min(1, (state.time - state.highwayEnteredAt) / HANDOFF_UI_FADE_S);
    set(typingPanel.style, 'fade', Math.round(fade * 20) / 20, 'opacity');
    const reverse = state.speed < -0.3;
    set(speedoEl, 'speed', `${reverse ? 'R ' : ''}${Math.round(Math.abs(state.speed) * 3.6)} km/h`);
    set(pauseEl.style, 'pause', state.paused ? 'flex' : 'none', 'display');

    if (typing) {
      const t = state.typing;
      if (cache.kind !== t.source) { // the road's own messages look different from the narration
        cache.kind = t.source;
        typingPanel.classList.toggle('message', t.source === 'message');
      }
      const flash = state.time - t.lastErrorAt < 0.15;
      const done = esc(t.buffer);
      const next = esc(t.target.charAt(t.buffer.length));
      const rest = esc(t.target.slice(t.buffer.length + 1));
      const html = flash
        ? `<span class="t-err">${esc(t.target)}</span>`
        : `<span class="t-ok">${done}</span><span class="t-cur">${next}</span><span class="t-rest">${rest}</span>`;
      set(sourceEl, 'source', getSourceLabel(t.source));
      set(targetWordEl, 'word', html, 'innerHTML');
      set(typedInputEl, 'typed', t.buffer);
      set(statsEl, 'stats', `WPM: ${Math.round(getWpm())} | Accuracy: ${Math.round(getAccuracy() * 100)}%`);
    }
  }

  return { update };
}