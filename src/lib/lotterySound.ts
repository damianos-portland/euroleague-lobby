// Synthesized lottery SFX via Web Audio — no asset files, fully self-contained.
// A tremolo'd noise "drumroll" while the drum spins, and a bell "ding" on pop.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

// live drumroll nodes (null when not rolling)
let roll: { src: AudioBufferSourceNode; lfo: OscillatorNode; env: GainNode } | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    // 1s of white noise, reused for the roll
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise = buf;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Resume the context on a real user gesture (browser autoplay policy).
export function unlockSound(): void {
  getCtx();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
  if (m) stopDrumroll();
}

export function startDrumroll(): void {
  if (muted) return;
  const c = getCtx();
  if (!c || !noise || !master || roll) return;

  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1900;
  filter.Q.value = 0.8;

  // tremolo: LFO drives a gain to give the "rrrr" roll texture
  const mod = c.createGain();
  mod.gain.value = 0.5; // center; LFO swings this ±0.5 → 0..1
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 28;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(mod.gain);

  const env = c.createGain(); // fade in/out
  const t = c.currentTime;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.2, t + 0.12);

  src.connect(filter);
  filter.connect(mod);
  mod.connect(env);
  env.connect(master);

  src.start();
  lfo.start();
  roll = { src, lfo, env };
}

export function stopDrumroll(): void {
  if (!roll || !ctx) return;
  const { src, lfo, env } = roll;
  roll = null;
  const t = ctx.currentTime;
  env.gain.cancelScheduledValues(t);
  env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  try {
    src.stop(t + 0.2);
    lfo.stop(t + 0.2);
  } catch {
    /* already stopped */
  }
}

// A short bell — a few sine partials with fast attack + exponential decay.
export function ding(): void {
  if (muted) return;
  const c = getCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(master);
  const partials = [
    { f: 1046, g: 0.5 }, // C6
    { f: 1568, g: 0.26 }, // G6
    { f: 2093, g: 0.12 }, // C7
  ];
  for (const p of partials) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = p.f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p.g, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 1.0);
  }
}
