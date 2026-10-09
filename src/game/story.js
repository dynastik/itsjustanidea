// Short Mode: Elias's final delivery, told paragraph by paragraph through the typing system.
// The story begins as a calm countryside drive, then lets the world contradict the narration.
// Keep the road's nature unexplained until the horror act; the player should infer more than the text says.

const P = (act, text, kind = 'narration') => ({ act, kind, text });

const PARAGRAPHS = [
  // ACT I: The Last Delivery. Warm afternoon, ordinary life.
  P('calm', "The afternoon sun rested over a quiet stretch of countryside. Green fields rolled toward distant hills, and clouds drifted lazily across the sky."),
  P('calm', "Elias had one delivery left. It had been an uneventful day, which was exactly how he liked his working days. No traffic jams, no angry customers, no packages sent to the wrong address."),
  P('calm', "He had already decided what he would have for dinner. He would leave his work boots by the door, open a window, and watch the sunset from his living room."),
  P('calm', "One more delivery, and the day was his."),
  P('calm', "The road curved gently between the fields. A wooden sign pointed toward a nearby town, and a farmhouse stood beyond a line of trees. Somewhere in the distance, smoke rose from a chimney."),
  P('calm', "For a while, the world was exactly as it should be."),

  // ACT II: A Long, Pleasant Drive. Let the player trust the road.
  P('uneasy', "The fields gradually gave way to low stone walls and scattered houses. Sunlight caught the windows of passing farmhouses, turning them gold."),
  P('uneasy', "Elias passed a small roadside shop with flower boxes beneath its windows. A handwritten sign outside advertised fresh bread."),
  P('uneasy', "He wondered whether he should have stopped to buy something for dinner. Then he remembered that he had already decided what to eat, and laughed quietly at himself."),
  P('uneasy', "The road climbed a gentle hill before descending into a wide valley. From the top, he could see miles of countryside, dotted with cottages and narrow lanes."),
  P('uneasy', "There was something lovely about having somewhere to return to."),

  // ACT III: The Wrong Way. The first physical contradiction is a repeated sign.
  P('wrong', "The sun had begun to sink toward the hills when Elias saw a sign beside the road."),
  P('wrong', "WELCOME TO BELLWEATHER.", 'message'),
  P('wrong', "He didn't recognize the name, but that wasn't surprising. He had taken unfamiliar roads before. A smaller sign beneath it gave the distance to the town: twelve miles."),
  P('wrong', "The road bent around a wooded hill, passed open farmland, and descended into a shallow valley."),
  P('wrong', "WELCOME TO BELLWEATHER.", 'message'),
  P('wrong', "Elias frowned. The lettering was different, and the sign looked newer than the first. But the name was unmistakable."),
  P('wrong', "He checked the road behind him in the mirror. There had been no turn. No junction. No reason he could think of to have circled back."),
  P('wrong', "A few minutes later, he passed a roadside milestone."),
  P('wrong', "TWELVE MILES TO BELLWEATHER.", 'message'),
  P('wrong', "The road ahead remained empty. The countryside was quiet, the sky peaceful, and the last sunlight lay across the fields like a blanket."),
  P('wrong', "Nothing looked wrong. That was what bothered him."),
  P('wrong', "Elias looked down at the delivery label again. The destination was unfamiliar now in a way he couldn't explain. He had read it several times that afternoon. He was certain of that."),
  P('wrong', "He simply couldn't remember the name. The sun touched the horizon, and the destination remained twelve miles away."),

  // ACT IV: A Place Between Places. The road begins speaking.
  P('wrong', "Elias pulled onto the shoulder and stopped. For the first time that day, he wasn't sure what to do next."),
  P('wrong', "There was no signal, and no other cars passed. The sunset was beautiful. For a moment, he felt embarrassed by his own fear."),
  P('wrong', "It was just a road. Roads could be confusing. Signs could be wrong. People got tired."),
  P('wrong', "YOU ARE MAKING GOOD PROGRESS.", 'message'),
  P('wrong', "The words weren't on a road sign or printed on the package. They appeared where the story of his journey should have been, calm and matter-of-fact."),
  P('wrong', "YOUR DESTINATION IS STILL AHEAD.", 'message'),
  P('wrong', "The road emerged from the trees into open countryside. There were no houses now, no farm tracks, no distant town lights. Only the highway and the dark fields beyond it."),
  P('wrong', "YOU HAVE BEEN HERE BEFORE.", 'message'),
  P('wrong', "Elias shook his head. He had never been here before. He was certain of it."),
  P('wrong', "YOU WERE ALWAYS GOING TO COME HERE.", 'message'),
  P('wrong', "He tried to remember who had handed him the package at the depot. He couldn't. He tried to remember what it contained. He couldn't remember that, either."),
  P('wrong', "THE DELIVERY MUST BE COMPLETED.", 'message'),
  P('wrong', "For the first time, Elias understood that the road wasn't simply leading him somewhere unfamiliar. It was keeping him from going anywhere else."),

  // ACT V: The Road Remembers. A partial explanation, never a full lore dump.
  P('horror', "The road had no exit. Elias drove until fields gave way to hills, hills to forests, and forests to landscapes he couldn't have named. The world changed around him, but the highway remained."),
  P('horror', "He passed places that felt almost familiar: a little town beneath a church steeple, a stone bridge over a dry riverbed, a row of houses with warm windows. None of them led anywhere."),
  P('horror', "The road wasn't a road in the ordinary sense. It was a journey without a proper beginning or end, a place between destinations. It borrowed the shapes of the world because that was all it knew how to do."),
  P('horror', "Fields. Houses. Towns. Sunsets. It could imitate the things a traveler expected to find along the way, but it couldn't understand why those things mattered."),
  P('horror', "A house was just walls and windows. A town was just buildings beside a road. A sunset was just light disappearing beyond the horizon. And home was just another destination printed on a label."),
  P('horror', "The package had never been intended for an ordinary recipient. The road had given Elias a delivery because a journey needed a purpose. A destination gave a traveler a reason to keep moving."),
  P('horror', "YOU HAVE FOLLOWED EVERY DIRECTION.", 'message'),
  P('horror', "YOU HAVE COMPLETED EVERY MILE.", 'message'),
  P('horror', "YOU HAVE REACHED THE END OF THE ROAD.", 'message'),
  P('horror', "DELIVERY RECIPIENT: IDENTIFIED.", 'message'),
  P('horror', "The road had not been taking him to a place. It had been taking him to the end of the journey itself. The package was the reason he had been allowed to keep going."),

  // ACT VI: The Last Sunset. A beautiful, deliberately false peace.
  P('finale', "The sky began to brighten. A pale line of gold spread across the hills, and the road straightened. The fields returned, green and peaceful beneath the morning light."),
  P('finale', "For the first time in what felt like an eternity, Elias could breathe. Perhaps it was over. Perhaps there had been an explanation all along."),
  P('finale', "DELIVERY ACCEPTED.", 'message'),
  P('finale', "Elias thought about his living room, his work boots by the door, and the simple dinner he had planned to eat. He wondered whether he would ever see any of those things again."),
  P('finale', "The fields glowed gold, and the road ahead looked warm and inviting. For one brief moment, Elias believed he was going home."),
  P('finale', "THANK YOU FOR BRINGING YOURSELF.", 'message'),
  P('finale', "The road continued toward the horizon, smooth and empty beneath the beautiful sky. Elias didn't know whether the journey had ended. He only knew that, for the first time since the afternoon began, he no longer felt afraid."),
  // ui/ending.js fades to black and displays: "Next driver, please."
];

const ACT_TIME = {
  calm: [0.0, 0.10],
  uneasy: [0.10, 0.30],
  wrong: [0.30, 0.66],
  horror: [0.66, 0.82],
  finale: [0.82, 0.98],
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

let cursor = 0;
let finished = false;
let currentAct = 'calm';

export function resetStory() {
  cursor = 0;
  finished = false;
  currentAct = 'calm';
}

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

export function skipToNextAct() {
  const cur = PARAGRAPHS[Math.max(cursor - 1, 0)].act;
  let i = cursor;
  while (i < PARAGRAPHS.length && PARAGRAPHS[i].act === cur) i++;
  cursor = i;
}
