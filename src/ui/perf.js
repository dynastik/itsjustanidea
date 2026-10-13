// Debug-only frame-time readout (toggle with the ` key). Roadmap: measure before and after expensive changes on the baseline laptop.
// Pass renderer.info for draw calls / triangles (see the one-line render.js change).
import { state } from '../game/state.js';

export function createPerf(info) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:56px;right:20px;z-index:12;display:none;padding:6px 9px;border:1px solid rgba(225,229,222,.18);border-radius:4px;background:rgba(8,12,16,.7);color:#b8c9a9;font:10px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  let acc = 0, frames = 0, worst = 0;
  return {
    update(dt) {
      if (!state.debug) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      if (dt <= 0) return;
      acc += dt; frames++; worst = Math.max(worst, dt);
      if (acc < 0.5) return;
      const r = info?.render;
      el.style.display = 'block';
      el.textContent = `${(frames / acc).toFixed(0)} fps  avg ${(acc / frames * 1000).toFixed(1)} ms  worst ${(worst * 1000).toFixed(0)} ms` +
        (r ? `\ncalls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k` : '');
      acc = 0; frames = 0; worst = 0;
    },
  };
}
