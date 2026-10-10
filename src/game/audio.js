// Procedural engine, wind, road/gravel and collision audio using Web Audio API.
// Audio is initialized after the first user gesture because browsers require it.
export function createAudio() {
  let ctx = null;
  let master, engineOsc, mufflerFilter, exhaustResonance, engineGain;
  let intakeFilter, intakeGain, windGain, windFilter, roadGain, roadFilter, noiseBuf;
  let muted = false; // Audio is enabled by default; F9 toggles mute.
  let audioRpm = 850;
  let audioClutch = 0;
  let lastGear = null;

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

    // Use a stronger second harmonic so the engine has a recognizable, audible motor tone
    // instead of a nearly inaudible sub-bass rumble at idle.
    engineOsc = ctx.createOscillator();
    const real = new Float32Array([0, 1, 0.30, 0.15, 0.07, 0.035, 0.018]);
    const imag = new Float32Array([0, 0.04, -0.025, 0.015, -0.008, 0.004, -0.002]);
    const pulseWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    engineOsc.setPeriodicWave(pulseWave);

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

  function shiftSound(upshift) {
    if (!ctx || muted || !noiseBuf) return;
    const t = ctx.currentTime;
    // A short, restrained gear-engagement clack, tucked under the engine rather than a cartoon clang.
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noiseBuf;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(upshift ? 1050 : 1450, t);
    filter.Q.value = 1.1;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.075, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + 0.11);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(upshift ? 175 : 235, t);
    o.frequency.exponentialRampToValueAtTime(upshift ? 105 : 145, t + 0.075);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.055, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    o.connect(og);
    og.connect(master);
    o.start(t);
    o.stop(t + 0.095);
  }

  function update(dt, { speed, throttle, offRoad, paused, gear = '1', rpm: engineRPM = 850, clutch = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (lastGear !== null && gear !== lastGear) {
      const order = ['R', 'N', '1', '2', '3', '4', '5'];
      shiftSound(order.indexOf(gear) >= order.indexOf(lastGear));
    }
    lastGear = gear;
    const v = Math.abs(speed);
    const load = clamp(throttle, 0, 1);
    const rev = clamp((engineRPM - 700) / 5800, 0, 1);
    const lugging = ['3', '4', '5'].includes(gear) && v < (gear === '3' ? 5 : 8) && load > 0.05;
    audioClutch += (clamp(clutch, 0, 1) - audioClutch) * (1 - Math.exp(-18 * dt));

    // Follow the vehicle RPM in every gear; don't impose a separate low-RPM audio ceiling while lugging.
    const rpmTarget = engineRPM;
    audioRpm += (rpmTarget - audioRpm) * (1 - Math.exp(-(lugging ? 7 : 5) * dt));

    // Pitch follows RPM only. Gear ratios already change RPM in the vehicle model, so applying
    // another multiplier per gear would make the same engine magically change character on each shift.
    const limiterFlutter = engineRPM > 4900 ? 1 + 0.035 * Math.sin(t * 95) : 1;
    // A lower, more engine-like fundamental with a broad enough range to make each gear audible.
    // The transmission's RPM is the source of truth, so shifts and rev-matched downshifts are heard.
    const rpmNorm = clamp((audioRpm - 700) / (5300 - 700), 0, 1);
    const crankHz = clamp((38 + rpmNorm * 255) * limiterFlutter, 38, 310);
    engineOsc.frequency.setTargetAtTime(crankHz, t, 0.045);

    const cutoff = 650 + rev * 3200 + load * 1450;
    mufflerFilter.frequency.setTargetAtTime(cutoff, t, 0.055);
    exhaustResonance.frequency.setTargetAtTime(
      clamp(crankHz * 2.1, 120, 700), t, 0.07
    );
    exhaustResonance.gain.setTargetAtTime(1 + load * 1.8 + rev * 1.1, t, 0.09);

    intakeFilter.frequency.setTargetAtTime(650 + rev * 500 + load * 250, t, 0.1);
    intakeGain.gain.setTargetAtTime(0.0015 + load * 0.004 + rev * 0.0025, t, 0.1);
    const shiftDucking = 1 - audioClutch * 0.88;
    engineGain.gain.setTargetAtTime(
      (0.25 + load * 0.21 + rev * 0.11 + (lugging ? 0.045 : 0)) * shiftDucking, t, 0.055
    );

    const vn = clamp(v / 30, 0, 1);
    windGain.gain.setTargetAtTime(0.075 * vn * vn, t, 0.12);
    windFilter.frequency.setTargetAtTime(300 + v * 38, t, 0.12);

    roadGain.gain.setTargetAtTime(clamp(v / 20, 0, 1) * (offRoad ? 0.09 : 0.022), t, 0.12);
    roadFilter.frequency.setTargetAtTime(offRoad ? 1250 : 420, t, 0.12);

    master.gain.setTargetAtTime(paused || muted ? 0 : 0.8, t, 0.06);
  }

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
