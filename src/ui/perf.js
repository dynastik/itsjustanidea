// Always-on frame-time meter (top centre). Pass renderer.info for draw calls / triangles (see apply-patches.mjs, render.js).
export function createPerf(info) {
  const el = document.createElement('div');
  el.id = 'perf';
  el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:12;padding:6px 12px;border:1px solid rgba(225,229,222,.2);border-radius:5px;background:rgba(8,12,16,.72);font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;text-align:center;white-space:pre;pointer-events:none;text-shadow:0 1px 5px #000';
  const big = document.createElement('div');
  big.style.cssText = 'font-size:22px;font-weight:700;letter-spacing:1px';
  const small = document.createElement('div');
  small.style.cssText = 'color:#b6bbb5';
  el.append(big, small);
  let shown = !!import.meta.env?.DEV || new URLSearchParams(window.location.search).has('perf');
  const applyShown = () => { el.style.display = shown ? '' : 'none'; };
  applyShown();
  window.addEventListener('keydown', (e) => { if (e.key === 'F10') { e.preventDefault(); shown = !shown; applyShown(); } });
  document.body.appendChild(el);
  big.textContent = '-- FPS';
  let acc = 0, frames = 0, worst = 0;
  return {
    update(dt) {
      if (!shown) return;
      if (dt <= 0) return;
      acc += dt; frames++; worst = Math.max(worst, dt);
      if (acc < 0.5) return;
      const fps = frames / acc;
      big.textContent = `${Math.round(fps)} FPS`;
      big.style.color = fps >= 55 ? '#a9d99b' : fps >= 40 ? '#e7c46c' : '#f0877d';
      const r = info?.render;
      small.textContent = `${(acc / frames * 1000).toFixed(1)} ms avg  |  ${(worst * 1000).toFixed(0)} ms worst` +
        (r ? `\n${r.calls} calls  |  ${(r.triangles / 1000).toFixed(0)}k tris` : '');
      acc = 0; frames = 0; worst = 0;
    },
  };
}
