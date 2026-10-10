import { state } from '../game/state.js';
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
  const speedoEl = $('speedo-readout');
  const rpmFillEl = $('rpm-fill');
  const rpmValueEl = $('rpm-value');
  const transmissionStatusEl = $('transmission-status');
  const headlightEl = $('headlight-status');
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
    set(modeLabel, 'mode', (highway ? 'MODE: HIGHWAY (W/S · AUTO-STEER)' : 'MODE: CITY (WASD)') + dev + directorState);
    const typing = highway && !state.storyDone; // read-only story captions on the highway
    set(typingPanel.style, 'panel', typing ? 'block' : 'none', 'display');
    // typing panel fades in over the handoff instead of popping on
    const fade = Math.min(1, (state.time - state.highwayEnteredAt) / HANDOFF_UI_FADE_S);
    set(typingPanel.style, 'fade', Math.round(fade * 20) / 20, 'opacity');
    const reverse = state.speed < -0.3;
    set(headlightEl, 'headlights', state.headlightsOn ? 'HEADLIGHTS: ON (F5)' : 'HEADLIGHTS: OFF (F5)');
    const trans = state.transmission || { gear: '1', rpm: 850, auto: false };
    set(speedoEl, 'speed', `GEAR ${trans.gear} · ${Math.round(Math.abs(state.speed) * 3.6)} km/h${trans.auto ? ' · AUTO' : ''}`);
    set(rpmValueEl, 'rpmValue', String(Math.round(trans.rpm)));
    set(rpmFillEl.style, 'rpmWidth', `${Math.min(100, Math.max(0, trans.rpm / 5300 * 100))}%`, 'width');
    const rpmClass = trans.rpm >= 4900 ? 'redline' : trans.rpm >= 4100 ? 'warning' : '';
    if (rpmFillEl.className !== rpmClass) rpmFillEl.className = rpmClass;
    let transStatus = '';
    let transStatusClass = '';
    if (trans.overRev) {
      transStatus = 'REDLINE · SHIFT UP';
      transStatusClass = 'warning';
    } else if (trans.lugging) {
      transStatus = 'ENGINE LUGGING · DOWNSHIFT';
      transStatusClass = 'warning';
    } else if (trans.shift) {
      transStatus = `${trans.shift} · CLUTCHING`;
      transStatusClass = 'shift';
    } else if (trans.auto) {
      transStatus = 'AUTOMATIC TRANSMISSION';
    } else {
      transStatus = 'Q DOWN · E UP · SHIFT AUTO-SELECT';
    }
    set(transmissionStatusEl, 'transmissionStatus', transStatus);
    if (transmissionStatusEl.className !== transStatusClass) transmissionStatusEl.className = transStatusClass;
    set(pauseEl.style, 'pause', state.paused ? 'flex' : 'none', 'display');

    if (typing) {
      const t = state.typing;
      if (cache.kind !== t.source) { // the road's own messages look different from the narration
        cache.kind = t.source;
        typingPanel.classList.toggle('message', t.source === 'message');
      }
      const html = `<span class="t-ok">${esc(t.target.slice(0, t.buffer.length))}</span><span>${esc(t.target.slice(t.buffer.length))}</span>`;
      set(sourceEl, 'source', getSourceLabel(t.source));
      set(targetWordEl, 'word', html, 'innerHTML');
      set(typedInputEl, 'typed', t.buffer);
      set(statsEl, 'stats', 'W/S DRIVE · Q/E SHIFT · SHIFT AUTO-SELECT · AUTO-STEER');
    }
  }

  return { update };
}