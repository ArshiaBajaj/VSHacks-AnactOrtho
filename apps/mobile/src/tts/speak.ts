import * as Speech from "expo-speech";

/**
 * Offline TTS wrapper.
 *
 * We use expo-speech (backed by iOS AVSpeechSynthesizer and Android
 * TextToSpeech). Both stacks ship offline voices out of the box on any
 * modern device, satisfying the edge-native offline-first requirement.
 *
 * The wrapper adds:
 *   - a cooldown so events emitted milliseconds apart don't overlap
 *   - deduplication of identical phrases within a short window
 *   - a `stop()` primitive that flushes the current queue
 */

let cooldownUntil = 0;
let lastPhrase = "";
let currentUtteranceStartedAt = 0;

const DEFAULT_OPTIONS: Speech.SpeechOptions = {
  language: "en-US",
  pitch: 1.0,
  rate: 1.02,
  volume: 1,
};

export type SpeakOptions = Partial<Speech.SpeechOptions> & {
  /** If true, cancels any currently-speaking phrase and speaks this one now. */
  force?: boolean;
};

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!text) return;
  const now = Date.now();

  if (!options.force) {
    if (now < cooldownUntil) return;
    if (text === lastPhrase && now - currentUtteranceStartedAt < 4500) return;
  } else {
    Speech.stop();
  }

  lastPhrase = text;
  currentUtteranceStartedAt = now;
  const approxDurationMs = Math.min(4200, Math.max(700, text.length * 60));
  cooldownUntil = now + approxDurationMs;

  Speech.speak(text, {
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
  lastPhrase = "";
  cooldownUntil = 0;
}
