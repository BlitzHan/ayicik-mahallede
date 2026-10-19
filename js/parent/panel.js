// Ayıcık Mahallede — ebeveyn paneli. YETİŞKİN içindir: Türkçe yazı serbest.
// openParentPanel(ctx) → Promise<void>; ctx = {speak, sfx, onChange, stopSpeak?}
// Her şey cihazda kalır (store.js). Panel #overlay içine açılır.

import { store, SABIT_SATIRLAR, npcSatirAlani, yeniId } from '../core/store.js';

const MAKS_KAYIT_SN = 10;
const MAKS_FOTO = 24;
const MAKS_KIYAFET = 24;
const KAYIT_NOTU = 'Ses kaydı için oyunu HTTPS adresinden ya da bu bilgisayarda (localhost) açın; kaydettiğiniz sesleri Dışa aktar ile telefona taşıyabilirsiniz.';

const SEKMELER = [
  { id: 'cocuklar', ad: 'Çocuklar', ikon: '🧒' },
  { id: 'sesim', ad: 'Sesim', ikon: '🎙️' },
  { id: 'aile', ad: 'Aile', ikon: '💌' },
  { id: 'bulmaca', ad: 'Bulmacalarım', ikon: '🧩' },
  { id: 'kiyafet', ad: 'Kıyafetler', ikon: '👕' },
  { id: 'kayit', ad: 'Kayıt', ikon: '💾' },
];
const RENKLER = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#ec407a', '#6d4c41', '#212121'];
const ALANLAR = [['aile', 'Mahalle / aile'], ['okul', 'Okul'], ['din', 'Cami / din'], ['kultur', 'Sahil / kültür']];
const ALAN_ADI = Object.fromEntries(ALANLAR);
const KIMDEN = ['Baba', 'Anne', 'Dede', 'Nine'];
const EMOJILER = (
  '🍎 🍌 🍇 🍓 🍊 🍉 🍐 🍒 🥕 🍅 🥒 🌽 🥖 🧀 🥛 🥚 🍯 🍪 🍦 🍰 ' +
  '🐱 🐶 🐄 🐔 🐟 🐑 🐴 🐰 🐻 🐘 🦁 🐸 🐝 🦋 🐢 🦆 🐦 🐞 ' +
  '⚽ 🎈 🧸 🎁 🚗 🚌 🚲 ⛵ 🚂 ✈️ 🏠 🕌 🌳 🌸 ☀️ 🌙 ⭐ ☁️ 🌈 💧 ' +
  '✏️ 📚 🎨 ✂️ 👟 🧦 🧼 🪥 🛁 ❤️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔺 🟥 🟦 🟨'
).split(' ').filter(Boolean);

let P = null;          // açık panelin durumu
let acikSoz = null;    // aynı anda tek panel
let kayit = null;      // süren ses kaydı
let caliyor = null;    // yedek ses çalıcı

// ================================================================ giriş

export function openParentPanel(ctx = {}) {
  if (acikSoz) return acikSoz;
  acikSoz = new Promise((resolve) => {
    baslat(ctx || {}, resolve).catch((e) => {
      console.error('[panel] açılamadı:', e);
      if (P) kapat(); else resolve();
    });
  }).finally(() => { acikSoz = null; });
  return acikSoz;
}

async function baslat(ctx, resolve) {
  await cssYukle();
  try { await store.init(); } catch (e) { console.warn('[panel] store.init:', e); }
  const kok = h('div', { class: 'ap-kok', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ebeveyn paneli' });
  olayKalkani(kok);
  const ov = overlayHazirla();
  ov.el.append(kok);
  ov.goster();
  P = {
    ctx, kok, ov, resolve,
    gecti: false, sekme: 'cocuklar', grupDurum: new Map(),
    profilForm: null, mesajForm: null, taslak: null,
  };
  kapiCiz();
}

function kapat() {
  if (!P) return;
  const s = P;
  kayit?.dur(true);
  sesiSustur();
  P = null;
  s.kok.remove();
  s.ov.geriAl();
  if (s.gecti) {
    try { s.ctx.onChange?.(); } catch (e) { console.warn('[panel] onChange:', e); }
  }
  s.resolve();
}

function cssYukle() {
  if (document.querySelector('link[href*="panel.css"]')) return Promise.resolve();
  return new Promise((resolve) => {
    const l = h('link', { rel: 'stylesheet', href: new URL('../../css/panel.css', import.meta.url).href });
    l.onload = l.onerror = () => resolve();
    document.head.append(l);
    setTimeout(resolve, 1500);
  });
}

function overlayHazirla() {
  let el = document.getElementById('overlay');
  let yarattim = false;
  if (!el) {
    el = h('div', { id: 'overlay', style: { position: 'fixed', inset: '0', zIndex: '50' } });
    document.body.append(el);
    yarattim = true;
  }
  const onceki = { hidden: el.hidden, display: el.style.display, pe: el.style.pointerEvents };
  return {
    el,
    goster() {
      el.hidden = false;
      el.style.pointerEvents = 'auto';
      if (getComputedStyle(el).display === 'none') el.style.display = 'block';
    },
    geriAl() {
      if (yarattim) { el.remove(); return; }
      el.hidden = onceki.hidden;
      el.style.display = onceki.display;
      el.style.pointerEvents = onceki.pe;
    },
  };
}

// Oyunun klavye/dokunma dinleyicileri panel içindeki olayları görmesin (kaydırma, boşluk tuşu).
function olayKalkani(kok) {
  const dur = (e) => e.stopPropagation();
  for (const t of ['keydown', 'keyup', 'keypress', 'touchstart', 'touchmove', 'touchend', 'wheel']) {
    kok.addEventListener(t, dur, { passive: true });
  }
}

// ================================================================ DOM yardımcıları

function h(etiket, ozellik, ...cocuklar) {
  const el = document.createElement(etiket);
  if (ozellik) {
    for (const [k, v] of Object.entries(ozellik)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'hidden', 'multiple', 'open'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  ekle(el, cocuklar);
  return el;
}
function ekle(el, cocuklar) {
  for (const c of cocuklar) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) ekle(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
const btn = (yazi, onclick, cls = '', ek = {}) => h('button', { type: 'button', class: 'ap-btn ' + cls, onclick, ...ek }, yazi);
const ikonBtn = (ikon, etiket, onclick, cls = '') =>
  h('button', { type: 'button', class: 'ap-btn ap-ikon-btn ' + cls, onclick, 'aria-label': etiket, title: etiket }, ikon);
const alanEtiket = (etiket, kontrol, ipucu) =>
  h('label', { class: 'ap-alan' }, h('span', { class: 'ap-etiket' }, etiket), kontrol, ipucu ? h('small', { class: 'ap-soluk' }, ipucu) : null);
const alanKutu = (etiket, kontrol, ipucu) =>
  h('div', { class: 'ap-alan' }, h('span', { class: 'ap-etiket' }, etiket), kontrol, ipucu ? h('small', { class: 'ap-soluk' }, ipucu) : null);
function secimKutusu(secenekler, deger, onDegis) {
  const s = h('select', { class: 'ap-girdi' }, secenekler.map(([v, ad]) => h('option', { value: v }, ad)));
  s.value = deger;
  s.addEventListener('change', () => onDegis(s.value));
  return s;
}
function girdi(deger, ozellik = {}) {
  const g = h(ozellik.tag || 'input', { type: ozellik.tag ? null : 'text', class: 'ap-girdi', autocomplete: 'off', ...ozellik, tag: null });
  g.value = deger ?? '';
  return g;
}

const aktifAd = () => store.activeProfile()?.ad || 'Çocuğum';
const adYerlestir = (m) => String(m || '').replace(/\{ad\}/g, aktifAd());

function bildir(mesaj, tur = '') {
  const b = P?.bildirim;
  if (!b) return;
  b.textContent = mesaj;
  b.className = 'ap-bildirim gorunur ' + tur;
  clearTimeout(bildir.z);
  bildir.z = setTimeout(() => b.classList.remove('gorunur'), tur === 'hata' ? 5000 : 2200);
}

function perdeAc(icerik, { sinif = '', disTiklaKapat = null } = {}) {
  const perde = h('div', { class: 'ap-perde' }, h('div', { class: 'ap-kart ap-modal ' + sinif }, icerik));
  if (disTiklaKapat) perde.addEventListener('click', (e) => { if (e.target === perde) disTiklaKapat(); });
  P.kok.append(perde);
  return perde;
}

function onayla(mesaj, { evet = 'Evet', hayir = 'Vazgeç', tehlike = false } = {}) {
  return new Promise((resolve) => {
    const bitir = (v) => { perde.remove(); resolve(v); };
    const perde = perdeAc([
      h('p', { class: 'ap-modal-metin' }, mesaj),
      h('div', { class: 'ap-satir ap-sag' },
        btn(hayir, () => bitir(false)),
        btn(evet, () => bitir(true), tehlike ? 'ap-tehlike' : 'ap-birincil')),
    ], { disTiklaKapat: () => bitir(false) });
  });
}

function metinSor({ baslik, deger = '', ipucu = '', varsayilanVar = false, maks = 200 }) {
  return new Promise((resolve) => {
    const ta = girdi(deger, { tag: 'textarea', maxlength: maks, rows: 3, 'aria-label': baslik });
    const sayac = h('small', { class: 'ap-soluk ap-sayac' });
    const say = () => { sayac.textContent = `${ta.value.length}/${maks}`; };
    ta.addEventListener('input', say);
    say();
    const bitir = (v) => { perde.remove(); resolve(v); };
    const perde = perdeAc([
      h('h3', { class: 'ap-modal-baslik' }, baslik),
      ipucu ? h('p', { class: 'ap-soluk' }, ipucu) : null,
      ta, sayac,
      h('div', { class: 'ap-satir ap-sag ap-sar' },
        btn('▶ Dinle', () => dinle(null, ta.value)),
        varsayilanVar ? btn('Varsayılana dön', () => bitir({ varsayilan: true })) : null,
        btn('Vazgeç', () => bitir(null)),
        btn('Kaydet', () => bitir({ metin: ta.value.trim() }), 'ap-birincil')),
    ]);
    setTimeout(() => ta.focus(), 30);
  });
}

function emojiSec() {
  return new Promise((resolve) => {
    const bitir = (v) => { perde.remove(); resolve(v); };
    const perde = perdeAc([
      h('div', { class: 'ap-satir ap-arasi' }, h('h3', { class: 'ap-modal-baslik' }, 'Emoji seç'), btn('Kapat', () => bitir(null))),
      h('div', { class: 'ap-emoji-izgara' },
        EMOJILER.map((e) => h('button', { type: 'button', onclick: () => bitir(e), 'aria-label': e }, e))),
    ], { sinif: 'ap-emoji-modal', disTiklaKapat: () => bitir(null) });
  });
}

function renkSecici(secili, onSec, { bosSecenek = false } = {}) {
  const kutu = h('div', { class: 'ap-renkler', role: 'radiogroup' });
  for (const r of bosSecenek ? ['', ...RENKLER] : RENKLER) {
    const b = h('button', {
      type: 'button',
      class: 'ap-renk' + (r ? '' : ' ap-renk-yok') + (r === (secili || '') ? ' secili' : ''),
      style: r ? { background: r } : null,
      'aria-label': r ? 'Renk ' + r : 'Renk yok',
      title: r ? r : 'Renk yok',
      onclick: () => {
        for (const x of kutu.children) x.classList.toggle('secili', x === b);
        onSec(r);
      },
    });
    kutu.append(b);
  }
  return kutu;
}

function avatar(p) {
  return h('div', { class: 'ap-avatar', style: { '--renk': p.renk || '#ccc' } },
    p.foto ? h('img', { src: p.foto, alt: '' }) : (p.ad || '?').trim().charAt(0).toLocaleUpperCase('tr') || '🙂');
}

function gizliDosya(accept, coklu = false) {
  P.kok.querySelectorAll('.ap-gizli-dosya').forEach((x) => x.remove());
  const inp = h('input', { type: 'file', accept, class: 'ap-gizli-dosya', multiple: coklu, tabindex: '-1', 'aria-hidden': 'true' });
  P.kok.append(inp);   // iOS: change olayı için girdi DOM'da olmalı
  return inp;
}

// ================================================================ fotoğraf

async function resimKucult(dosya, { max = 512, kare = false, kalite = 0.82 } = {}) {
  if (!dosya || !/^image\//.test(dosya.type || 'image/')) throw new Error('Bu bir fotoğraf dosyası değil.');
  const url = URL.createObjectURL(dosya);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Fotoğraf açılamadı (biçim desteklenmiyor olabilir).'));
      i.src = url;
    });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (!sw || !sh) throw new Error('Fotoğraf boş görünüyor.');
    if (kare) { const k = Math.min(sw, sh); sx = (sw - k) / 2; sy = (sh - k) / 2; sw = sh = k; }
    const olcek = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * olcek));
    const hh = Math.max(1, Math.round(sh * olcek));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, hh);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, hh);
    return c.toDataURL('image/jpeg', kalite);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fotoSecici({ onSec, coklu = false, kare = false, pasif = false, max = 512, kalite = 0.82, yazilar = ['📷 Fotoğraf çek', '🖼️ Galeriden seç'] }) {
  const ac = (kamera) => {
    const inp = gizliDosya('image/*', coklu && !kamera);
    if (kamera) inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', async () => {
      const dosyalar = [...(inp.files || [])];
      inp.remove();
      for (const d of dosyalar) {
        try { await onSec(await resimKucult(d, { kare, max, kalite })); }
        catch (e) { bildir(e.message || 'Fotoğraf okunamadı.', 'hata'); }
      }
    });
    inp.click();
  };
  return [
    btn(yazilar[0], () => ac(true), '', { disabled: pasif }),
    btn(yazilar[1], () => ac(false), '', { disabled: pasif }),
  ];
}

