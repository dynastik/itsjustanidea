// The story IS the typing. The player types a short novel, paragraph by paragraph, as Elias's last delivery
// goes wrong. Each paragraph belongs to an act, and the act drives the whole world: the sky clock, the
// horror director, the wording on screen. Nothing here is timed: the story moves as fast as you type.
//
//   calm   - bright day, ordinary         (clock 0.00 -> 0.10: morning)
//   uneasy - the repeating road           (0.10 -> 0.40: afternoon to sunset)
//   wrong  - signs, messages, dusk        (0.40 -> 0.66: sunset to night)
//   horror - the road explains itself     (0.66 -> 0.76: deep night)
//   finale - the false sunrise, delivery  (0.76 -> 0.93: sunrise that ends nothing)
//
// Writing rules: ASCII only (straight quotes), never a backtick (debug hotkey), never describe the road's
// nature until the horror act, and keep it deniable for as long as possible.
// 'message' paragraphs are the road speaking: short, shown differently, always addressed to the player.

const P = (act, text, kind = 'narration') => ({ act, kind, text });

const PARAGRAPHS = [
  // ---- calm ----
  P('calm', "Elias was a delivery driver finishing his last shift of the day."),
  P('calm', "One package remained in the back of his van. The address on its label meant nothing to him, but he had a job to finish, so he followed the road that would supposedly take him there."),
  P('calm', "At first, everything was ordinary. The countryside stretched beneath a clear sky, and the road wound gently through quiet hills. He rolled the window down and let the radio hum."),

  // ---- uneasy ----
  P('uneasy', "Then he passed a sign he was certain he had seen before."),
  P('uneasy', "A few minutes later, he passed it again. The same hills appeared in the same order, and the same mile marker stood beside the road."),
  P('uneasy', "Elias told himself he was tired. Everyone repeats a stretch of road in their head when the day has been long. He turned the radio up and kept driving."),

  // ---- wrong ----
  P('wrong', "But as the hours passed, the road grew stranger. Signs pointed toward towns that didn't exist. The landscape seemed to change whenever he looked away."),
  P('wrong', "Then the messages began, describing things he had never told anyone."),
  P('wrong', "You have been here before.", 'message'),
  P('wrong', "You are not getting closer.", 'message'),
  P('wrong', "The road knows your name.", 'message'),

  // ---- horror ----
  P('horror', "Elias began to understand that he wasn't lost in any normal sense. The road itself was impossible. It had no reliable beginning or end, and no matter how far he drove, he never reached another place."),
  P('horror', "Stories of such roads had existed for centuries. Travelers spoke of highways that appeared out of nowhere, journeys that lasted impossibly long, and people who vanished without a trace. Most people dismissed them as superstition."),
  P('horror', "They were wrong."),
  P('horror', "The road existed somewhere between destinations, outside the ordinary rules of geography and time. It had never been built. But over the centuries it had learned from everyone who traveled it. It remembered their landscapes, their expectations, and the things that made a journey feel real."),
  P('horror', "It learned to imitate the world without understanding it. It could create the appearance of an exit without providing a way out. It could reproduce a sunrise without ending the night."),
  P('horror', "And it had been collecting travelers all along."),
  P('horror', "Elias's package was part of that. The road had given his journey a purpose so he would keep moving, even when everything around him became impossible. The package was never meant for a person. It was meant for the road."),

  // ---- finale ----
  P('finale', "Destination reached.", 'message'),
  P('finale', "Recipient identified.", 'message'),
  P('finale', "Thank you for bringing yourself.", 'message'),
  P('finale', "The sky brightened. A beautiful sunrise spread across the hills, and the road ahead looked peaceful again. For a moment, Elias believed he had escaped."),
  P('finale', "Delivery accepted.", 'message'),
  // after this the screen fades to black, then: "Next driver, please." (ui/ending.js) and the loop restarts
];

// Where the world clock (daycycle.js) sits while each act is being typed: it moves smoothly from the first
// number to the second as the act's characters are typed, so the sky follows your typing, not a timer.
const ACT_TIME = {
  calm: [0.0, 0.10],
  uneasy: [0.10, 0.40],
  wrong: [0.40, 0.66],
  horror: [0.66, 0.76],
  finale: [0.76, 0.93],
};

const LABELS = { narration: 'THE STORY', message: 'THE ROAD' };
export const getSourceLabel = (source) => LABELS[source] || LABELS.narration;

const offsets = [];
const actInfo = {};
let totalChars = 0;
PARAGRAPHS.forEach((p) => {
  offsets.push(totalChars);
  if (!actInfo[p.act]) actInfo[p.act] = { first: totalChars, len: 0 };
  actInfo[p.act].len += p.text.length;
  totalChars += p.text.length;
});
export const STORY_LENGTH_CHARS = totalChars;

let cursor = 0;        // paragraphs handed out so far (the one being typed is cursor - 1)
let finished = false;
let currentAct = 'calm';

export function resetStory() {
  cursor = 0;
  finished = false;
  currentAct = 'calm';
}

// Next paragraph -> { text, source, act }, or null once the story is over.
export function pickPrompt() {
  if (cursor >= PARAGRAPHS.length) {
    finished = true;
    return null;
  }
  const p = PARAGRAPHS[cursor++];
  currentAct = p.act;
  return { text: p.text, source: p.kind, act: p.act };
}

export function getAct() {
  return currentAct;
}

export function isStoryFinished() {
  return finished;
}

// World clock target (0..1) for the current point in the story. bufferLen = characters typed in the current paragraph.
export function getStoryTime(bufferLen = 0) {
  if (finished) return ACT_TIME.finale[1];
  const i = Math.max(cursor - 1, 0);
  const p = PARAGRAPHS[i];
  const info = actInfo[p.act];
  const typed = offsets[i] - info.first + (cursor > 0 ? bufferLen : 0);
  const f = Math.min(1, Math.max(0, typed / info.len));
  const [a, b] = ACT_TIME[p.act];
  return a + (b - a) * f;
}

// Dev: jump to the first paragraph of the next act (the caller then picks the next prompt).
export function skipToNextAct() {
  const cur = PARAGRAPHS[Math.max(cursor - 1, 0)].act;
  let i = cursor;
  while (i < PARAGRAPHS.length && PARAGRAPHS[i].act === cur) i++;
  cursor = i;
}
