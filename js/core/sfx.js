// Ses: efektler önce ses dosyasından (Kenney CC0, ses/efekt/*.m4a), yoksa prosedürel; döngülü müzik.
// Web Audio yoksa her çağrı sessizce hiçbir şey yapmaz.

let ctx = null, master = null, sfxBus = null, musicBus = null;
const vol = { sfx: 0.7, music: 0.25 };
let unlocked = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
  } catch (_) { ctx = null; }
  return ctx;
}

// Kaydedilmiş efektler: ilk dokunuşta yüklenir; yüklenemeyen ad prosedürel sese düşer
const DOSYA = { jump: ['jump'], land: ['land'], coin: ['coin'], star: ['star'], yes: ['yes'], no: ['no'], pop: ['pop'],
  step: ['step0', 'step1', 'step2', 'step3'], open: ['open'], whoosh: ['whoosh'], bounce: ['bounce'] };
const KAZANC = { step: 0.35, land: 0.5, coin: 0.6, jump: 0.55 };
const tampon = {};
let yuklendi = false;
function yukle() {
  if (yuklendi || !ctx) return; yuklendi = true;
  const kok = new URL('../../ses/efekt/', import.meta.url);
  for (const [ad, dosyalar] of Object.entries(DOSYA)) {
    Promise.all(dosyalar.map(f => fetch(new URL(f + '.m4a', kok)).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))))
      .then(list => { tampon[ad] = list; }).catch(() => {});
  }
}
function calDosya(name, t) {
  const list = tampon[name]; if (!list) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  src.playbackRate.value = 0.96 + Math.random() * 0.08;   // her seferinde hafif farklı
  g.gain.value = KAZANC[name] ?? 0.8;
  src.connect(g); g.connect(sfxBus); src.start(t);
  return true;
}

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Tek nota: zarf + isteğe bağlı perde kayması ve filtre
function tone(freq, t, dur, { type = 'triangle', gain = 0.3, to = null, attack = 0.005, release = 0.08, dest = sfxBus, lp = null, vibrato = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  if (vibrato) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 18; lg.gain.value = vibrato; l.connect(lg); lg.connect(o.frequency);
    l.start(t); l.stop(t + dur + release);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  let node = o;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + release + 0.02);
}

let noiseBuf = null;
function noise(t, dur, { gain = 0.2, type = 'bandpass', freq = 1000, to = null, q = 1, dest = sfxBus } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t + dur + 0.05);
}

const EFEKT = {
  jump(t) { tone(330, t, 0.16, { type: 'square', gain: 0.12, to: 760, lp: 2200 }); },
  land(t) { tone(140, t, 0.08, { type: 'sine', gain: 0.3, to: 70 }); noise(t, 0.08, { gain: 0.06, type: 'lowpass', freq: 500 }); },
  coin(t) { tone(988, t, 0.06, { type: 'square', gain: 0.1, lp: 4000 }); tone(1319, t + 0.07, 0.22, { type: 'square', gain: 0.1, lp: 4000 }); },
  star(t) {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => tone(mtof(m), t + i * 0.07, 0.18, { type: 'triangle', gain: 0.2 }));
    tone(mtof(96), t + 0.45, 0.5, { type: 'sine', gain: 0.12, vibrato: 8 });
    noise(t + 0.4, 0.5, { gain: 0.05, type: 'highpass', freq: 6000 });
  },
  yes(t) { [72, 76, 79].forEach((m, i) => tone(mtof(m), t + i * 0.1, i === 2 ? 0.35 : 0.1, { type: 'triangle', gain: 0.22 })); },
  no(t) { tone(330, t, 0.28, { type: 'sine', gain: 0.18, to: 220, vibrato: 6 }); },
  pop(t) { tone(560, t, 0.06, { type: 'sine', gain: 0.25, to: 980 }); },
  step(t) { noise(t, 0.04, { gain: 0.05, type: 'lowpass', freq: 700 }); },
  splash(t) {
    noise(t, 0.6, { gain: 0.25, type: 'bandpass', freq: 1500, to: 300, q: 0.7 });
    [0.1, 0.22, 0.35].forEach((d, i) => tone(400 + i * 150, t + d, 0.06, { type: 'sine', gain: 0.1, to: 900 + i * 200 }));
  },
  open(t) { [60, 64, 67, 72].forEach((m, i) => tone(mtof(m), t + i * 0.06, 0.5 - i * 0.05, { type: 'triangle', gain: 0.16 })); },
  talk(t) {
    for (let i = 0; i < 4; i++) tone(320 + Math.random() * 280, t + i * 0.075, 0.05, { type: 'square', gain: 0.06, lp: 1800 });
  },
  whoosh(t) { noise(t, 0.35, { gain: 0.16, type: 'bandpass', freq: 400, to: 2400, q: 1.2 }); },
  bounce(t) { tone(160, t, 0.35, { type: 'sine', gain: 0.3, to: 620, vibrato: 25 }); },
};

const lastPlay = {};
const MIN_GAP = { step: 0.13, coin: 0.04, talk: 0.25 };

