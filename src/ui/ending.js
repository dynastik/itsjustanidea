// The ending: after the last message the screen fades to black, there is a brief silence, then
// "Next driver, please." and the whole thing starts again from the morning (onDone does the full reset).
export function createEnding() {
  const el = document.createElement('div');
  el.id = 'ending';
  const line = document.createElement('div');
  line.id = 'ending-line';
  el.appendChild(line);
  document.body.appendChild(el);

  let running = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    get active() { return running; },
    async play(onDone) {
      if (running) return;
      running = true;
      el.classList.add('on');                       // fade to black (CSS transition, 2.5 s)
      await wait(5000);                             // the fade, then a brief silence
      line.textContent = 'Next driver, please.';
      line.classList.add('on');
      await wait(5500);
      onDone();                                     // reset happens behind the black
      await wait(700);
      line.classList.remove('on');
      el.classList.remove('on');                    // fade back up on a bright morning
      await wait(2600);
      running = false;
    },
  };
}