// ================================================================ ses: dinle, kaydet

function sesiSustur() {
  try { caliyor?.pause(); } catch (_) {}
  caliyor = null;
  try { P?.ctx?.stopSpeak?.(); } catch (_) {}
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}

async function yedekKonus(metin, key) {
  const blob = key ? await store.getClip(key) : null;
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    caliyor = a;
    await new Promise((r) => { a.onended = a.onerror = r; a.play().catch(r); });
    URL.revokeObjectURL(url);
    return;
  }
  if (!('speechSynthesis' in window) || !metin) return;
  await new Promise((r) => {
    const u = new SpeechSynthesisUtterance(metin);
    u.lang = 'tr-TR';
    const v = speechSynthesis.getVoices().find((x) => /^tr/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 0.92;
    u.onend = u.onerror = r;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(r, 1500 + metin.length * 100);
  });
}

async function dinle(key, metin, dugme) {
  if (!P) return;
  const t = adYerlestir(metin);
  dugme?.classList.add('caliyor');
  try {
    if (typeof P.ctx.speak === 'function') await P.ctx.speak(t, key ? { key } : {});
    else await yedekKonus(t, key);
  } catch (e) {
    console.warn('[panel] dinle:', e);
  }
  dugme?.classList.remove('caliyor');
}

function kayitDurumu() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'guvenli-degil';
  if (typeof window.MediaRecorder !== 'function') return 'desteklenmiyor';
  return 'tamam';
}

function mimeSec() {
  const MR = window.MediaRecorder;
  if (!MR?.isTypeSupported) return '';
  // AAC/MP4 her cihazda (iPhone dahil) çalar; Chrome'da yoksa WebM/Opus.
  for (const m of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    try { if (MR.isTypeSupported(m)) return m; } catch (_) {}
  }
  return '';
}

async function sesKaydet(key, metin, sonra) {
  if (!P || kayit) return;
  const durumu = kayitDurumu();
  if (durumu !== 'tamam') {
    bildir(durumu === 'guvenli-degil' ? KAYIT_NOTU : 'Bu tarayıcı ses kaydını desteklemiyor. 📁 ile hazır bir ses dosyası seçebilirsiniz.', 'hata');
    return;
  }
  sesiSustur();
  let akis;
  try {
    akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    bildir(e?.name === 'NotAllowedError'
      ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verin.'
      : 'Mikrofon açılamadı: ' + (e?.message || e?.name || 'bilinmeyen hata'), 'hata');
    return;
  }
  if (!P) { akis.getTracks().forEach((t) => t.stop()); return; }
  const mime = mimeSec();
  let rec;
  try {
    rec = new MediaRecorder(akis, mime ? { mimeType: mime } : undefined);
  } catch (_) {
    try { rec = new MediaRecorder(akis); } catch (e) {
      akis.getTracks().forEach((t) => t.stop());
      bildir('Kayıt başlatılamadı: ' + (e?.message || ''), 'hata');
      return;
    }
  }
  const parcalar = [];
  let iptal = false;
  const sure = h('div', { class: 'ap-kayit-sure' }, '0,0 sn');
  const cubuk = h('div', { class: 'ap-kayit-cubuk-ic' });
  const dur = () => {
    clearInterval(zaman);
    if (rec.state !== 'inactive') { try { rec.stop(); } catch (_) {} }
  };
  const perde = perdeAc([
    h('div', { class: 'ap-kayit-nokta', 'aria-hidden': 'true' }),
    h('div', { class: 'ap-kayit-yazi' }, '● KAYIT'),
    sure,
    h('div', { class: 'ap-kayit-cubuk' }, cubuk),
    h('p', { class: 'ap-soluk ap-kucuk' }, 'Şimdi okuyun:'),
    h('p', { class: 'ap-kayit-metin' }, adYerlestir(metin) || '—'),
    h('div', { class: 'ap-satir ap-orta ap-sar' },
      btn('Vazgeç', () => { iptal = true; dur(); }),
      btn('■ Durdur ve kaydet', () => dur(), 'ap-tehlike ap-buyuk')),
  ], { sinif: 'ap-kayit-kart' });
  perde.classList.add('ap-kayit-perde');

  rec.ondataavailable = (e) => { if (e.data && e.data.size) parcalar.push(e.data); };
  rec.onstop = async () => {
    clearInterval(zaman);
    akis.getTracks().forEach((t) => t.stop());
    perde.remove();
    kayit = null;
    if (iptal || !P) return;
    const tur = (rec.mimeType || mime || parcalar[0]?.type || 'audio/mp4').replace(/\s+/g, '');
    const blob = new Blob(parcalar, { type: tur });
    if (blob.size < 400) { bildir('Kayıt boş görünüyor, tekrar deneyin.', 'hata'); return; }
    try {
      await store.putClip(key, blob);
      bildir('Sesiniz kaydedildi ✓');
      sonra?.();
    } catch (e) {
      bildir('Kaydedilemedi: ' + (e?.message || e?.name || ''), 'hata');
    }
  };
  const baslangic = performance.now();
  const zaman = setInterval(() => {
    const t = (performance.now() - baslangic) / 1000;
    sure.textContent = `${Math.min(t, MAKS_KAYIT_SN).toFixed(1).replace('.', ',')} / ${MAKS_KAYIT_SN} sn`;
    cubuk.style.width = Math.min(100, (t / MAKS_KAYIT_SN) * 100) + '%';
    if (t >= MAKS_KAYIT_SN) dur();
  }, 100);
  kayit = { dur: (iptalEt) => { if (iptalEt) iptal = true; dur(); } };
  try {
    rec.start();
  } catch (e) {
    iptal = true;
    dur();
    akis.getTracks().forEach((t) => t.stop());
    perde.remove();
    kayit = null;
    bildir('Kayıt başlatılamadı: ' + (e?.message || ''), 'hata');
  }
}

