/** Narration that always finishes: falls back to a reading-time timer when the browser has no voice. */

export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2500, words * 400);
}

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  voice = en.find((v) => /daniel|serena|moira|arthur|google uk english male|female/i.test(v.name)) ?? en[0] ?? null;
  return voice;
}

export function speak(text: string, muted: boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      done();
    };
    signal.addEventListener('abort', onAbort);
    // Safety net: some engines never fire onend.
    const timer = window.setTimeout(done, readingMs(text) + 4000);

    if (muted || !('speechSynthesis' in window)) {
      window.clearTimeout(timer);
      window.setTimeout(done, readingMs(text));
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.92;
    u.pitch = 0.7;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  });
}

export function silence(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
