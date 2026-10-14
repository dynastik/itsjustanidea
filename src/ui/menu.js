// Main / pause menu: story mode, typing difficulty, volume, reduced flashing. Opens on load (the game waits behind it)
// and with F8 at any time. Difficulty only changes pressure and mistake tolerance, never the story.
import './menu.css';
import { state } from '../game/state.js';
import { DIFFICULTIES, getDifficulty, setDifficulty } from '../game/difficulty.js';
import { getStoryMode } from '../game/story.js';
import { setReducedFlicker } from '../game/director.js';

const KEY = 'itsjustanidea.settings';
const DEFAULTS = { volume: 0.8, sound: true, reducedFlicker: false };
const DIFF_TEXT = {
  easy: 'Forgiving mistakes, gentle pace.',
  medium: 'The intended balance.',
  hard: 'Sharper mistakes, faster pressure.',
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

// cb: { onStoryMode(mode), onVolume(0..1), onMute(bool), getMuted(), onStart() }
export function createMenu(cb) {
  const s = load();
  const save = () => { try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage may be blocked */ } };

  const el = document.createElement('div');
  el.id = 'menu';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'menu-title');
  el.innerHTML = `
    <div class="menu-card">
      <h1 id="menu-title">itsjustanidea</h1>
      <p class="menu-sub">One delivery left. Drive the town, then type the highway.</p>
      ${window.matchMedia?.('(pointer: coarse)').matches ? '<p class="menu-note">This game needs a physical keyboard.</p>' : ''}
    <div class="menu-row">
        <span class="menu-label">Story</span>
        <div class="seg" data-group="story">
          <button type="button" data-v="short">Short<small>one drive, about 12 minutes</small></button>
          <button type="button" data-v="long">Long<small>three days and nights, about 40 minutes</small></button>
        </div>
        <p class="menu-note" id="menu-restart" hidden>Changing the story restarts the run.</p>
      </div>
      <div class="menu-row">
        <span class="menu-label">Typing difficulty</span>
        <div class="seg" data-group="difficulty">
          ${DIFFICULTIES.map((d) => `<button type="button" data-v="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}
        </div>
        <p class="menu-note" id="menu-diff-note"></p>
      </div>
      <div class="menu-row">
        <label for="menu-volume">Volume</label>
        <input id="menu-volume" type="range" min="0" max="100" step="5" />
      </div>
      <label class="menu-check"><input id="menu-sound" type="checkbox" /> Sound on</label>
      <label class="menu-check"><input id="menu-flicker" type="checkbox" /> Reduce flashing (headlight flickers become a slow dim)</label>
      <button id="menu-go" type="button">Start driving</button>
      <p class="menu-keys">City: WASD, Q/E shift. Highway: type the text. F2 cab, F3 camera, F5 headlights, Esc pause, F8 this menu.</p>
    </div>`;
  document.body.appendChild(el);

  const $ = (sel) => el.querySelector(sel);
  const go = $('#menu-go');
  const vol = $('#menu-volume');
  const snd = $('#menu-sound');
  const flk = $('#menu-flicker');
  let started = false;
  let isOpen = false;

  function refresh() {
    el.querySelectorAll('[data-group="story"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === getStoryMode())));
    el.querySelectorAll('[data-group="difficulty"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === getDifficulty())));
    $('#menu-diff-note').textContent = DIFF_TEXT[getDifficulty()];
    $('#menu-restart').hidden = !started;
    vol.value = Math.round(s.volume * 100);
    snd.checked = !cb.getMuted();
    flk.checked = s.reducedFlicker;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    state.paused = true;
    refresh();
    el.classList.add('open');
    go.focus();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove('open');
    state.paused = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  el.querySelector('[data-group="story"]').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (v && v !== getStoryMode()) cb.onStoryMode(v);
    refresh();
  });
  el.querySelector('[data-group="difficulty"]').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (v) setDifficulty(v);
    refresh();
  });
  vol.addEventListener('input', () => { s.volume = vol.value / 100; cb.onVolume(s.volume); save(); });
  snd.addEventListener('change', () => { s.sound = snd.checked; cb.onMute(!snd.checked); save(); });
  flk.addEventListener('change', () => { s.reducedFlicker = flk.checked; setReducedFlicker(flk.checked); save(); });
  go.addEventListener('click', () => {
    if (!started) { started = true; go.textContent = 'Resume'; cb.onStart?.(); }
    close();
  });

  // Registered before the game's own key handlers: while the menu is open it owns the keyboard.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8') { e.preventDefault(); e.stopImmediatePropagation(); if (isOpen) { if (started) close(); } else open(); return; }
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); if (started) close(); }
    e.stopImmediatePropagation();
  });
  // Leaving the tab opens the menu, so a run is never lost to a background tab.
  document.addEventListener('visibilitychange', () => { if (document.hidden && started) open(); });

  const hint = document.getElementById('hint');
  if (hint && !hint.textContent.includes('F8')) hint.textContent += ' | F8: menu';

  cb.onVolume(s.volume);
  cb.onMute(!s.sound);
  setReducedFlicker(s.reducedFlicker ? true : null);
  open();
  return { open, close, get isOpen() { return isOpen; } };
}