function sesDosyasiSec(key, sonra) {
  const inp = gizliDosya('audio/*');
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    inp.remove();
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { bildir('Dosya çok büyük (en çok 3 MB). Kısa bir kayıt seçin.', 'hata'); return; }
    try {
      const tur = f.type || (/\.webm$/i.test(f.name) ? 'audio/webm' : /\.(mp3)$/i.test(f.name) ? 'audio/mpeg' : 'audio/mp4');
      await store.putClip(key, new Blob([f], { type: tur }));
      bildir('Ses dosyası eklendi ✓');
      sonra?.();
    } catch (e) {
      bildir('Eklenemedi: ' + (e?.message || ''), 'hata');
    }
  });
  inp.click();
}

// ================================================================ kapı (yetişkin sorusu)

function soruUret() {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  if (Math.random() < 0.5) {
    const a = r(6, 9), b = r(6, 9);
    return { soru: `${a} × ${b}`, cevap: a * b };
  }
  const a = r(14, 49), b = r(13, 39);
  return { soru: `${a} + ${b}`, cevap: a + b };
}

function kapiCiz() {
  const { soru, cevap } = soruUret();
  const inp = h('input', {
    type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'go',
    class: 'ap-girdi ap-kapi-girdi', 'aria-label': 'Cevap', placeholder: '?',
  });
  const gonder = () => {
    if (!P) return;
    const v = parseInt(inp.value.trim(), 10);
    if (v !== cevap) { kapat(); return; }
    P.gecti = true;
    try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch (_) {}
    panelCiz();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gonder(); } });
  P.kok.replaceChildren(
    h('div', { class: 'ap-kapi' },
      h('div', { class: 'ap-kart ap-kapi-kart' },
        h('div', { class: 'ap-kapi-ikon', 'aria-hidden': 'true' }, '🔒'),
        h('h2', { class: 'ap-baslik' }, 'Ebeveyn girişi'),
        h('p', { class: 'ap-soluk' }, 'Devam etmek için işlemi yapın.'),
        h('div', { class: 'ap-kapi-soru', 'data-soru': soru }, `${soru} = ?`),
        inp,
        h('div', { class: 'ap-satir ap-orta' },
          btn('Vazgeç', () => kapat()),
          btn('Gir', gonder, 'ap-birincil')))));
  setTimeout(() => inp.focus(), 60);
}

// ================================================================ ana panel

function panelCiz() {
  P.sekmelerEl = h('nav', { class: 'ap-sekmeler', role: 'tablist' },
    SEKMELER.map((s) => h('button', {
      type: 'button', class: 'ap-sekme', role: 'tab', dataset: { sekme: s.id }, onclick: () => sekmeAc(s.id),
    }, h('span', { class: 'ap-sekme-ikon', 'aria-hidden': 'true' }, s.ikon), h('span', {}, s.ad))));
  P.icerik = h('main', { class: 'ap-icerik' });
  P.altBaslik = h('span', { class: 'ap-ust-alt' });
  P.bildirim = h('div', { class: 'ap-bildirim', role: 'status', 'aria-live': 'polite' });
  P.kok.replaceChildren(
    h('header', { class: 'ap-ust' },
      h('div', { class: 'ap-ust-baslik' }, h('strong', {}, '🐻 Ebeveyn Paneli'), P.altBaslik),
      btn('✕ Kapat', () => kapat(), 'ap-kapat')),
    h('div', { class: 'ap-govde' }, P.sekmelerEl, P.icerik),
    P.bildirim);
  sekmeAc(P.sekme);
}

function altBaslikGuncelle() {
  if (!P?.altBaslik) return;
  const a = store.activeProfile();
  P.altBaslik.textContent = a ? `Oynayan: ${a.ad}` : 'Henüz çocuk eklenmedi';
}

const CIZICILER = {
  cocuklar: cocuklarCiz,
  sesim: sesimCiz,
  aile: aileCiz,
  bulmaca: bulmacaCiz,
  kiyafet: kiyafetCiz,
  kayit: kayitCiz,
};

async function sekmeAc(id, kaydirmaKoru = false) {
  if (!P) return;
  P.sekme = id;
  for (const b of P.sekmelerEl.children) {
    const secili = b.dataset.sekme === id;
    b.classList.toggle('secili', secili);
    b.setAttribute('aria-selected', String(secili));
  }
  altBaslikGuncelle();
  const sayfa = h('div', { class: 'ap-sayfa', 'data-sayfa': id });
  P.icerik.replaceChildren(sayfa);
  if (!kaydirmaKoru) P.icerik.scrollTop = 0;
  try {
    await CIZICILER[id](sayfa);
  } catch (e) {
    console.error('[panel]', e);
    sayfa.append(h('p', { class: 'ap-hata' }, 'Bu bölüm açılamadı: ' + (e?.message || e)));
  }
}

async function yenidenCiz(sonra) {
  if (!P?.icerik) return;
  const y = P.icerik.scrollTop;
  await sekmeAc(P.sekme, true);
  if (!P) return;
  P.icerik.scrollTop = y;
  if (sonra) P.icerik.querySelector(sonra)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

const baslik = (yazi, aciklama) => [
  h('h2', { class: 'ap-baslik' }, yazi),
  aciklama ? h('p', { class: 'ap-soluk' }, aciklama) : null,
];

// ================================================================ sekme: Çocuklar

function cocuklarCiz(s) {
  const profiller = store.profiles();
  const aktif = store.activeProfile();
  s.append(...baslik('Çocuklar', 'Oyun, oynayan çocuğun adını sesli söyler. Fotoğraf başlık ekranında ve oyunda görünür.'));
  if (!profiller.length && !P.profilForm) P.profilForm = { ad: '', renk: RENKLER[0], foto: null };

  const liste = h('div', { class: 'ap-liste' });
  for (const p of profiller) {
    const aktifMi = aktif?.id === p.id;
    const il = store.progressOf(p.id);
    liste.append(h('div', { class: 'ap-kart ap-cocuk' + (aktifMi ? ' aktif' : ''), dataset: { id: p.id } },
      avatar(p),
      h('div', { class: 'ap-cocuk-bilgi' },
        h('div', {}, h('strong', { class: 'ap-cocuk-ad' }, p.ad), aktifMi ? h('span', { class: 'ap-rozet' }, '▶ Oynayan') : null),
        h('div', { class: 'ap-soluk ap-kucuk' },
          `🪙 ${il.altin} · ⭐ ${Object.keys(il.yildiz).length} · 🧩 ${Object.keys(il.cozulen).length}`)),
      h('div', { class: 'ap-dugmeler' },
        aktifMi ? null : btn('Oynayan yap', () => {
          store.setActive(p.id);
          bildir(`${p.ad} artık oynayan çocuk`);
          yenidenCiz();
        }, 'ap-birincil'),
        btn('Düzenle', () => {
          P.profilForm = { id: p.id, ad: p.ad, renk: p.renk, foto: p.foto };
          yenidenCiz('.ap-form');
        }),
        btn('Sil', async () => {
          const ok = await onayla(`${p.ad} silinsin mi? İlerlemesi, fotoğrafı ve ona özel karşılama sesi de silinir.`, { evet: 'Sil', tehlike: true });
          if (!ok) return;
          store.removeProfile(p.id);
          await store.flush();
          bildir('Silindi');
          yenidenCiz();
        }, 'ap-tehlike-cizgi'))));
  }
  s.append(liste);

  if (P.profilForm) s.append(profilFormu(P.profilForm));
  else {
    s.append(btn('+ Çocuk ekle', () => {
      P.profilForm = { ad: '', renk: RENKLER[profiller.length % RENKLER.length], foto: null };
      yenidenCiz('.ap-form');
    }, 'ap-birincil ap-genis'));
  }
}

function profilFormu(f) {
  const ad = girdi(f.ad, { maxlength: 16, placeholder: 'Örn. Yusuf', autocapitalize: 'words', enterkeyhint: 'done' });
  ad.addEventListener('input', () => { f.ad = ad.value; if (!f.foto) fotoCiz(); });
  const onizleme = h('div', { class: 'ap-avatar ap-avatar-buyuk' });
  const kaldir = btn('Kaldır', () => { f.foto = null; fotoCiz(); });
  const fotoCiz = () => {
    onizleme.style.setProperty('--renk', f.renk);
    onizleme.replaceChildren(f.foto ? h('img', { src: f.foto, alt: '' }) : ((f.ad || '').trim().charAt(0).toLocaleUpperCase('tr') || '🙂'));
    kaldir.hidden = !f.foto;
  };
  fotoCiz();
  const hata = h('p', { class: 'ap-hata', hidden: true });
  const kaydet = () => {
    const temiz = (f.ad || '').trim();
    if (!temiz) { hata.textContent = 'Lütfen çocuğun adını yazın.'; hata.hidden = false; ad.focus(); return; }
    if (f.id) store.updateProfile(f.id, { ad: temiz, renk: f.renk, foto: f.foto });
    else store.addProfile({ ad: temiz, renk: f.renk, foto: f.foto });
    P.profilForm = null;
    bildir('Kaydedildi ✓');
    yenidenCiz();
  };
  ad.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); kaydet(); } });
  return h('div', { class: 'ap-kart ap-form' },
    h('h3', { class: 'ap-modal-baslik' }, f.id ? 'Çocuğu düzenle' : 'Yeni çocuk'),
    alanEtiket('Adı (oyun sesli söyler)', ad),
    alanKutu('Renk', renkSecici(f.renk, (r) => { f.renk = r; fotoCiz(); })),
    alanKutu('Fotoğraf (isteğe bağlı)',
      h('div', { class: 'ap-satir ap-sar' }, onizleme,
        ...fotoSecici({ kare: true, onSec: (d) => { f.foto = d; fotoCiz(); } }), kaldir),
      'Kare olarak kırpılır ve küçültülür; yalnız bu cihazda saklanır.'),
    hata,
    h('div', { class: 'ap-satir ap-sag' },
      store.profiles().length ? btn('Vazgeç', () => { P.profilForm = null; yenidenCiz(); }) : null,
      btn('Kaydet', kaydet, 'ap-birincil')));
}

