// Story modes: short follows typing; long follows a repeating day/night cycle.
import { state } from './state.js';
import { SHORT, LONG as LONG_TEXT, ENDING_LINE } from './storyText.js';
export { ENDING_LINE };
const KEY='itsjustanidea.storyMode', clamp01=(v)=>Math.min(1,Math.max(0,v));
const ACT_TIME={calm:[0,.10],uneasy:[.10,.40],wrong:[.40,.66],horror:[.66,.76],finale:[.76,.93]};
function index(list){const offsets=[],acts={};let total=0;list.forEach(p=>{offsets.push(total);if(!acts[p.act])acts[p.act]={first:total,len:0};acts[p.act].len+=p.text.length;total+=p.text.length;});return{offsets,acts,total};}
const si=index(SHORT),li=index(LONG_TEXT);
const LONG=LONG_TEXT.map((p,i)=>{const inf=li.acts[p.act],f=clamp01((li.offsets[i]-inf.first)/Math.max(1,inf.len)),[a,b]=ACT_TIME[p.act]||ACT_TIME.calm;return{...p,day:0,at:a+(b-a)*f};});
const FILLER={calm:["The road was easy and the sky was kind.","He tapped the wheel in time with the radio.","A hawk turned slow circles over the hills."],uneasy:["He counted the fence posts. He lost count. He started again.","The same hills, he thought, or hills like them.","The radio hummed in the gaps between the songs."],wrong:["Something shifted on the passenger seat, and the van did not seem to mind.","The headlights found a sign. The sign found him.","He kept his eyes on the road and his thoughts on nothing."],horror:["Keep driving. Keep driving. Keep driving.","The road was patient, and it was listening.","He was no longer sure the hands on the wheel were his."],finale:["The light came up slow, and kind, and wrong."]};
const MOOD=[{morning:"calm",day:"uneasy",dusk:"wrong",night:"horror",dawn:"finale"},{morning:"calm",day:"uneasy",dusk:"wrong",night:"horror",dawn:"uneasy"},{morning:"uneasy",day:"uneasy",dusk:"wrong",night:"horror",dawn:"finale"}];
const partOf=c=>c<.12?"morning":c<.46?"day":c<.64?"dusk":c<.86?"night":"dawn";
const moodAct=()=>MOOD[Math.min(state.dayIndex||0,MOOD.length-1)][partOf(state.worldTime)];
const LABELS={narration:"THE STORY",message:"THE ROAD",sign:"ROAD SIGN"};
export const getSourceLabel=s=>LABELS[s]||LABELS.narration;
export const isCaseInsensitive=()=>true;
let mode="short";try{const q=new URLSearchParams(window.location.search).get("mode"),saved=q||window.localStorage.getItem(KEY);if(saved==="short"||saved==="long")mode=saved;}catch{}
let cursor=0,finished=false,currentAct="calm",lastFiller="";
export const getStoryMode=()=>mode;
export function setStoryMode(m){if(m!=="short"&&m!=="long")return;mode=m;try{window.localStorage.setItem(KEY,m);}catch{}resetStory();}
export const getStoryLengthChars=()=>mode==="long"?li.total:si.total;
export function resetStory(){cursor=0;finished=false;currentAct="calm";lastFiller="";}
export function pickPrompt(){
 if(mode==="long"){if(cursor>=LONG.length){finished=true;return null;}const it=LONG[cursor],act=moodAct(),day=state.dayIndex||0,ready=day>it.day||(day===it.day&&state.worldTime>=it.at);if(ready){cursor++;currentAct=it.act;return{text:it.text,source:it.kind||"narration",act};}const pool=(FILLER[act]||FILLER.calm).filter(t=>t!==lastFiller);lastFiller=pool[Math.floor(Math.random()*pool.length)]||FILLER.calm[0];currentAct=act;return{text:lastFiller,source:"narration",act,filler:true};}
 if(cursor>=SHORT.length){finished=true;return null;}const p=SHORT[cursor++];currentAct=p.act;return{text:p.text,source:p.kind||"narration",act:p.act};
}
export function getAct(){return mode==="long"?moodAct():currentAct;}
export function isStoryFinished(){return finished;}
export function getStoryTime(bufferLen=0){if(finished)return ACT_TIME.finale[1];const i=Math.max(cursor-1,0),p=SHORT[i];if(!p)return 0;const inf=si.acts[p.act],typed=si.offsets[i]-inf.first+(cursor>0?bufferLen:0),[a,b]=ACT_TIME[p.act]||ACT_TIME.calm;return a+(b-a)*clamp01(typed/Math.max(1,inf.len));}
export function skipToNextAct(){const cur=(SHORT[Math.max(cursor-1,0)]||SHORT[0]).act;let i=cursor;while(i<SHORT.length&&SHORT[i].act===cur)i++;cursor=i;}
