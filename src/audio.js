// Synthesized audio, no downloads: engine (gear-based RPM), wind, road/gravel noise, impact thumps.
// Browsers block audio until a user gesture, so everything is created on the first key/click.
export function createAudio() {
  let ctx = null;
  let master, engOsc1, engOsc2, engFilter, engGain, noiseBuf;
  let windGain, windFilter, roadGain, roadFilter;
  let muted = true;//for now coz i dont want to play it rn
  let rpm = 0.2;

  const GEARS = [7, 13, 20, 30]; // upper speed of each gear (m/s)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function loopedNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    // engine
    engOsc1 = ctx.createOscillator();
    engOsc1.type = 'sawtooth';
    engOsc2 = ctx.createOscillator();
    engOsc2.type = 'square';
    engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.Q.value = 2;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc1.connect(engFilter);
    engOsc2.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(master);
    engOsc1.start();
    engOsc2.start();

    // shared white-noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // wind
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    loopedNoise().connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

    // road / gravel
    roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'lowpass';
    roadGain = ctx.createGain();
    roadGain.gain.value = 0;
    loopedNoise().connect(roadFilter);
    roadFilter.connect(roadGain);
    roadGain.connect(master);
  }

  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  function update(dt, { speed, throttle, offRoad, paused }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.abs(speed);

    // fake gearbox: rpm climbs within a gear, drops on the shift
    let lo = 0, hi = GEARS[0];
    for (let i = 0; i < GEARS.length; i++) {
      hi = GEARS[i];
      if (v < hi) break;
      lo = hi;
    }
    const target = 0.18 + 0.82 * clamp((v - lo) / (hi - lo), 0, 1);
    rpm += (target - rpm) * (1 - Math.exp(-6 * dt));

    const load = Math.max(throttle, 0);
    const f = 38 + rpm * 95;
    engOsc1.frequency.setTargetAtTime(f, t, 0.05);
    engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    engFilter.frequency.setTargetAtTime(250 + rpm * 900 + load * 400, t, 0.05);
    engGain.gain.setTargetAtTime(0.05 + 0.06 * load + 0.03 * rpm, t, 0.08);

    const vn = clamp(v / 30, 0, 1);
    windGain.gain.setTargetAtTime(0.16 * vn * vn, t, 0.1);
    windFilter.frequency.setTargetAtTime(300 + v * 40, t, 0.1);

    roadGain.gain.setTargetAtTime(clamp(v / 20, 0, 1) * (offRoad ? 0.16 : 0.05), t, 0.1);
    roadFilter.frequency.setTargetAtTime(offRoad ? 1400 : 500, t, 0.1);

    master.gain.setTargetAtTime(paused || muted ? 0 : 0.6, t, 0.05);
  }

  // Collision thump. intensity ~ m/s of speed lost in one frame.
  function bump(intensity) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const amp = clamp(intensity / 8, 0.15, 1);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    g.gain.setValueAtTime(0.7 * amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.35);

    const n = ctx.createBufferSource();
    const nf = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    n.buffer = noiseBuf;
    nf.type = 'lowpass';
    nf.frequency.value = 900;
    ng.gain.setValueAtTime(0.5 * amp, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    n.start(t);
    n.stop(t + 0.2);
  }

  return { update, bump, toggleMute: () => { muted = !muted; } };
}