// ================================================================ sekme: Sesim

function sesSatiri(o) {
  const satir = h('div', {
    class: 'ap-ses-satir',
    dataset: { key: o.key, ara: `${o.metin || ''} ${o.etiket || ''} ${o.ara || ''}`.toLocaleLowerCase('tr') },
  });
  let klipVar = !!o.klipVar;
  const guncelle = (v) => { klipVar = v; ciz(); sayimlariGuncelle(); };
  const ciz = () => {
    satir.dataset.klip = klipVar ? '1' : '0';
    const destek = kayitDurumu() === 'tamam';
    satir.replaceChildren(
      h('div', { class: 'ap-ses-metin' },
        h('div', { class: 'ap-ses-yazi' },
          o.etiket ? h('span', { class: 'ap-ses-etiket' }, o.etiket) : null,
          o.metin || h('em', { class: 'ap-soluk' }, '(boş)')),
        h('div', { class: 'ap-ses-alt' },
          klipVar ? h('span', { class: 'ap-rozet' }, '🎙️ Sizin sesiniz') : h('span', { class: 'ap-rozet ap-rozet-gri' }, 'Bilgisayar sesi'),
          o.ipucu ? h('span', { class: 'ap-soluk ap-kucuk' }, o.ipucu) : null)),
      h('div', { class: 'ap-ses-dugmeler' },
        ikonBtn('▶', 'Dinle', (e) => dinle(o.key, o.metin, e.currentTarget)),
        ikonBtn('⏺', 'Kendi sesimle kaydet', () => sesKaydet(o.key, o.metin, () => guncelle(true)), 'ap-kayit-btn' + (destek ? '' : ' ap-pasif')),
        ikonBtn('📁', 'Ses dosyası seç', () => sesDosyasiSec(o.key, () => guncelle(true))),
        klipVar ? ikonBtn('🗑', 'Kendi sesimi sil', async () => {
          if (!(await onayla('Bu cümle için kaydettiğiniz ses silinsin mi? Oyun yeniden bilgisayar sesiyle okur.', { evet: 'Sil', tehlike: true }))) return;
          await store.deleteClip(o.key);
          bildir('Ses silindi');
          guncelle(false);
        }) : null,
        o.duzenle ? ikonBtn('✏️', 'Cümleyi değiştir', o.duzenle) : null,
        ...(o.ekDugmeler || [])));
  };
  ciz();
  return satir;
}

function sayimlariGuncelle() {
  const sayfa = P?.icerik;
  if (!sayfa) return;
  for (const d of sayfa.querySelectorAll('details.ap-grup')) {
    const tum = d.querySelectorAll('.ap-ses-satir').length;
    const kayitli = d.querySelectorAll('.ap-ses-satir[data-klip="1"]').length;
    const el = d.querySelector('.ap-grup-sayi');
    if (el) el.textContent = `${kayitli}/${tum}`;
  }
  const top = sayfa.querySelector('.ap-sayim');
  if (top) {
    const n = new Set([...sayfa.querySelectorAll('.ap-ses-satir[data-klip="1"]')].map((x) => x.dataset.key)).size;
    top.textContent = n ? `${n} cümlede sizin sesiniz var.` : 'Henüz kendi sesinizle kayıt yok.';
  }
}

function grup(id, yazi, icerik, varsayilanAcik = false) {
  const acik = P.grupDurum.has(id) ? P.grupDurum.get(id) : varsayilanAcik;
  const d = h('details', { class: 'ap-grup', open: acik, dataset: { grup: id } },
    h('summary', {}, h('span', { class: 'ap-grup-ad' }, yazi), h('span', { class: 'ap-grup-sayi ap-soluk' })),
    h('div', { class: 'ap-grup-govde' }, icerik));
  d.addEventListener('toggle', () => { P?.grupDurum.set(id, d.open); });
  return d;
}

async function sesimCiz(s) {
  const klipler = new Set(await store.listClips());
  if (!P) return;
  const icerik = store.content();
  const taban = store.baseContent();
  const ozel = store.custom();
  const durumu = kayitDurumu();

  s.append(...baslik('Sesim', 'Oyunun söylediği her cümleyi kendi sesinizle kaydedin. Kayıt yoksa oyun bilgisayar sesiyle okur.'));
  if (durumu === 'guvenli-degil') s.append(h('div', { class: 'ap-not ap-uyari' }, '🔒 ', KAYIT_NOTU));
  else if (durumu === 'desteklenmiyor') s.append(h('div', { class: 'ap-not ap-uyari' }, 'Bu tarayıcı ses kaydını desteklemiyor. 📁 ile hazır bir ses dosyası seçebilir ya da başka cihazda kaydedip Dışa aktar ile taşıyabilirsiniz.'));
  s.append(h('p', { class: 'ap-soluk ap-kucuk' }, '▶ dinle · ⏺ kaydet (en çok 10 sn) · 📁 ses dosyası seç · 🗑 kendi sesini sil · ✏️ cümleyi değiştir'));

  const ara = girdi('', { type: 'search', placeholder: 'Cümle ara…', 'aria-label': 'Cümle ara', class: 'ap-girdi ap-ara' });
  s.append(ara, h('p', { class: 'ap-soluk ap-kucuk ap-sayim' }));

  // 1) Karşılama ve övgüler
  const genel = [];
  for (const { key, metin } of SABIT_SATIRLAR) {
    genel.push(sesSatiri({
      key, metin, klipVar: klipler.has(key),
      ipucu: key === 'hosgeldin' ? '{ad} yerine oynayan çocuğun adı söylenir; iki çocuk varsa adı söylemeden kaydedin ya da çocuğa özel satırı kullanın.' : '',
    }));
    if (key === 'hosgeldin') {
      for (const p of store.profiles()) {
        const k = 'hosgeldin:' + p.id;
        genel.push(sesSatiri({ key: k, metin: `Hoş geldin ${p.ad}!`, klipVar: klipler.has(k), ipucu: `Yalnız ${p.ad} için` }));
      }
    }
  }
  s.append(grup('genel', '👋 Karşılama ve övgüler', genel, true));

  // 2) Karakterler
  if (icerik.npcler.length) {
    s.append(h('h3', { class: 'ap-alt-baslik' }, 'Karakterler'));
    for (const n of icerik.npcler) {
      const alan = npcSatirAlani(n);
      const satirlar = Array.isArray(n[alan]) ? n[alan] : [];
      const tabanN = taban.npcler.find((x) => x.id === n.id);
      const tabanSatir = tabanN && Array.isArray(tabanN[alan]) ? tabanN[alan] : [];
      const degisen = ozel.npcSatirlari[n.id] || [];
      const satirElleri = satirlar.map((m, i) => {
        const key = `npc:${n.id}:${i}`;
        const varsayilan = tabanSatir[i] || '';
        return sesSatiri({
          key, metin: m, klipVar: klipler.has(key),
          ipucu: degisen[i] ? (varsayilan ? `Değiştirildi · varsayılan: “${varsayilan}”` : 'Sizin eklediğiniz cümle') : '',
          duzenle: () => npcSatirDuzenle(n, i, m, varsayilan),
        });
      });
      satirElleri.push(h('div', { class: 'ap-satir' }, btn('+ Cümle ekle', () => npcSatirDuzenle(n, satirlar.length, '', ''))));
      const ad = `${n.ikon || n.emoji || '🙂'} ${n.ad || n.id}${n.rol ? ' · ' + n.rol : ''}`;
      s.append(grup('npc:' + n.id, ad, satirElleri));
    }
  }

  // 3) Bulmaca soruları
  if (icerik.bulmacalar.length) {
    s.append(h('h3', { class: 'ap-alt-baslik' }, 'Bulmaca soruları'));
    const gruplar = new Map();
    for (const b of icerik.bulmacalar) {
      const a = ALAN_ADI[b.alan] ? b.alan : 'diger';
      if (!gruplar.has(a)) gruplar.set(a, []);
      const key = 'bulmaca:' + b.id;
      gruplar.get(a).push(sesSatiri({
        key, metin: b.soru || b.soru_sesli || '', klipVar: klipler.has(key),
        etiket: b.ozel ? 'Benim' : '', ara: b.id,
      }));
    }
    for (const [a, satirlar] of gruplar) s.append(grup('bulmaca:' + a, `🧩 ${ALAN_ADI[a] || 'Diğer'}`, satirlar));
  }

  // 4) Aile mesajları
  const mesajlar = icerik.aileMesajlari.map((m) => {
    const key = m.sesKey || 'mesaj:' + m.id;
    return sesSatiri({ key, metin: m.metin, etiket: m.kimden, klipVar: klipler.has(key) });
  });
  s.append(h('h3', { class: 'ap-alt-baslik' }, 'Aile mesajları'));
  if (mesajlar.length) s.append(grup('mesajlar', '💌 Aile mesajları', mesajlar, true));
  else s.append(h('p', { class: 'ap-soluk' }, 'Henüz aile mesajı yok. “Aile” sekmesinden ekleyebilirsiniz.'));

  ara.addEventListener('input', () => {
    const q = ara.value.trim().toLocaleLowerCase('tr');
    for (const r of s.querySelectorAll('.ap-ses-satir')) r.hidden = !!q && !r.dataset.ara.includes(q);
    for (const d of s.querySelectorAll('details.ap-grup')) {
      const gorunen = d.querySelector('.ap-ses-satir:not([hidden])');
      d.hidden = !!q && !gorunen;
      if (q && gorunen) d.open = true;
    }
  });
  sayimlariGuncelle();
}