// ---------------- Müzik ----------------
const _ = null;
// mel/bass: 32 adım (sekizlik), kök notaya göre yarım ses farkı; null = sus
const PARCALAR = {
  baslik: {
    bpm: 112, root: 72, bassRoot: 48, lead: 'triangle', bassType: 'triangle', leadGain: 0.13,
    mel: [0, _, 4, _, 7, _, 4, _, 5, _, 9, _, 7, _, _, _, 4, _, 7, _, 12, _, 11, 9, 7, _, 5, _, 4, _, _, _],
    bass: [0, _, _, _, 7, _, _, _, 5, _, _, _, 7, _, _, _, 0, _, _, _, 7, _, _, _, 5, _, _, _, 7, _, _, _],
  },
  mahalle: {
    bpm: 104, root: 65, bassRoot: 41, lead: 'triangle', bassType: 'sine', leadGain: 0.12,
    mel: [0, _, 2, 4, 5, _, 4, 2, 0, _, -3, _, 0, _, _, _, 4, _, 5, 7, 9, _, 7, 5, 4, _, 2, _, 0, _, _, _],
    bass: [0, _, 7, _, 0, _, 7, _, 5, _, 12, _, 5, _, 12, _, 0, _, 7, _, 0, _, 7, _, 7, _, 2, _, 0, _, 7, _],
  },
  okul: {
    bpm: 120, root: 67, bassRoot: 43, lead: 'square', bassType: 'triangle', leadGain: 0.07, lp: 2600,
    mel: [0, 4, 7, 4, 0, 4, 7, 12, 11, 7, 9, 7, 4, _, _, _, 5, 9, 12, 9, 5, 9, 12, 14, 12, 11, 9, 7, 0, _, _, _],
    bass: [0, _, 7, _, 0, _, 7, _, 0, _, 7, _, 0, _, 7, _, 5, _, 0, _, 5, _, 0, _, 7, _, 2, _, 0, _, 7, _],
  },
  cami: {   // sakin, yumuşak, enstrümantal pentatonik
    bpm: 66, root: 62, bassRoot: 50, lead: 'sine', bassType: 'sine', leadGain: 0.12, attack: 0.08, pad: true,
    mel: [0, _, _, 2, 4, _, _, _, 7, _, 4, _, 2, _, _, _, 0, _, _, 2, 4, _, 7, _, 9, _, 7, _, 4, _, _, _],
    bass: [0, _, _, _, _, _, _, _, -5, _, _, _, _, _, _, _, -3, _, _, _, _, _, _, _, -5, _, _, _, _, _, _, _],
  },
  sahil: {  // akordeon havası
    bpm: 100, root: 69, bassRoot: 45, lead: 'sawtooth', bassType: 'triangle', leadGain: 0.06, lp: 1600,
    mel: [0, _, 4, 5, 7, _, 5, 4, 5, _, 4, 2, 0, _, _, _, 2, _, 4, 5, 7, _, 9, 7, 5, 4, 2, 4, 0, _, _, _],
    bass: [0, _, 7, 7, 0, _, 7, 7, 5, _, 12, 12, 7, _, 14, 14, 0, _, 7, 7, 0, _, 7, 7, 5, _, 7, _, 0, _, 7, 7],
  },
};

let track = null;       // {def, bus, step, next}
let schedTimer = null;

function scheduleTrack() {
  if (!ctx || !track) return;
  const d = track.def, stepDur = 60 / d.bpm / 2;
  while (track.next < ctx.currentTime + 0.15) {
    const i = track.step % 32, t = track.next;
    const m = d.mel[i];
    if (m !== null && m !== undefined) {
      let len = 1; while (len < 4 && d.mel[(i + len) % 32] === null) len++;
      tone(mtof(d.root + m), t, stepDur * len * 0.9, { type: d.lead, gain: d.leadGain, attack: d.attack || 0.01, release: 0.1, dest: track.bus, lp: d.lp || null });
    }
    const b = d.bass[i];
    if (b !== null && b !== undefined) {
      let len = 1; while (len < 8 && d.bass[(i + len) % 32] === null) len++;
      tone(mtof(d.bassRoot + b), t, stepDur * len * (d.pad ? 1 : 0.6), { type: d.bassType, gain: d.pad ? 0.1 : 0.16, attack: d.pad ? 0.3 : 0.01, release: d.pad ? 0.6 : 0.08, dest: track.bus });
    }
    track.step++; track.next += stepDur;
  }
}

function startScheduler() {
  if (schedTimer) return;
  schedTimer = setInterval(scheduleTrack, 30);
}

let wantedMusic = null;

export const sfx = {
  unlock() {
    if (!ensure()) return;
    try {
      ctx.resume?.();
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (_) {}
    unlocked = true; yukle();
    if (wantedMusic && !track) sfx.music(wantedMusic);
  },
  play(name) {
    if (!ctx || !unlocked || (!EFEKT[name] && !tampon[name])) return;
    try {
      const now = ctx.currentTime;
      if (MIN_GAP[name] && now - (lastPlay[name] || -1) < MIN_GAP[name]) return;
      lastPlay[name] = now;
      if (!calDosya(name, now + 0.005)) EFEKT[name]?.(now + 0.005);
    } catch (_) {}
  },
  music(name) {
    wantedMusic = name || null;
    if (!ctx || !unlocked) return;
    if (track && track.name === name) return;
    try {
      const now = ctx.currentTime;
      if (track) {   // eski parçayı yumuşakça kıs
        const old = track.bus;
        old.gain.setValueAtTime(old.gain.value, now);
        old.gain.linearRampToValueAtTime(0.0001, now + 0.6);
        setTimeout(() => { try { old.disconnect(); } catch (_) {} }, 900);
        track = null;
      }
      if (!name || !PARCALAR[name]) return;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(1, now + 0.8);
      bus.connect(musicBus);
      track = { name, def: PARCALAR[name], bus, step: 0, next: now + 0.1 };
      startScheduler();
    } catch (_) {}
  },
  setVolume(s, m) {
    if (typeof s === 'number') vol.sfx = Math.max(0, Math.min(1, s));
    if (typeof m === 'number') vol.music = Math.max(0, Math.min(1, m));
    if (sfxBus) sfxBus.gain.value = vol.sfx;
    if (musicBus) musicBus.gain.value = vol.music;
  },
};

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  try { document.hidden ? ctx.suspend() : (unlocked && ctx.resume()); } catch (_) {}
});
