// Konuşma: ebeveyn kaydı → önceden üretilmiş doğal ses → cihazın tr-TR sentezi.
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

// --- Önceden üretilmiş doğal ses (Edge nöral TTS) ---
// Sıra: ebeveyn kaydı (key) → üretilmiş klip (profil, yoksa anlatici) → cihaz TTS.
// Liste göreli URL ile yüklenir (GitHub Pages alt yolunda da çalışır).
const KLIP_TABAN = new URL('../../ses/konusma/', import.meta.url);
let liste = null;
let listeSoz = null;
function listeYukle() {
  listeSoz ??= fetch(new URL('liste.json', KLIP_TABAN))
    .then(r => (r.ok ? r.json() : null)).then(j => (liste = j)).catch(() => null);
  return listeSoz;
}
listeYukle();

const norm = t => String(t ?? '').replace(/\s+/g, ' ').trim();

// NPC'nin ses profili (liste.json "npc" eşlemesi); bilinmiyorsa anlatici.
export function npcVoice(id) { return liste?.npc?.[id] || 'anlatici'; }

function klipYolu(t, voice) {
  const k = liste?.klipler;
  if (!k || !t) return null;
  return k[voice]?.[t] || k.anlatici?.[t] || null;
}
// Metin → klip yolları. Bütün metin yoksa ". " ile bölünmüş parçaların hepsi aranır (eşleştirme seslerinde).
function cozumle(text, voice, alt) {
  voice = voice || 'anlatici';
  for (const c of [norm(text), alt ? norm(alt) : '']) {
    if (!c) continue;
    const y = klipYolu(c, voice);
    if (y) return [y];
    const parcalar = c.split(/\.\s+/).map(x => x.trim()).filter(Boolean);
    if (parcalar.length > 1) {
      const ys = parcalar.map(x => klipYolu(x, voice) || klipYolu(x + '.', voice));
      if (ys.every(Boolean)) return ys;
    }
  }
  return null;
}

const blobOnbellek = new Map();
function klipBlob(rel) {
  let p = blobOnbellek.get(rel);
  if (!p) {
    p = fetch(new URL(rel, KLIP_TABAN)).then(r => { if (!r.ok) throw new Error('klip'); return r.blob(); });
    p.catch(() => blobOnbellek.delete(rel));
    blobOnbellek.set(rel, p);
  }
  return p;
}
// Bir sonraki konuşmayı önceden indir (isteğe bağlı).
export async function preload(text, { voice, alt } = {}) {
  await listeYukle();
  (cozumle(text, voice, alt) || []).forEach(y => klipBlob(y).catch(() => {}));
}

// iOS: tek bir yeniden kullanılan <audio>; ilk dokunuşta açılır.
const el = new Audio();
el.preload = 'auto';
let sesAcik = false;
let bekleyen = null;     // çalan klibin bitiş çözücüsü
const SESSIZ = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

export function unlockAudio() {
  // iOS konuşma sentezini ilk dokunuşta açar.
  if ('speechSynthesis' in window) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (_) {}
    if (!voicesReady) pickVoice();
  }
  if (!sesAcik) {
    sesAcik = true;
    try {
      el.src = SESSIZ;
      el.play().then(() => { if (el.src === SESSIZ) el.pause(); }).catch(() => {});
    } catch (_) {}
  }
}

export function stopSpeak() {
  try { el.pause(); } catch (_) {}
  const b = bekleyen; bekleyen = null;
  if (b) b();
  current = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// Paylaşılan <audio> ile bir url'yi çalar; bitince (ya da durdurulunca) çözülür.
function oynatUrl(url) {
  return new Promise(resolve => {
    let bitti = false, zt;
    const fin = () => {
      if (bitti) return; bitti = true; clearTimeout(zt);
      el.onended = el.onerror = null;
      if (bekleyen === fin) bekleyen = null;
      resolve();
    };
    bekleyen = fin;
    el.onended = el.onerror = fin;
    zt = setTimeout(fin, 20000);
    el.src = url;
    el.play().catch(fin);
  });
}

let seq = 0;   // en yeni konuşma çağrısı; eskileri iptal eder

async function playClip(keys, my) {
  let blob = null;
  for (const key of [].concat(keys || [])) {   // anahtar ya da öncelik sırasıyla anahtar listesi
    try { blob = await store.getClip(key); } catch (_) {}
    if (blob) break;
  }
  if (!blob) return false;
  if (my !== seq) return true;                  // araya yeni konuşma girdi
  const url = URL.createObjectURL(blob);
  await oynatUrl(url);
  URL.revokeObjectURL(url);
  return true;
}

async function playGenerated(text, voice, alt, my) {
  await listeYukle();
  const yollar = cozumle(text, voice, alt);
  if (!yollar) return false;
  let blobs;
  try { blobs = await Promise.all(yollar.map(klipBlob)); } catch (_) { return false; }
  for (const b of blobs) {
    if (my !== seq) return true;
    const url = URL.createObjectURL(b);
    await oynatUrl(url);
    URL.revokeObjectURL(url);
  }
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

// text: söylenecek metin (çocuğun adı olabilir). alt: adsız sürüm (üretilmiş klip için).
export async function speak(text, { key, voice, alt } = {}) {
  const my = ++seq;
  stopSpeak();
  caption(text);
  let ok = await playClip(key, my);
  if (!ok && my === seq) ok = await playGenerated(text, voice, alt, my);
  if (!ok && my === seq) await tts(text);
  if (my === seq) caption('');
}
