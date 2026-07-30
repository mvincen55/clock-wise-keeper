import { useCallback, useEffect, useRef, useState } from 'react';

// Read-aloud for training modules. Browser speech synthesis only — no server
// calls, no cost, works offline. Speaks a list of segments in order and tells
// the player which one is being read so it can be highlighted.

export type SpeechSegment = { id: string; text: string };

/** The most natural-sounding English voice this browser offers. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(v => v.lang?.toLowerCase().startsWith('en'));
  if (!english.length) return voices[0] ?? null;
  const preferred = [
    'samantha',
    'google us english',
    'microsoft aria',
    'microsoft jenny',
    'ava',
    'allison',
    'natural',
    'enhanced',
    'premium',
  ];
  for (const name of preferred) {
    const hit = english.find(v => v.name.toLowerCase().includes(name));
    if (hit) return hit;
  }
  return english.find(v => v.localService) ?? english[0];
}

export function useSpeech(segments: SpeechSegment[]) {
  const supported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setActiveId(null);
  }, [supported]);

  // Auto-stop when the player unmounts or the tab goes away.
  useEffect(() => {
    if (!supported) return;
    const onHide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.speechSynthesis.cancel();
    };
  }, [supported, stop]);

  const start = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const list = segmentsRef.current.filter(s => s.text.trim());
    if (!list.length) return;
    setSpeaking(true);
    setPaused(false);
    list.forEach((segment, i) => {
      const utterance = new SpeechSynthesisUtterance(segment.text);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = 0.98;
      utterance.pitch = 1;
      utterance.onstart = () => setActiveId(segment.id);
      if (i === list.length - 1) {
        utterance.onend = () => {
          setSpeaking(false);
          setActiveId(null);
        };
      }
      window.speechSynthesis.speak(utterance);
    });
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (!speaking) return start();
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, [supported, speaking, paused, start]);

  return { supported, speaking, paused, activeId, start, stop, toggle };
}
