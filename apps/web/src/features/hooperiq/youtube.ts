/** YouTube IFrame API loader — shared with Film Room's global callback chain. */

export type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

function ytReady(): boolean {
  const YT = (window as unknown as { YT?: { Player?: unknown } }).YT;
  return Boolean(YT?.Player);
}

let ytApiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (ytReady()) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const done = () => resolve();

    try {
      const w = window as unknown as { onYouTubeIframeAPIReady?: () => void };
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        try {
          prev?.();
        } catch {
          /* ignore */
        }
        done();
      };

      const existing = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      if (!existing) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        document.head.appendChild(tag);
      } else if (ytReady()) {
        done();
      }

      // Poll — covers "script already loaded, callback already fired"
      let n = 0;
      const id = window.setInterval(() => {
        n += 1;
        if (ytReady() || n > 40) {
          window.clearInterval(id);
          done();
        }
      }, 125);
    } catch {
      done();
    }
  });

  return ytApiPromise;
}
