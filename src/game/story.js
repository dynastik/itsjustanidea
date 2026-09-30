// Story and typing content. Phase 3 expands this to full sentences and dynamic sources.
// For now, a fixed bank of highway-mode prompts that feed the HUD.

const PROMPTS_BY_ACT = {
  calm: [
    'sunset', 'highway', 'engine', 'gravel', 'horizon',
    'static', 'exhaust', 'asphalt', 'flicker', 'signal', 'distance',
    'headlight', 'shoulder', 'wander', 'silence', 'radio',
  ],
  // Phase 5: uneasy, wrong, horror prompts go here
};

let currentAct = 'calm';

export function pickWord() {
  const bank = PROMPTS_BY_ACT[currentAct] || PROMPTS_BY_ACT.calm;
  return bank[Math.floor(Math.random() * bank.length)];
}

export function setAct(act) {
  currentAct = act;
}

export function getAct() {
  return currentAct;
}
