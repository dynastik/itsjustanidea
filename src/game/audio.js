// Procedural engine, wind, road/gravel and collision audio using Web Audio API.
// Audio is initialized after the first user gesture because browsers require it.
export function createAudio() {
  let ctx = null;
  let master, engineOsc, mufflerFilter, exhaustResonance, engineGain;
  let intakeFilter, intakeGain, windGain, windFilter, roadGain, roadFilter, noiseBuf;
  let muted = true; // Keep the project's existing default; press the mute toggle to enable audio.
  let audioRpm = 850;

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
    master.gain.value = 0;
    master.connect(ctx.destination);

    // One firing-pulse oscillator, rather than several unrelated buzzy oscillators.
    // A four-cylinder, four-stroke engine produces two firing events per crank revolution.
    engineOsc = ctx.createOscillator();
    const real = new Float32Array([0, 1, 0.58, 0.34, 0.21, 0.13, 0.08, 0.045, 0.025]);
    const imag = new Float32Array([0, 0.16, -0.10, 0.07, -0.045, 0.03, -0.02, 0.012, -0.008]);
    const pulseWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    engineOsc.setPeriodicWave(pulseWave);

    // Low-pass muffler removes the harsh buzzy top end. A gentle peaking filter adds
    // a little exhaust body without turning the whole engine into a resonant whistle.
    mufflerFilter = ctx.createBiquadFilter();
    mufflerFilter.type = 'lowpass';
    mufflerFilter.Q.value = 0.75;
    exhaustResonance = ctx.createBiquadFilter();
    exhaustResonance.type = 'peaking';
    exhaustResonance.Q.value = 1.4;
    exhaustResonance.gain.value = 2.5;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(mufflerFilter);
    mufflerFilter.connect(exhaustResonance);
    exhaustResonance.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    // Shared noise source for intake/valvetrain, wind, road and impact texture.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.Q.value = 0.7;
    intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    loopedNoise().connect(intakeFilter);
    intakeFilter.connect(intakeGain);
    intakeGain.connect(master);

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.55;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    loopedNoise().connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

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

  function update(dt, { speed, throttle, offRoad, paused, gear = '1', rpm: engineRPM = 850 }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.abs(speed);
    const load = clamp(throttle, 0, 1);
    const rev = clamp((engineRPM - 700) / 5800, 0, 1);
    const lugging = gear === '5' && v < 4 && load > 0.05;

    // Smooth RPM from the actual transmission. Let low-gear revs rise faster than a lugging
    // fifth-gear launch, but keep enough movement that the engine audibly struggles.
    const rpmTarget = lugging
      ? Math.min(engineRPM, 1500 + load * 180)
      : engineRPM;
    audioRpm += (rpmTarget - audioRpm) * (1 - Math.exp(-(lugging ? 7 : 5) * dt));

    // Firing-event rate creates the low engine pulse; the custom wave supplies harmonics.
    // A small RPM-dependent detune adds life without frame-by-frame random pitch wobble.
    const firingHz = Math.max(18, (audioRpm / 60) * 2);
    engineOsc.frequency.setTargetAtTime(firingHz, t, 0.045);

    const cutoff = 520 + rev * 2550 + load * 850;
    mufflerFilter.frequency.setTargetAtTime(cutoff, t, 0.055);
    exhaustResonance.frequency.setTargetAtTime(
      clamp(firingHz * 7.5, 180, 850), t, 0.07
    );
    exhaustResonance.gain.setTargetAtTime(1.5 + load * 3 + rev * 1.5, t, 0.07);

    // Intake and valve noise is intentionally quiet; it should add texture, not a vacuum-cleaner whine.
    intakeFilter.frequency.setTargetAtTime(850 + rev * 850 + load * 450, t, 0.08);
    intakeGain.gain.setTargetAtTime(0.003 + load * 0.012 + rev * 0.004, t, 0.08);
    engineGain.gain.setTargetAtTime(
      0.055 + load * 0.035 + rev * 0.025 + (lugging ? 0.012 : 0), t, 0.07
    );

    const vn = clamp(v / 30, 0, 1);
    windGain.gain.setTargetAtTime(0.12 * vn * vn, t, 0.12);
    windFilter.frequency.setTargetAtTime(300 + v * 38, t, 0.12);

    roadGain.gain.setTargetAtTime(clamp(v / 20, 0, 1) * (offRoad ? 0.13 : 0.035), t, 0.12);
    roadFilter.frequency.setTargetAtTime(offRoad ? 1250 : 420, t, 0.12);

    master.gain.setTargetAtTime(paused || muted ? 0 : 0.52, t, 0.06);
  }

  // Collision thump. intensity is approximately m/s of speed lost in one frame.
  function bump(intensity) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const amp = clamp(intensity / 8, 0.15, 1);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(85, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.25);
    g.gain.setValueAtTime(0.45 * amp, t);
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
    nf.frequency.value = 750;
    ng.gain.setValueAtTime(0.28 * amp, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    n.start(t);
    n.stop(t + 0.2);
  }

  return { update, bump, toggleMute: () => { muted = !muted; } };
}