async function npcSatirDuzenle(n, i, mevcut, varsayilan) {
  const c = store.custom();
  const arr = [...(c.npcSatirlari[n.id] || [])];
  const r = await metinSor({
    baslik: `${n.ad || n.id} · ${i + 1}. cümle`,
    deger: mevcut,
    ipucu: varsayilan ? `Varsayılan: “${varsayilan}”. Kısa tutun (en çok 10 kelime).` : 'Yeni cümle. Kısa tutun (en çok 10 kelime).',
    varsayilanVar: !!arr[i] && !!varsayilan,
  });
  if (!r || !P) return;
  while (arr.length <= i) arr.push('');
  arr[i] = r.varsayilan || r.metin === varsayilan ? '' : r.metin;
  c.npcSatirlari[n.id] = arr;
  await store.saveCustom(c);
  bildir(r.varsayilan ? 'Varsayılan cümleye dönüldü' : 'Cümle kaydedildi ✓');
  P.grupDurum.set('npc:' + n.id, true);
  yenidenCiz();
}

// ================================================================ sekme: Aile

async function aileCiz(s) {
  const klipler = new Set(await store.listClips());
  if (!P) return;
  const c = store.custom();
  s.append(...baslik('Aile', 'Mesajlar, çocuk yıldız kazandığında sesli söylenir. Fotoğraflar evdeki resim çerçevelerinde görünür.'));

  // --- mesajlar
  const bolum = h('section', { class: 'ap-bolum' }, h('h3', { class: 'ap-alt-baslik' }, '💌 Aile mesajları'));
  if (!c.aileMesajlari.length) {
    bolum.append(h('p', { class: 'ap-soluk' }, 'Henüz mesaj yok. Örnek: “Aferin oğlum, seninle gurur duyuyorum!”'));
  }
  for (const m of c.aileMesajlari) {
    bolum.append(h('div', { class: 'ap-kart ap-mesaj', dataset: { id: m.id } }, sesSatiri({
      key: m.sesKey, metin: m.metin, etiket: m.kimden, klipVar: klipler.has(m.sesKey),
      ekDugmeler: [
        ikonBtn('✏️', 'Mesajı düzenle', () => {
          P.mesajForm = { id: m.id, kimden: m.kimden, metin: m.metin };
          yenidenCiz('.ap-mesaj-form');
        }),
        ikonBtn('✖', 'Mesajı sil', async () => {
          if (!(await onayla(`“${m.metin}” mesajı silinsin mi? Kaydettiğiniz sesi de silinir.`, { evet: 'Sil', tehlike: true }))) return;
          const c2 = store.custom();
          c2.aileMesajlari = c2.aileMesajlari.filter((x) => x.id !== m.id);
          await store.saveCustom(c2);
          bildir('Mesaj silindi');
          yenidenCiz();
        }, 'ap-tehlike-cizgi'),
      ],
    })));
  }
  bolum.append(mesajFormu(P.mesajForm || { kimden: 'Baba', metin: '' }));
  s.append(bolum);

  // --- fotoğraflar
  const fb = h('section', { class: 'ap-bolum' },
    h('h3', { class: 'ap-alt-baslik' }, '🖼️ Aile fotoğrafları'),
    h('p', { class: 'ap-soluk' }, `Evdeki çerçevelerde görünür. Küçültülerek yalnız bu cihazda saklanır (en çok ${MAKS_FOTO}).`));
  const dolu = c.fotolar.length >= MAKS_FOTO;
  fb.append(h('div', { class: 'ap-satir ap-sar' }, ...fotoSecici({
    coklu: true,
    pasif: dolu,
    onSec: async (dataURL) => {
      const c2 = store.custom();
      if (c2.fotolar.length >= MAKS_FOTO) { bildir(`En çok ${MAKS_FOTO} fotoğraf eklenebilir.`, 'hata'); return; }
      c2.fotolar.push({ id: yeniId('f'), dataURL });
      await store.saveCustom(c2);
      bildir('Fotoğraf eklendi ✓');
      yenidenCiz();
    },
  })));
  if (c.fotolar.length) {
    fb.append(h('div', { class: 'ap-foto-izgara' }, c.fotolar.map((f) => h('div', { class: 'ap-foto', dataset: { id: f.id } },
      h('img', { src: f.dataURL, alt: 'Aile fotoğrafı', loading: 'lazy' }),
      ikonBtn('🗑', 'Fotoğrafı sil', async () => {
        if (!(await onayla('Bu fotoğraf silinsin mi?', { evet: 'Sil', tehlike: true }))) return;
        const c2 = store.custom();
        c2.fotolar = c2.fotolar.filter((x) => x.id !== f.id);
        await store.saveCustom(c2);
        bildir('Fotoğraf silindi');
        yenidenCiz();
      }, 'ap-foto-sil')))));
  } else {
    fb.append(h('p', { class: 'ap-soluk' }, 'Henüz fotoğraf yok.'));
  }
  s.append(fb);
}

function mesajFormu(f) {
  const hazir = KIMDEN.includes(f.kimden);
  const sec = secimKutusu([...KIMDEN, 'Diğer'].map((k) => [k, k === 'Diğer' ? 'Diğer…' : k]), hazir ? f.kimden : 'Diğer', (v) => {
    serbest.hidden = v !== 'Diğer';
    if (!serbest.hidden) serbest.focus();
  });
  sec.setAttribute('aria-label', 'Kimden');
  const serbest = girdi(hazir ? '' : f.kimden, { maxlength: 30, placeholder: 'Örn. Teyze, Amca, Abla', 'aria-label': 'Kimden (serbest)', hidden: hazir });
  const ta = girdi(f.metin, { tag: 'textarea', maxlength: 200, rows: 3, placeholder: 'Örn. Aferin oğlum, seninle gurur duyuyorum!' });
  const sayac = h('small', { class: 'ap-soluk ap-sayac' });
  const say = () => { sayac.textContent = `${ta.value.length}/200`; };
  ta.addEventListener('input', say);
  say();
  const hata = h('p', { class: 'ap-hata', hidden: true });
  const kaydet = async () => {
    const metin = ta.value.trim();
    if (!metin) { hata.textContent = 'Mesajı yazın.'; hata.hidden = false; ta.focus(); return; }
    const kimden = sec.value === 'Diğer' ? (serbest.value.trim() || 'Aile') : sec.value;
    const c = store.custom();
    const i = f.id ? c.aileMesajlari.findIndex((m) => m.id === f.id) : -1;
    if (i >= 0) Object.assign(c.aileMesajlari[i], { kimden, metin });
    else c.aileMesajlari.push({ id: yeniId('m'), kimden, metin });
    await store.saveCustom(c);
    P.mesajForm = null;
    bildir('Mesaj kaydedildi ✓ — kendi sesinizle de kaydedebilirsiniz (⏺)');
    yenidenCiz();
  };
  return h('div', { class: 'ap-kart ap-form ap-mesaj-form' },
    h('h3', { class: 'ap-modal-baslik' }, f.id ? 'Mesajı düzenle' : 'Yeni mesaj'),
    alanKutu('Kimden', h('div', { class: 'ap-satir ap-sar' }, sec, serbest)),
    alanEtiket('Mesaj (sesli okunur)', ta),
    sayac,
    hata,
    h('div', { class: 'ap-satir ap-sag ap-sar' },
      btn('▶ Dinle', () => dinle(null, ta.value)),
      f.id ? btn('Vazgeç', () => { P.mesajForm = null; yenidenCiz(); }) : null,
      btn(f.id ? 'Kaydet' : 'Mesajı ekle', kaydet, 'ap-birincil')));
}

