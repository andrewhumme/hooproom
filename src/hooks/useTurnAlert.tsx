import { useEffect, useRef } from "react";

/**
 * Alerts the drafter when it becomes their turn:
 * - Prepends "🔔 Your pick! —" to <title> while tab is hidden
 * - Paints a red dot on the favicon
 * - Plays a short chime (WebAudio, no asset needed)
 *
 * Everything is reverted when the turn ends or the tab regains focus.
 */
export function useTurnAlert(isMyTurn: boolean, enabled = true) {
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<string | null>(null);
  const playedForTurnRef = useRef(false);

  // Sound: fire once per turn transition to my turn.
  useEffect(() => {
    if (!enabled) return;
    if (!isMyTurn) {
      playedForTurnRef.current = false;
      return;
    }
    if (playedForTurnRef.current) return;
    playedForTurnRef.current = true;
    playChime();
  }, [isMyTurn, enabled]);

  // Title + favicon badge while it's my turn.
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    if (!isMyTurn) {
      restoreTitle(originalTitleRef);
      restoreFavicon(originalFaviconRef);
      return;
    }

    const applyBadge = () => {
      if (document.hidden) {
        setBadgedTitle(originalTitleRef);
      } else {
        restoreTitle(originalTitleRef);
      }
    };

    setBadgedFavicon(originalFaviconRef);
    applyBadge();

    document.addEventListener("visibilitychange", applyBadge);
    return () => {
      document.removeEventListener("visibilitychange", applyBadge);
      restoreTitle(originalTitleRef);
      restoreFavicon(originalFaviconRef);
    };
  }, [isMyTurn, enabled]);
}

function setBadgedTitle(ref: React.MutableRefObject<string | null>) {
  if (ref.current == null) ref.current = document.title;
  const base = ref.current;
  const badged = `🔔 Your pick! — ${base}`;
  if (document.title !== badged) document.title = badged;
}

function restoreTitle(ref: React.MutableRefObject<string | null>) {
  if (ref.current != null) {
    document.title = ref.current;
    ref.current = null;
  }
}

function setBadgedFavicon(ref: React.MutableRefObject<string | null>) {
  const link = getOrCreateFaviconLink();
  if (!link) return;
  if (ref.current == null) ref.current = link.href;
  const dataUrl = buildDottedFavicon();
  if (dataUrl) link.href = dataUrl;
}

function restoreFavicon(ref: React.MutableRefObject<string | null>) {
  if (ref.current == null) return;
  const link = getOrCreateFaviconLink();
  if (link) link.href = ref.current;
  ref.current = null;
}

function getOrCreateFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

function buildDottedFavicon(): string | null {
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Base HoopRoom-style badge
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("H", size / 2, size / 2 + 2);
    // Red notification dot
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(size - 14, 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

let audioCtx: AudioContext | null = null;
function playChime() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    // Two-tone chime: A5 → E6
    const tones = [
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 1318.5, start: 0.16, dur: 0.28 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      gain.gain.setValueAtTime(0.0001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    }
  } catch {
    // best effort
  }
}
