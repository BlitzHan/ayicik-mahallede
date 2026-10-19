// Konuşma: ebeveynin kaydettiği ses varsa onu, yoksa tr-TR konuşma sentezini kullanır.
import { store } from './store.js';

let current = null;      // çalan <audio> ya da utterance
let trVoice = null;
let voicesReady = false;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  voicesReady = true;
  const tr = voices.filter(v => /^tr/i.test(v.lang));
  // iOS: "Yelda", Android: Google Türkçe. Yerel sesi tercih et.
  trVoice = tr.find(v => v.localService) || tr[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function unlockAudio() {
  // iOS konuşma sentezini ilk dokunuşta açar.
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch (_) {}
  if (!voicesReady) pickVoice();
}

export function stopSpeak() {
  if (current instanceof HTMLAudioElement) { current.pause(); current = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

async function playClip(keys) {
  let blob = null;
  for (const key of [].concat(keys || [])) {   // anahtar ya da öncelik sırasıyla anahtar listesi
    try { blob = await store.getClip(key); } catch (_) {}
    if (blob) break;
  }
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = audio;
  await new Promise(resolve => {
    audio.onended = audio.onerror = resolve;
    audio.play().catch(resolve);
  });
  URL.revokeObjectURL(url);
  if (current === audio) current = null;
  return true;
}

function tts(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window) || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    if (trVoice) u.voice = trVoice;
    u.rate = 0.92;    // küçük çocuk için biraz yavaş
    u.pitch = 1.1;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = u.onerror = finish;
    // Bazı Android sürümleri onend'i hiç çağırmaz.
    setTimeout(finish, 1200 + text.length * 90);
    current = u;
    speechSynthesis.speak(u);
  });
}

// Altyazı: ebeveyn için küçük metin (çocuk okumuyor).
let captionEl = null;
function caption(text) {
  captionEl ??= document.getElementById('altyazi');
  if (!captionEl) return;
  captionEl.textContent = text || '';
  captionEl.classList.toggle('acik', !!text);
}

export async function speak(text, { key } = {}) {
  stopSpeak();
  caption(text);
  const played = await playClip(key);
  if (!played) await tts(text);
  caption('');
}