// ================================================================ sekme: Bulmacalarım

function bosTaslak(tur, onceki = {}) {
  const ortak = { id: onceki.id, alan: onceki.alan || 'aile', soru: '', odul: onceki.odul || '' };
  if (tur === 'say') return { ...ortak, tur: 'say', ikon: '🍎', adet: 3, secenekler: [2, 3, 4] };
  return {
    ...ortak, tur: 'sec',
    secenekler: [
      { ikon: '🍎', renk: '', dogru: true, ses: '' },
      { ikon: '🍌', renk: '', dogru: false, ses: '' },
    ],
  };
}

function taslakYap(b) {
  const t = JSON.parse(JSON.stringify(b));
  t.odul = t.odul || '';
  t.soru = t.soru || '';
  if (t.tur === 'say') {
    t.secenekler = Array.isArray(t.secenekler) ? t.secenekler : sayiSecenekleri(t.adet || 3);
  } else {
    t.tur = 'sec';
    t.secenekler = (t.secenekler || []).map((o) => ({ ikon: o.ikon || '', renk: o.renk || '', dogru: !!o.dogru, ses: o.ses || '' }));
  }
  return t;
}

function sayiSecenekleri(n) {
  if (n <= 1) return [1, 2, 3];
  if (n >= 10) return [8, 9, 10];
  return [n - 1, n, n + 1];
}

function bulmacaIkonlari(b) {
  if (b.tur === 'say') return h('span', { class: 'ap-bulmaca-say' }, `${b.ikon || '❓'} × ${b.adet}`);
  return (b.secenekler || []).map((o) => h('span', {
    class: 'ap-mini-ikon' + (o.dogru ? ' dogru' : ''),
    style: o.renk ? { '--bg': o.renk } : null,
  }, o.ikon));
}

function bulmacaCiz(s) {
  if (P.taslak) return bulmacaEditor(s, P.taslak);
  const c = store.custom();
  s.append(...baslik('Bulmacalarım', 'Kendi sorularınızı hazırlayın. Oyunda seçtiğiniz bölgede, diğer bulmacaların arasında çıkar.'));
  s.append(h('div', { class: 'ap-satir ap-sar' },
    btn('+ Seçmeli bulmaca', () => { P.taslak = bosTaslak('sec'); yenidenCiz(); }, 'ap-birincil'),
    btn('+ Sayma bulmacası', () => { P.taslak = bosTaslak('say'); yenidenCiz(); }, 'ap-birincil')));
  if (!c.bulmacalar.length) {
    s.append(h('p', { class: 'ap-soluk' }, 'Henüz bulmaca yok. Örnek: “Dedenin arabası hangisi?” → 🚗 🚌 🚲'));
    return;
  }
  const liste = h('div', { class: 'ap-liste' });
  for (const b of c.bulmacalar) {
    liste.append(h('div', { class: 'ap-kart ap-bulmaca-kart', dataset: { id: b.id } },
      h('div', { class: 'ap-bulmaca-ikonlar' }, bulmacaIkonlari(b)),
      h('div', { class: 'ap-bulmaca-bilgi' },
        h('strong', {}, b.soru || '(soru yok)'),
        h('div', { class: 'ap-soluk ap-kucuk' }, `${ALAN_ADI[b.alan] || b.alan} · ${b.tur === 'say' ? 'Sayma' : 'Seçmeli'}`)),
      h('div', { class: 'ap-dugmeler' },
        btn('👁 Önizle', () => onizle(b)),
        btn('Düzenle', () => { P.taslak = taslakYap(b); yenidenCiz(); }),
        btn('Sil', async () => {
          if (!(await onayla(`“${b.soru}” bulmacası silinsin mi?`, { evet: 'Sil', tehlike: true }))) return;
          const c2 = store.custom();
          c2.bulmacalar = c2.bulmacalar.filter((x) => x.id !== b.id);
          await store.saveCustom(c2);
          bildir('Bulmaca silindi');
          yenidenCiz();
        }, 'ap-tehlike-cizgi'))));
  }
  s.append(liste);
}

function emojiAlani(deger, onDegis, renk = '') {
  const dugme = h('button', {
    type: 'button', class: 'ap-emoji-btn', style: { '--bg': renk || '#f1ede6' }, 'aria-label': 'Emoji seç', title: 'Emoji seç',
    onclick: async () => {
      const e = await emojiSec();
      if (!e) return;
      dugme.textContent = e;
      yazi.value = e;
      onDegis(e);
    },
  }, deger || '❓');
  const yazi = girdi(deger, { maxlength: 16, class: 'ap-girdi ap-emoji-girdi', 'aria-label': 'Emoji ya da kısa yazı', placeholder: '🙂' });
  yazi.addEventListener('input', () => {
    const v = yazi.value.trim();
    dugme.textContent = v || '❓';
    onDegis(v);
  });
  return { dugme, yazi };
}

function secenekKarti(t, o, i, ciz) {
  const { dugme, yazi } = emojiAlani(o.ikon, (v) => { o.ikon = v; }, o.renk);
  const dogru = h('input', { type: 'checkbox', checked: !!o.dogru });
  const kart = h('div', { class: 'ap-secenek' + (o.dogru ? ' dogru' : '') });
  dogru.addEventListener('change', () => { o.dogru = dogru.checked; kart.classList.toggle('dogru', o.dogru); });
  const ses = girdi(o.ses, { maxlength: 100, placeholder: 'Dokununca söylenecek (isteğe bağlı), örn. Kırmızı balon', 'aria-label': 'Dokununca söylenecek' });
  ses.addEventListener('input', () => { o.ses = ses.value; });
  kart.append(
    h('div', { class: 'ap-secenek-ust' },
      h('strong', { class: 'ap-secenek-no' }, `${i + 1}.`),
      dugme, yazi,
      h('label', { class: 'ap-dogru-etiket' }, dogru, h('span', {}, 'Doğru cevap')),
      t.secenekler.length > 2 ? ikonBtn('✖', 'Seçeneği kaldır', () => { t.secenekler.splice(i, 1); ciz(); }, 'ap-tehlike-cizgi') : null),
    h('div', { class: 'ap-secenek-renk' },
      h('span', { class: 'ap-soluk ap-kucuk' }, 'Arka renk:'),
      renkSecici(o.renk, (r) => { o.renk = r; dugme.style.setProperty('--bg', r || '#f1ede6'); }, { bosSecenek: true })),
    ses);
  return kart;
}

function secAlanlari(t) {
  const kutu = h('div', { class: 'ap-secenekler' });
  const ciz = () => {
    kutu.replaceChildren(
      h('div', { class: 'ap-etiket' }, `Seçenekler (${t.secenekler.length}/4) — doğru olan(lar)ı işaretleyin`),
      ...t.secenekler.map((o, i) => secenekKarti(t, o, i, ciz)),
      t.secenekler.length < 4
        ? btn('+ Seçenek ekle', () => { t.secenekler.push({ ikon: '⭐', renk: '', dogru: false, ses: '' }); ciz(); })
        : null);
  };
  ciz();
  return kutu;
}

function sayAlanlari(t) {
  const { dugme, yazi } = emojiAlani(t.ikon, (v) => { t.ikon = v; });
  const adet = secimKutusu(Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]), String(t.adet), (v) => {
    t.adet = parseInt(v, 10);
    t.secenekler = sayiSecenekleri(t.adet);
    sayilariCiz();
  });
  adet.classList.add('ap-kisa');
  const sayilar = h('div', { class: 'ap-satir' });
  const sayilariCiz = () => sayilar.replaceChildren(...t.secenekler.map((n, i) => {
    const g = girdi(String(n), { type: 'number', min: 1, max: 10, inputmode: 'numeric', class: 'ap-girdi ap-sayi', 'aria-label': `${i + 1}. sayı seçeneği` });
    g.addEventListener('input', () => { t.secenekler[i] = parseInt(g.value, 10); });
    return g;
  }));
  sayilariCiz();
  return h('div', { class: 'ap-say-alanlari' },
    alanKutu('Ne sayılacak?', h('div', { class: 'ap-satir' }, dugme, yazi)),
    alanEtiket('Kaç tane?', adet),
    alanKutu('Sayı seçenekleri (biri doğru sayı olmalı)', sayilar));
}

