import * as THREE from 'three';
import { state } from '../game/state.js';

export function hasTouchInput() {
  return !!(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
}

export function createTouchControls(input, actions) {
  if (!hasTouchInput()) return { update() {} };

  actions.setTouchAutoShift?.(true);
  document.body.classList.add('touch-controls-enabled');
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = `
    <button id="touch-view" type="button" aria-label="Change camera view">NORMAL VIEW</button>
    <button id="touch-menu" type="button">MENU</button>
    <div id="touch-drive" aria-label="Driving controls">
      <div class="touch-cluster">
        <button type="button" data-control="left" aria-label="Steer left">←</button>
        <button type="button" data-control="right" aria-label="Steer right">→</button>
      </div>
      <div class="touch-cluster touch-pedals">
        <button id="touch-reverse" type="button" aria-label="Toggle reverse" aria-pressed="false" title="Stop to change direction">R<span>REV</span></button>
        <button type="button" data-control="brake" aria-label="Brake"><span>BRAKE</span></button>
        <button type="button" data-control="throttle" aria-label="Accelerate">↑<span>GO</span></button>
      </div>
    </div>
    <div id="touch-cab-hint" hidden>Drag the steering wheel to steer</div>
    <div id="touch-type">
      <label for="touch-type-input">Tap to type the highway text</label>
      <input id="touch-type-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Type the highway text" />
    </div>`;
  document.body.appendChild(root);

  const drive = root.querySelector('#touch-drive');
  const cabHint = root.querySelector('#touch-cab-hint');
  const type = root.querySelector('#touch-type');
  const typeInput = root.querySelector('#touch-type-input');
  const reverseButton = root.querySelector('#touch-reverse');
  const viewButton = root.querySelector('#touch-view');
  const held = { left: false, right: false, brake: false, throttle: false };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const getDrive = () => ({
    steer: cabDrag ? clamp((cabDrag.startX - cabDrag.currentX) / 95, -1, 1) : Number(held.left) - Number(held.right),
    throttle: Number(held.throttle),
    brake: Number(held.brake),
  });

  for (const button of root.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    const release = (event) => {
      if (event && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      held[control] = false;
      button.classList.remove('pressed');
      input.setTouchControls(getDrive());
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      held[control] = true;
      button.classList.add('pressed');
      input.setTouchControls(getDrive());
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => release());
  }

  root.querySelector('#touch-menu').addEventListener('click', actions.openMenu);
  viewButton.addEventListener('click', actions.cycleView);
  reverseButton.addEventListener('click', () => {
    const enabled = !actions.isTouchReverse();
    if (actions.setTouchReverse(enabled)) {
      reverseButton.classList.toggle('pressed', enabled);
      reverseButton.setAttribute('aria-pressed', String(enabled));
    }
  });

  let acceptedValue = '';
  let cabDrag = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = actions.canvas;
  canvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'city' || !actions.isCabView()) return;
    pointer.set(
      ((event.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1,
      -((event.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointer, actions.camera);
    const steeringWheelHit = actions.getSteeringWheelHit();
    if (!steeringWheelHit || !raycaster.intersectObject(steeringWheelHit, false).length) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.setPointerCapture(event.pointerId);
    cabDrag = { id: event.pointerId, startX: event.clientX, currentX: event.clientX };
  }, { capture: true });
  canvas.addEventListener('pointermove', (event) => {
    if (!cabDrag || event.pointerId !== cabDrag.id) return;
    event.preventDefault();
    cabDrag.currentX = event.clientX;
    input.setTouchControls(getDrive());
  }, { capture: true });
  const endCabDrag = (event) => {
    if (!cabDrag || (event && event.pointerId !== cabDrag.id)) return;
    cabDrag = null;
    input.setTouchControls(getDrive());
  };
  canvas.addEventListener('pointerup', endCabDrag);
  canvas.addEventListener('pointercancel', endCabDrag);
  canvas.addEventListener('lostpointercapture', endCabDrag);

  const viewport = window.visualViewport;
  function updateViewport() {
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--touch-vv-top', `${top}px`);
    document.documentElement.style.setProperty('--touch-vv-height', `${height}px`);
  }
  updateViewport();
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);

  typeInput.addEventListener('input', () => {
    const value = typeInput.value;
    let prefix = 0;
    while (prefix < acceptedValue.length && prefix < value.length && acceptedValue[prefix] === value[prefix]) prefix++;
    for (let i = prefix; i < acceptedValue.length; i++) actions.typeBackspace();
    for (const character of value.slice(prefix)) actions.typeKey(character);
    acceptedValue = state.typing.buffer;
    typeInput.value = acceptedValue;
    typeInput.setSelectionRange(acceptedValue.length, acceptedValue.length);
  });

  function update() {
    const city = state.mode === 'city';
    const cab = city && actions.isCabView();
    viewButton.textContent = `${actions.getViewName()} VIEW`;
    drive.hidden = !city || cab;
    cabHint.hidden = !cab;
    type.hidden = city;
    root.hidden = state.paused;
    if (state.paused) {
      if (document.activeElement === typeInput) typeInput.blur();
      endCabDrag();
      for (const key in held) held[key] = false;
      root.querySelectorAll('[data-control]').forEach((button) => button.classList.remove('pressed'));
      input.setTouchControls(getDrive());
    }
    if (!city || !cab) endCabDrag();
    if (city) {
      if (document.activeElement === typeInput) typeInput.blur();
      acceptedValue = '';
      if (typeInput.value) typeInput.value = '';
      input.setTouchControls(getDrive());
    } else {
      endCabDrag();
      for (const key in held) held[key] = false;
      root.querySelectorAll('[data-control]').forEach((button) => button.classList.remove('pressed'));
      input.setTouchControls(getDrive());
      if (typeInput.value !== state.typing.buffer) {
        acceptedValue = state.typing.buffer;
        typeInput.value = acceptedValue;
      }
    }
    const reverse = actions.isTouchReverse();
    reverseButton.classList.toggle('pressed', reverse);
    reverseButton.setAttribute('aria-pressed', String(reverse));
    reverseButton.disabled = !actions.canChangeTouchDirection();
  }

  return { update };
}
