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
    <button id="touch-menu" type="button">MENU</button>
    <div id="touch-drive" aria-label="Driving controls">
      <div class="touch-cluster">
        <button type="button" data-control="left" aria-label="Steer left">◀</button>
        <button type="button" data-control="right" aria-label="Steer right">▶</button>
      </div>
      <div class="touch-cluster touch-pedals">
        <button type="button" data-control="brake" aria-label="Brake">BRAKE</button>
        <button type="button" data-control="throttle" aria-label="Accelerate">DRIVE</button>
      </div>
    </div>
    <div id="touch-type">
      <label for="touch-type-input">Tap to type the highway text</label>
      <input id="touch-type-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Type the highway text" />
    </div>`;
  document.body.appendChild(root);

  const drive = root.querySelector('#touch-drive');
  const type = root.querySelector('#touch-type');
  const typeInput = root.querySelector('#touch-type-input');
  const held = { left: false, right: false, brake: false, throttle: false };
  const getDrive = () => ({
    steer: Number(held.left) - Number(held.right),
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

  let acceptedValue = '';
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
    drive.hidden = !city;
    type.hidden = city;
    root.hidden = state.paused;
    if (state.paused) {
      for (const key in held) held[key] = false;
      root.querySelectorAll('[data-control]').forEach((button) => button.classList.remove('pressed'));
      input.setTouchControls(getDrive());
    }
    if (city) {
      if (document.activeElement === typeInput) typeInput.blur();
      acceptedValue = '';
      if (typeInput.value) typeInput.value = '';
      input.setTouchControls(getDrive());
    } else if (typeInput.value !== state.typing.buffer) {
      acceptedValue = state.typing.buffer;
      typeInput.value = acceptedValue;
    }
  }

  return { update };
}