function dogrula(t) {
  const soru = (t.soru || '').trim();
  const def = { id: t.id || yeniId('ozel'), alan: t.alan, tur: t.tur, soru, ozel: true };
  if (t.tur === 'say') {
    const ikon = (t.ikon || '').trim();
    if (!ikon) return { hata: 'Sayılacak emojiyi seçin.' };
    const sec = t.secenekler.map((n) => parseInt(n, 10));
    if (sec.length !== 3 || sec.some((n) => !(n >= 1 && n <= 10))) return { hata: 'Üç sayı seçeneği 1 ile 10 arasında olmalı.' };
    if (new Set(sec).size !== sec.length) return { hata: 'Sayı seçenekleri birbirinden farklı olmalı.' };
    if (!sec.includes(t.adet)) return { hata: `Seçeneklerden biri doğru sayı (${t.adet}) olmalı.` };
    Object.assign(def, { soru: soru || 'Kaç tane var? Haydi sayalım!', ikon, adet: t.adet, secenekler: sec });
  } else {
    if (!soru) return { hata: 'Soruyu yazın; oyun bunu sesli okur.' };
    const sec = t.secenekler.map((o) => ({ ...o, ikon: (o.ikon || '').trim() }));
    if (sec.length < 2) return { hata: 'En az 2 seçenek gerekli.' };
    if (sec.some((o) => !o.ikon)) return { hata: 'Her seçeneğe bir emoji seçin.' };
    if (!sec.some((o) => o.dogru)) return { hata: 'En az bir seçeneği “Doğru cevap” olarak işaretleyin.' };
    if (sec.every((o) => o.dogru)) return { hata: 'En az bir yanlış seçenek olmalı.' };
    def.secenekler = sec.map((o) => {
      const x = { ikon: o.ikon, dogru: !!o.dogru };
      if (o.renk) x.renk = o.renk;
      if ((o.ses || '').trim()) x.ses = o.ses.trim();
      return x;
    });
  }
  const odul = (t.odul || '').trim();
  if (odul) def.odul = odul;
  return { def };
}

