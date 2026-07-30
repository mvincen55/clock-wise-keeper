import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechPrefs = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  remember: boolean;
};

const STORAGE_KEY = 'pe.readAloud.prefs';

export const DEFAULT_PREFS: SpeechPrefs = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  remember: true,
};

function loadPrefs(): SpeechPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SpeechPrefs>;
    return {
      voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : null,
      rate: typeof parsed.rate === 'number' ? parsed.rate : 1,
      pitch: typeof parsed.pitch === 'number' ? parsed.pitch : 1,
      remember: true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Read-aloud built on the Web Speech API. Speaks an ordered list of chunks
 * (module sections) and reports which one is active so the UI can highlight it.
 * Voice / rate / pitch are user-tunable and optionally remembered locally.
 */
export function useSpeech(chunks: string[]) {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<SpeechPrefs>(() => (supported ? loadPrefs() : DEFAULT_PREFS));
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const sync = () => setVoices(window.speechSynthesis.getVoices());
    sync();
    window.speechSynthesis.addEventListener('voiceschanged', sync);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', sync);
  }, [supported]);

  // Stop any speech when the component unmounts.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const persist = useCallback((next: SpeechPrefs) => {
    try {
      if (next.remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — session-only prefs */
    }
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<SpeechPrefs>) => {
      setPrefs(prev => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const stop = useCallback(() => {
    if (!supported) return;
    cancelledRef.current = true;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setActiveIndex(null);
  }, [supported]);

  const speakFrom = useCallback(
    (startIndex: number) => {
      if (!supported) return;
      const list = chunksRef.current.filter(Boolean);
      if (list.length === 0) return;

      cancelledRef.current = false;
      window.speechSynthesis.cancel();

      const { voiceURI, rate, pitch } = prefsRef.current;
      const voice = voices.find(v => v.voiceURI === voiceURI) ?? null;

      list.slice(startIndex).forEach((text, offset) => {
        const index = startIndex + offset;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = pitch;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.onstart = () => {
          if (cancelledRef.current) return;
          setActiveIndex(index);
          setSpeaking(true);
          setPaused(false);
        };
        utterance.onend = () => {
          if (cancelledRef.current) return;
          if (index === list.length - 1) {
            setSpeaking(false);
            setPaused(false);
            setActiveIndex(null);
          }
        };
        utterance.onerror = () => {
          setSpeaking(false);
          setPaused(false);
        };
        window.speechSynthesis.speak(utterance);
      });

      setSpeaking(true);
    },
    [supported, voices]
  );

  const play = useCallback(() => speakFrom(0), [speakFrom]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  // Applying voice/rate/pitch mid-read: restart from the current section so the
  // change is heard immediately instead of only on the next module.
  const restartWithCurrentSettings = useCallback(() => {
    if (!speaking) return;
    const from = activeIndex ?? 0;
    stop();
    setTimeout(() => speakFrom(from), 60);
  }, [speaking, activeIndex, speakFrom, stop]);

  return {
    supported,
    voices,
    prefs,
    updatePrefs,
    speaking,
    paused,
    activeIndex,
    play,
    pause,
    resume,
    stop,
    restartWithCurrentSettings,
  };
}
