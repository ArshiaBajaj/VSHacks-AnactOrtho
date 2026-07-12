import { Audio } from "expo-av";
import type { AVPlaybackSource } from "expo-av";

/**
 * Referee whistle & score-cue audio.
 *
 * We ship two short WAV files bundled inside `assets/audio/`. Files are loaded
 * once, cached, and played through the phone's speaker via expo-av's low-
 * latency path. Total memory footprint per clip is tiny (<40 kB), and we
 * pre-warm them at app start so the first whistle after a boundary crossing
 * is truly instantaneous.
 *
 * Sound assets deliberately live *inside the app bundle*, not fetched at
 * runtime, so this pipeline works fully offline in park settings without
 * cellular service — matching the Master Blueprint's edge-native mandate.
 */

let whistleSound: Audio.Sound | null = null;
let scoreSound: Audio.Sound | null = null;
let crowdSound: Audio.Sound | null = null;
let ready = false;

// Bundled synthesized cues (see `assets/audio/gen_audio.py`) — swap these
// require()s for real recordings any time without touching call sites.
const SOURCES: Record<"whistle" | "score" | "crowd", AVPlaybackSource | null> = {
  whistle: require("../../assets/audio/whistle.wav") as AVPlaybackSource,
  score: require("../../assets/audio/score.wav") as AVPlaybackSource,
  crowd: require("../../assets/audio/crowd.wav") as AVPlaybackSource,
};

/**
 * One-time preload. Call this at app boot (e.g. from `_layout.tsx`).
 * If any of the assets are missing, the corresponding cue is silently
 * skipped — the app still runs.
 */
export async function warmupAudio(): Promise<void> {
  if (ready) return;
  ready = true;

  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
    allowsRecordingIOS: false,
  });

  if (SOURCES.whistle) {
    const { sound } = await Audio.Sound.createAsync(SOURCES.whistle, {
      volume: 1,
      shouldPlay: false,
    });
    whistleSound = sound;
  }
  if (SOURCES.score) {
    const { sound } = await Audio.Sound.createAsync(SOURCES.score, {
      volume: 0.7,
      shouldPlay: false,
    });
    scoreSound = sound;
  }
  if (SOURCES.crowd) {
    const { sound } = await Audio.Sound.createAsync(SOURCES.crowd, {
      volume: 0.5,
      shouldPlay: false,
    });
    crowdSound = sound;
  }
}

export async function playWhistle(): Promise<void> {
  if (!whistleSound) return;
  try {
    await whistleSound.setPositionAsync(0);
    await whistleSound.playAsync();
  } catch {
    // ignore — this is a best-effort audio cue
  }
}

export async function playScoreCue(): Promise<void> {
  if (!scoreSound) return;
  try {
    await scoreSound.setPositionAsync(0);
    await scoreSound.playAsync();
  } catch {}
}

export async function playCrowdShimmer(): Promise<void> {
  if (!crowdSound) return;
  try {
    await crowdSound.setPositionAsync(0);
    await crowdSound.playAsync();
  } catch {}
}

export async function unloadAudio(): Promise<void> {
  await Promise.all(
    [whistleSound, scoreSound, crowdSound].map(async (s) => {
      if (s) await s.unloadAsync().catch(() => undefined);
    }),
  );
  whistleSound = null;
  scoreSound = null;
  crowdSound = null;
  ready = false;
}
