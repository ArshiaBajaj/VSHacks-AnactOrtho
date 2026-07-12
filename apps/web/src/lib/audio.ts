let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Sharp, short referee whistle synthesized on the fly. */
export function playWhistle(kind: "short" | "long" = "short"): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const dur = kind === "short" ? 0.18 : 0.42;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  filter.Q.value = 8;
  osc.type = "square";
  osc.frequency.setValueAtTime(2600, now);
  osc.frequency.linearRampToValueAtTime(3200, now + dur * 0.4);
  osc.frequency.linearRampToValueAtTime(2900, now + dur);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
  gain.gain.linearRampToValueAtTime(0.28, now + dur - 0.05);
  gain.gain.linearRampToValueAtTime(0, now + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Warm confirmation blip for a score. */
export function playScoreBlip(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const notes = [660, 880, 1174];
  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, now + i * 0.06);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.06 + 0.02);
    g.gain.linearRampToValueAtTime(0, now + i * 0.06 + 0.18);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(now + i * 0.06);
    osc.stop(now + i * 0.06 + 0.22);
  });
}

/** Cheer / crowd shimmer for streaks & big moments. */
export function playCrowdShimmer(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const bufferSize = ac.sampleRate * 0.9;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.35;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = 0.35;
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(now);
}

type SpeakOptions = { rate?: number; pitch?: number; volume?: number; voice?: string };

let speechCooldown = 0;
let lastPhrase = "";

/**
 * Speaks a phrase using the Web Speech API. Rate-limited to prevent overlap and
 * dedupes identical phrases within a short window.
 */
export function speak(text: string, options: SpeakOptions = {}): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const now = performance.now();
  if (now < speechCooldown) return;
  if (text === lastPhrase && now - speechCooldown < 4500) return;
  lastPhrase = text;
  speechCooldown = now + Math.min(text.length * 60 + 700, 4200);

  const u = new SpeechSynthesisUtterance(text);
  u.rate = options.rate ?? 1.05;
  u.pitch = options.pitch ?? 1;
  u.volume = options.volume ?? 1;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const preferred =
      voices.find((v) => /en-?us/i.test(v.lang) && /google|natural|neural/i.test(v.name)) ??
      voices.find((v) => /en-?us/i.test(v.lang)) ??
      voices.find((v) => /^en/i.test(v.lang)) ??
      voices[0];
    if (preferred) u.voice = preferred;
  }
  window.speechSynthesis.speak(u);
}

/** Pre-warm voices so the first call speaks immediately. */
export function primeSpeechEngine(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  lastPhrase = "";
  speechCooldown = 0;
}