function bulmacaEditor(s, t) {
  const hata = h('p', { class: 'ap-hata', hidden: true });
  const hataGoster = (m) => { hata.textContent = m; hata.hidden = false; hata.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const geri = () => { P.taslak = null; yenidenCiz(); };
  const turSec = h('div', { class: 'ap-secim', role: 'radiogroup' },
    [['sec', 'Seçmeli: doğruya dokun'], ['say', 'Sayma: kaç tane?']].map(([v, ad]) => h('button', {
      type: 'button', class: 'ap-secim-btn' + (t.tur === v ? ' secili' : ''), 'aria-pressed': String(t.tur === v),
      onclick: () => { if (t.tur !== v) { P.taslak = bosTaslak(v, t); yenidenCiz(); } },
    }, ad)));
  const alanSec = secimKutusu(ALANLAR, t.alan, (v) => { t.alan = v; });
  const soru = girdi(t.soru, {
    maxlength: 200, 'aria-label': 'Soru',
    placeholder: t.tur === 'say' ? 'Kaç tane elma var? Haydi sayalım!' : 'Örn. Kırmızı balonu bul!',
  });
  soru.addEventListener('input', () => { t.soru = soru.value; });
  const odul = girdi(t.odul, { maxlength: 200, placeholder: 'Örn. Aferin! Doğru buldun!' });
  odul.addEventListener('input', () => { t.odul = odul.value; });
  const kaydet = async () => {
    const r = dogrula(t);
    if (r.hata) return hataGoster(r.hata);
    const c = store.custom();
    const i = c.bulmacalar.findIndex((b) => b.id === r.def.id);
    if (i >= 0) c.bulmacalar[i] = r.def; else c.bulmacalar.push(r.def);
    await store.saveCustom(c);
    P.taslak = null;
    bildir('Bulmaca kaydedildi ✓');
    yenidenCiz();
  };
  s.append(
    h('div', { class: 'ap-satir ap-arasi' },
      h('h2', { class: 'ap-baslik' }, t.id ? 'Bulmacayı düzenle' : 'Yeni bulmaca'),
      btn('← Listeye dön', geri)),
    h('div', { class: 'ap-kart ap-form ap-bulmaca-form' },
      alanKutu('Tür', turSec),
      alanEtiket('Bölge', alanSec, 'Bulmaca oyunda bu bölgede çıkar.'),
      alanKutu('Soru (sesli okunur)', h('div', { class: 'ap-satir' }, soru,
        ikonBtn('▶', 'Soruyu dinle', () => dinle(null, t.soru || soru.placeholder.replace(/^Örn\. /, ''))))),
      t.tur === 'say' ? sayAlanlari(t) : secAlanlari(t),
      alanEtiket('Ödül sözü (isteğe bağlı)', odul, 'Doğru cevapta söylenir. Boşsa oyun kendi övgüsünü söyler.'),
      hata,
      h('div', { class: 'ap-satir ap-sag ap-sar' },
        btn('Vazgeç', geri),
        btn('👁 Önizle', () => {
          const r = dogrula(t);
          if (r.hata) return hataGoster(r.hata);
          hata.hidden = true;
          onizle(r.def);
        }),
        btn('Kaydet', kaydet, 'ap-birincil'))));
}

async function onizle(def) {
  if (!P) return;
  let mod;
  try {
    mod = await import('../puzzles/index.js');
  } catch (e) {
    console.warn('[panel] bulmaca modülü yüklenemedi:', e);
    bildir('Bulmaca ekranı henüz hazır değil (js/puzzles/index.js yüklenemedi).', 'hata');
    return;
  }
  if (!P) return;
  if (typeof mod.openPuzzle !== 'function') { bildir('Bulmaca ekranı openPuzzle sunmuyor.', 'hata'); return; }
  const s = P;
  // Paneli geçici olarak #overlay'den çıkar: bulmaca ekranı aynı katmanı kullanır.
  s.kok.remove();
  const ctx = {
    speak: typeof s.ctx.speak === 'function' ? s.ctx.speak : (m, o = {}) => yedekKonus(m, o.key),
    sfx: s.ctx.sfx || { play() {}, unlock() {}, music() {}, setVolume() {} },
    childName: aktifAd(),
    onClose: () => {},
  };
  try {
    await mod.openPuzzle(JSON.parse(JSON.stringify(def)), ctx);
  } catch (e) {
    console.warn('[panel] önizleme:', e);
    if (P) setTimeout(() => bildir('Önizleme hatası: ' + (e?.message || e), 'hata'), 50);
  } finally {
    if (P === s) {
      s.ov.el.append(s.kok);
      s.ov.goster();
    }
  }
}

// ================================================================ sekme: Kıyafetler

// Ebeveyn çocuğun gerçek kıyafetini fotoğraflar; oyundaki gardıropta ayıya giydirilir.
// Fotoğraf ortadan kare kırpılır, 256×256 JPEG (kalite 0.8) olarak store.addShirt ile saklanır.
function kiyafetCiz(s) {
  const liste = store.shirts();
  const dolu = liste.length >= MAKS_KIYAFET;
  s.append(...baslik('Kıyafetler',
    'Çocuğunuzun gerçek kıyafetlerini fotoğraflayın; oyundaki dolapta ayısına giydirebilir. ' +
    'Gömleği düz bir yere serip fotoğrafın tamamını kaplayacak kadar yakından çekin: ' +
    'ayının gömleği fotoğrafın kenar rengini alır, ortadaki kare ise göbeğine baskı olur.'));
  s.append(h('div', { class: 'ap-satir ap-sar' }, ...fotoSecici({
    kare: true, max: 256, kalite: 0.8, pasif: dolu,
    yazilar: ['📷 Gömlek fotoğrafı çek', '🖼️ Galeriden seç'],
    onSec: async (dataURL) => {
      if (store.shirts().length >= MAKS_KIYAFET) { bildir(`En çok ${MAKS_KIYAFET} kıyafet eklenebilir.`, 'hata'); return; }
      await store.addShirt(dataURL);
      bildir('Gömlek eklendi ✓ Oyundaki dolapta görünür.');
      yenidenCiz();
    },
  })));
  s.append(h('p', { class: 'ap-soluk ap-kucuk' }, `${liste.length}/${MAKS_KIYAFET} kıyafet · yalnız bu cihazda saklanır, Kayıt sekmesindeki yedeğe dahildir.`));
  if (!liste.length) {
    s.append(h('p', { class: 'ap-soluk' }, 'Henüz kıyafet yok. “Gömlek fotoğrafı çek” düğmesi telefonda kamerayı açar.'));
    return;
  }
  s.append(h('div', { class: 'ap-foto-izgara' }, liste.map((k) => h('div', { class: 'ap-foto', dataset: { id: k.id } },
    h('img', { src: store.getShirt(k.id), alt: 'Gömlek', loading: 'lazy' }),
    ikonBtn('🗑', 'Kıyafeti sil', async () => {
      if (!(await onayla('Bu kıyafet silinsin mi? Giyen çocuğun ayısı gömleksiz kalır.', { evet: 'Sil', tehlike: true }))) return;
      await store.removeShirt(k.id);
      bildir('Kıyafet silindi');
      yenidenCiz();
    }, 'ap-foto-sil')))));
}

// ================================================================ sekme: Kayıt

function bugun() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function boyutYaz(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB`;
  return `${(n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

function yedekSayilari(v) {
  const o = v?.ozel || {};
  return {
    cocuk: Array.isArray(v?.profiller) ? v.profiller.length : 0,
    bulmaca: o.bulmacalar?.length || 0,
    mesaj: o.aileMesajlari?.length || 0,
    foto: o.fotolar?.length || 0,
    kiyafet: o.kiyafetler?.length || 0,
    satir: Object.keys(o.npcSatirlari || {}).length,
    ses: Object.keys(v?.sesler || {}).length,
    icerikVar: !!v?.ozel,
  };
}

function indir(blob, ad) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: ad, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function paylasilabilir(file) {
  try { return !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
  catch (_) { return false; }
}

function kayitCiz(s) {
  s.append(...baslik('Kayıt ve yedek', 'Her şey yalnız bu cihazda durur. Başka telefona taşımak ya da güvene almak için yedek alın.'));

  if (!store.isPersistent()) {
    s.append(h('div', { class: 'ap-not ap-uyari' }, '⚠️ Bu tarayıcıda kalıcı kayıt yapılamıyor (gizli sekme olabilir). Sayfa kapanınca değişiklikler kaybolur; önce yedek alın.'));
  }

  // --- dışa aktar
  const sonuc = h('div', { class: 'ap-sonuc' });
  const hazirla = btn('Yedek hazırla', async () => {
    hazirla.disabled = true;
    hazirla.textContent = 'Hazırlanıyor…';
    try {
      const json = await store.exportAll();
      if (!P) return;
      const ad = `ayi-macerasi-yedek-${bugun()}.json`;
      const blob = new Blob([json], { type: 'application/json' });
      let file = null;
      try { file = new File([blob], ad, { type: 'application/json' }); } catch (_) {}
      const say = yedekSayilari(JSON.parse(json));
      sonuc.replaceChildren(
        h('p', { class: 'ap-yedek-ad' }, `✓ ${ad} · ${boyutYaz(blob.size)}`),
        h('p', { class: 'ap-soluk ap-kucuk' },
          `${say.cocuk} çocuk · ${say.ses} ses kaydı · ${say.bulmaca} bulmaca · ${say.mesaj} mesaj · ${say.foto} fotoğraf · ${say.kiyafet} kıyafet · ${say.satir} karakterde değişen cümle`),
        h('div', { class: 'ap-satir ap-sar' },
          btn('⬇️ Dosyayı indir', () => indir(blob, ad), 'ap-birincil'),
          paylasilabilir(file)
            ? btn('📤 Paylaş (WhatsApp, AirDrop…)', () => {
              navigator.share({ files: [file], title: 'Ayıcık Mahallede yedeği' })
                .catch((e) => { if (e?.name !== 'AbortError') bildir('Paylaşılamadı: ' + (e?.message || ''), 'hata'); });
            })
            : null));
    } catch (e) {
      bildir('Yedek hazırlanamadı: ' + (e?.message || e), 'hata');
    } finally {
      hazirla.disabled = false;
      hazirla.textContent = 'Yedeği yeniden hazırla';
    }
  }, 'ap-birincil');
  s.append(h('section', { class: 'ap-kart ap-bolum' },
    h('h3', { class: 'ap-alt-baslik' }, '⬆️ Dışa aktar (yedek al)'),
    h('p', { class: 'ap-soluk' }, 'Çocuklar, ilerleme, kendi sesleriniz, bulmacalar, aile mesajları, fotoğraflar ve kıyafetler tek bir .json dosyasına yazılır.'),
    hazirla, sonuc));

  // --- içe aktar
  const iceSonuc = h('div', { class: 'ap-sonuc' });
  const sec = btn('Yedek dosyası seç', () => {
    const inp = gizliDosya('.json,application/json,text/plain');
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      let metin, veri;
      try {
        metin = f.text ? await f.text() : await new Response(f).text();
        veri = JSON.parse(metin);
      } catch (_) {
        bildir('Dosya okunamadı: geçerli bir yedek dosyası değil.', 'hata');
        return;
      }
      if (!veri || typeof veri !== 'object' || (veri.uygulama && veri.uygulama !== 'ayi-macerasi')) {
        bildir('Bu dosya bir Ayıcık Mahallede yedeği değil.', 'hata');
        return;
      }
      iceAktarSecenekleri(iceSonuc, metin, veri);
    });
    inp.click();
  });
  s.append(h('section', { class: 'ap-kart ap-bolum' },
    h('h3', { class: 'ap-alt-baslik' }, '⬇️ İçe aktar (yedekten yükle)'),
    h('p', { class: 'ap-soluk' }, 'Başka cihazdan aldığınız yedeği yükleyin. Hangi bölümlerin yükleneceğini seçebilirsiniz.'),
    sec, iceSonuc));

  // --- ilerleme sıfırlama
  const profiller = store.profiles();
  const sifir = h('section', { class: 'ap-kart ap-bolum' },
    h('h3', { class: 'ap-alt-baslik' }, '↺ İlerlemeyi sıfırla'),
    h('p', { class: 'ap-soluk' }, 'Altınlar, yıldızlar, çözülen bulmacalar ve kostümler sıfırlanır. Çocuğun adı ve fotoğrafı kalır.'));
  if (!profiller.length) sifir.append(h('p', { class: 'ap-soluk' }, 'Henüz çocuk yok.'));
  for (const p of profiller) {
    const il = store.progressOf(p.id);
    sifir.append(h('div', { class: 'ap-cocuk ap-cocuk-satir', dataset: { id: p.id } },
      avatar(p),
      h('div', { class: 'ap-cocuk-bilgi' },
        h('strong', {}, p.ad),
        h('div', { class: 'ap-soluk ap-kucuk' }, `🪙 ${il.altin} · ⭐ ${Object.keys(il.yildiz).length} · 🧩 ${Object.keys(il.cozulen).length} · 👕 ${il.kostumler.length}`)),
      btn('Sıfırla', async () => {
        if (!(await onayla(`${p.ad} için ilerleme sıfırlansın mı? Bu geri alınamaz.`, { evet: 'Sıfırla', tehlike: true }))) return;
        store.resetProgress(p.id);
        bildir(`${p.ad} için ilerleme sıfırlandı`);
        yenidenCiz();
      }, 'ap-tehlike-cizgi')));
  }
  s.append(sifir);

  // --- depolama notu
  const bilgi = h('p', { class: 'ap-soluk ap-kucuk' });
  s.append(h('section', { class: 'ap-not' },
    h('strong', {}, 'iPhone için önemli: '),
    'Oyunu Safari’de Paylaş → “Ana Ekrana Ekle” ile açın. Safari, ana ekrana eklenmemiş sitelerin verisini bir süre kullanılmazsa silebilir. Ses kaydettikten sonra yedek almayı alışkanlık edinin.',
    bilgi));
  (async () => {
    try {
      const e = await navigator.storage?.estimate?.();
      const kalici = await navigator.storage?.persisted?.();
      const parca = [];
      if (e?.usage != null) parca.push(`Kullanılan alan: ${boyutYaz(e.usage)}`);
      if (kalici != null) parca.push(kalici ? 'Tarayıcı kalıcı depolama izni verdi.' : 'Tarayıcı kalıcı depolama izni vermedi; düzenli yedek alın.');
      bilgi.textContent = parca.join(' · ');
    } catch (_) { /* önemli değil */ }
  })();
}

function iceAktarSecenekleri(kutu, metin, veri) {
  const say = yedekSayilari(veri);
  const kutucuk = (yazi, var_) => {
    const i = h('input', { type: 'checkbox', checked: var_, disabled: !var_ });
    return [i, h('label', { class: 'ap-onay' + (var_ ? '' : ' ap-pasif') }, i, h('span', {}, yazi))];
  };
  const [c1, l1] = kutucuk(`Çocuklar ve ilerleme (${say.cocuk} çocuk) — bu cihazdaki çocukların yerine geçer`, say.cocuk > 0);
  const [c2, l2] = kutucuk(`Bulmacalar, aile mesajları, fotoğraflar, kıyafetler, değişen cümleler (${say.bulmaca} bulmaca, ${say.mesaj} mesaj, ${say.foto} fotoğraf, ${say.kiyafet} kıyafet) — bu cihazdakilerin yerine geçer`, say.icerikVar);
  const [c3, l3] = kutucuk(`Kendi sesleriniz (${say.ses} kayıt) — eklenir; aynı cümlenin eski kaydı değişir`, say.ses > 0);
  const tarih = veri.tarih ? new Date(veri.tarih).toLocaleString('tr-TR') : 'bilinmiyor';
  const yukle = btn('İçe aktar', async () => {
    const secim = { cocuklar: c1.checked, icerik: c2.checked, sesler: c3.checked };
    if (!secim.cocuklar && !secim.icerik && !secim.sesler) { bildir('En az bir bölüm seçin.', 'hata'); return; }
    if (!(await onayla('Seçtiğiniz bölümler bu cihaza yüklensin mi? Değişen bilgiler geri alınamaz.', { evet: 'Yükle' }))) return;
    yukle.disabled = true;
    yukle.textContent = 'Yükleniyor…';
    try {
      await store.importAll(metin, secim);
      bildir('Yedek yüklendi ✓');
      altBaslikGuncelle();
      yenidenCiz();
    } catch (e) {
      bildir(e?.message || 'Yedek yüklenemedi.', 'hata');
      yukle.disabled = false;
      yukle.textContent = 'İçe aktar';
    }
  }, 'ap-birincil');
  kutu.replaceChildren(
    h('p', {}, `Yedek tarihi: ${tarih}`),
    l1, l2, l3,
    h('div', { class: 'ap-satir ap-sar' }, yukle, btn('Vazgeç', () => kutu.replaceChildren())));
}
