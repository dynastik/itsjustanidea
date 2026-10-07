// Story and typing content. The highway prompts ARE the story: each act delivers its lines in order
// (so the narrative reads as one thread), then falls back to a filler pool if the player outlasts them.
// Typing tiers rise with the act: lowercase words -> lowercase + punctuation -> sentences + capitals -> pressure.
//
// Rules for writing prompts:
//  - ASCII only, and never a backtick (it is the debug hotkey).
//  - Never name the entity. Keep it deniable ("maybe it's just tired driving").
//  - Keep calm/uneasy lines short; they are also the typing tutorial by osmosis.

const ACTS = {
  calm: {
    // first prompts are single easy words, so nobody is thrown in with a sentence
    warmup: ['sunset', 'highway', 'engine', 'horizon', 'radio', 'gravel'],
    lines: [
      'sunny morning',
      'radio on low',
      'coffee still warm',
      'twelve boxes in the back',
      'every stop is on time',
      'the hills look soft today',
      'wave at the cyclist',
      'nothing ahead but road',
      'window down a little',
      'good day for a long drive',
      'nobody waiting on this one',
      'one more delivery then lunch',
    ],
    filler: [
      'static', 'exhaust', 'asphalt', 'flicker', 'signal', 'distance', 'headlight',
      'shoulder', 'wander', 'silence', 'open road', 'easy miles', 'soft light',
    ],
  },
  uneasy: {
    lines: [
      'forty miles to the next stop.',
      'same sign again, huh.',
      'the radio is quieter than i left it.',
      'that is the third mile marker today.',
      'must be tired driving.',
      'forty miles to the next stop.', // repeated on purpose
      'did i pick up the last box?',
      'the hills all look alike out here.',
      'keep going, it is only the road.',
      'someone hums along, low, in the static.',
    ],
    filler: [
      'almost there.', 'just the wind.', 'keep your eyes ahead.', 'it is fine, really.',
      'same hill, maybe.', 'nobody else out here.',
    ],
  },
  wrong: {
    lines: [
      'The passenger seat is warm.',
      'You do not remember buckling it.',
      'The mirror shows the road behind you. Mostly.',
      'Someone moved the air freshener.',
      'The radio is saying what you were about to type.',
      'It is very quiet on the passenger side.',
      'You have been on this road before. Have you?',
      'Do not check the mirror. Keep typing.',
      'The last package had no address.',
      'Your speed is fine. Something else is not.',
    ],
    filler: [
      'Eyes on the road.', 'Nobody is in the back.', 'The seat is only warm from the sun.',
      'Keep your hands on the wheel.', 'It is only tired driving.',
    ],
  },
  horror: {
    lines: [
      'Keep typing. It only stays while you type.',
      'Every word you finish makes the seat feel warmer.',
      'It knows how fast you type.',
      'You were never the only driver of this van.',
      'Do not look in the mirror. Type instead.',
      'The road does not end because you stopped looking for the end.',
      'Stop typing and listen to who is breathing.',
      'Finish this sentence and it will still be sitting beside you.',
      'You already know whose hands are on the wheel.',
      'Do not slow down.',
    ],
    filler: [
      'Do not stop.', 'It is closer now.', 'Faster.', 'Keep going. Keep going. Keep going.',
      'Look at the road, not the seat.',
    ],
  },
};

// Extra prompt sources, mixed in between story lines every few prompts. Same tier rules as the acts.
// Add a new source by adding an entry here (and a label); nothing else needs to change.
const SOURCES = {
  sign: {
    label: 'ROAD SIGN',
    calm: ['speed limit sixty', 'next exit two miles', 'scenic view ahead', 'rest area one mile'],
    uneasy: ['rest area one mile.', 'next exit two miles.', 'no services for forty miles.'],
    wrong: ['Next Exit: Nowhere.', 'Rest Area: Occupied.', 'Speed Limit: As Fast As You Can Type.'],
    horror: ['DO NOT STOP.', 'Next Exit: Behind You.', 'Rest Area: Waiting.'],
  },
  radio: {
    label: 'RADIO',
    calm: ['good morning drivers', 'clear skies all day long', 'here is a song for the road', 'traffic is light and sweet'],
    uneasy: ['traffic is light, if you can call it that.', 'this one is for the driver in the van.', 'we are having some static.'],
    wrong: ['This song is for the one in the van. And the one beside them.', 'Please stay tuned. Please stay.', 'Tonight the weather is you.'],
    horror: ['We are still on the air because you are still typing.', 'Driver, we can see you.', 'Do not change the station.'],
  },
};
const LABELS = { story: 'THOUGHT', sign: SOURCES.sign.label, radio: SOURCES.radio.label };
export const getSourceLabel = (source) => LABELS[source] || LABELS.story;

let currentAct = 'calm';
let cursors = {};      // act -> index of the next story line
let warmupLeft = [];   // shuffled warmup words not yet used
let bags = {};         // "source:act" -> shuffled lines not yet used
let sinceExtra = 0;    // story prompts since the last extra-source prompt
let nextExtraAfter = 3;
let lastPrompt = '';

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resetStory() {
  currentAct = 'calm';
  cursors = {};
  bags = {};
  warmupLeft = shuffled(ACTS.calm.warmup);
  sinceExtra = 0;
  nextExtraAfter = 3;
  lastPrompt = '';
}
resetStory();

function randomFiller(act) {
  const pool = act.filler.filter((p) => p !== lastPrompt);
  return pool[Math.floor(Math.random() * pool.length)];
}

function takeFromBag(source) {
  const key = `${source}:${currentAct}`;
  if (!bags[key] || !bags[key].length) bags[key] = shuffled(SOURCES[source][currentAct] || SOURCES[source].calm);
  return bags[key].pop();
}

// Next thing for the player to type -> { text, source }.
// Order: warmup words (calm only), then story lines in order with a sign/radio line mixed in every 3-5 prompts,
// then filler once the act's story is used up.
export function pickPrompt() {
  const act = ACTS[currentAct] || ACTS.calm;
  let text;
  let source = 'story';

  if (currentAct === 'calm' && warmupLeft.length) {
    text = warmupLeft.pop();
  } else if (sinceExtra >= nextExtraAfter) {
    const names = Object.keys(SOURCES);
    source = names[Math.floor(Math.random() * names.length)];
    text = takeFromBag(source);
    sinceExtra = 0;
    nextExtraAfter = 3 + Math.floor(Math.random() * 3);
  } else {
    const i = cursors[currentAct] || 0;
    if (i < act.lines.length) {
      text = act.lines[i];
      cursors[currentAct] = i + 1;
    } else {
      text = randomFiller(act);
    }
    sinceExtra++;
  }
  lastPrompt = text;
  return { text, source };
}

export function setAct(act) {
  if (ACTS[act]) currentAct = act;
}

export function getAct() {
  return currentAct;
}
