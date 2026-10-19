// Ayıcık Mahallede — kayıt katmanı.
// Küçük durum (profiller, ilerleme, ebeveyn eklemeleri) → localStorage (`ayi:` önekli).
// Büyük veri (ses klipleri, fotoğraflar) → IndexedDB `ayi-macerasi` (`sesler`, `fotolar`).
// Kıyafet fotoğrafları da `fotolar` deposunda, `kiyafet:<id>` anahtarıyla durur (listesi ozel.kiyafetler'de).
// Depolama yoksa (Safari gizli mod, kota, eski tarayıcı) bellekte çalışır; oyun asla çökmez.

const ON = 'ayi:';
const DB_ADI = 'ayi-macerasi';
const DB_SURUM = 1;
const SES = 'sesler';
const FOTO = 'fotolar';

/** Oyunun sabit konuşma satırları (panel listeler; çekirdek aynı metni kullanabilir). */
export const SABIT_SATIRLAR = [
  { key: 'hosgeldin', metin: 'Hoş geldin {ad}!' },
  { key: 'aferin-1', metin: 'Aferin sana!' },
  { key: 'aferin-2', metin: 'Harikasın!' },
  { key: 'aferin-3', metin: 'Çok güzel yaptın!' },
  { key: 'tekrar', metin: 'Bir daha deneyelim!' },
];

const BULMACA_TURLERI = ['sec', 'say', 'sirala', 'esles', 'hafiza'];
const KIYAFET_TURLERI = ['gomlek'];
const ALANLAR = ['aile', 'okul', 'din', 'kultur'];

// ---------------------------------------------------------------- yardımcılar

const metin = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const nesneMi = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const kopya = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
export function yeniId(onek = 'x') {
  return `${onek}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function bosIcerik() {
  return { npcler: [], gorevler: [], bulmacalar: [], aileMesajlari: [], fotolar: [] };
}
function bosOzel() {
  return { v: 1, bulmacalar: [], npcSatirlari: {}, aileMesajlari: [], fotolar: [], kiyafetler: [] };
}
function bosIlerleme() {
  return { altin: 0, yildiz: {}, cozulen: {}, kostum: null, kostumler: [], gomlek: null };
}

/** NPC nesnesinde konuşma dizisinin alan adı (içerik bankası `konusmalar` kullanır). */
export function npcSatirAlani(npc) {
  for (const a of ['konusmalar', 'satirlar', 'replikler', 'cumleler']) {
    if (Array.isArray(npc?.[a])) return a;
  }
  return 'konusmalar';
}

// ---------------------------------------------------------------- localStorage (+ bellek yedeği)

const bellek = new Map();   // anahtar → string; localStorage yazılamazsa tek kaynak budur
let lsVar = null;
function lsKontrol() {
  if (lsVar !== null) return lsVar;
  try {
    const k = ON + '__deneme';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    lsVar = true;
  } catch (_) {
    lsVar = false;
  }
  return lsVar;
}
function lsOku(k) {
  const key = ON + k;
  if (bellek.has(key)) return bellek.get(key);
  if (!lsKontrol()) return null;
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function lsYaz(k, deger) {
  const key = ON + k;
  bellek.set(key, deger);
  if (!lsKontrol()) return false;
  try {
    localStorage.setItem(key, deger);
    bellek.delete(key);          // kalıcı yazıldı; bellek kopyasına gerek yok
    return true;
  } catch (e) {
    console.warn('[store] localStorage yazılamadı, bellekte tutuluyor:', k, e?.name);
    return false;
  }
}
function lsSil(k) {
  const key = ON + k;
  bellek.delete(key);
  if (!lsKontrol()) return;
  try { localStorage.removeItem(key); } catch (_) {}
}
function jsonOku(k, varsayilan) {
  const s = lsOku(k);
  if (s == null) return varsayilan;
  try { return JSON.parse(s) ?? varsayilan; } catch (_) { return varsayilan; }
}
const jsonYaz = (k, v) => lsYaz(k, JSON.stringify(v));

// ---------------------------------------------------------------- IndexedDB (+ bellek yedeği)

let dbSozu = null;
let idbYok = false;
const yedekKV = { [SES]: new Map(), [FOTO]: new Map() };

function dbAc() {
  if (dbSozu) return dbSozu;
  dbSozu = new Promise((resolve) => {
    let bitti = false;
    const bitir = (db) => {
      if (bitti) { try { db?.close(); } catch (_) {} return; }
      bitti = true;
      if (!db) {
        idbYok = true;
        console.warn('[store] IndexedDB yok; sesler ve fotoğraflar bu oturumla sınırlı.');
      }
      resolve(db);
    };
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return bitir(null);
      const r = indexedDB.open(DB_ADI, DB_SURUM);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of [SES, FOTO]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => { try { db.close(); } catch (_) {} dbSozu = null; };
        db.onclose = () => { dbSozu = null; };
        bitir(db);
      };
      r.onerror = () => bitir(null);
      // Bazı Safari sürümlerinde open() hiç dönmeyebiliyor.
      setTimeout(() => bitir(null), 5000);
    } catch (_) {
      bitir(null);
    }
  });
  return dbSozu;
}

function istek(db, depo, mod, islem) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(depo, mod);
    let sonuc;
    islem(tx.objectStore(depo), (v) => { sonuc = v; });
    tx.oncomplete = () => resolve(sonuc);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB hatası'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB işlemi iptal edildi'));
  });
}

async function kv(depo, mod, islem, yedek) {
  for (let deneme = 0; deneme < 2; deneme++) {
    const db = await dbAc();
    if (!db) return yedek(yedekKV[depo]);
    try {
      return await istek(db, depo, mod, islem);
    } catch (e) {
      // Safari arka planda bağlantıyı kapatabiliyor: bir kez yeniden aç.
      if (deneme === 0 && e && e.name === 'InvalidStateError') { dbSozu = null; continue; }
      throw e;
    }
  }
}

const kvAl = (depo, k) => kv(depo, 'readonly',
  (os, set) => { const r = os.get(k); r.onsuccess = () => set(r.result); },
  (m) => m.get(k));
const kvKoy = (depo, k, v) => kv(depo, 'readwrite',
  (os) => { os.put(v, k); },
  (m) => { m.set(k, v); });
const kvSil = (depo, k) => kv(depo, 'readwrite',
  (os) => { os.delete(k); },
  (m) => { m.delete(k); });
const kvAnahtarlar = (depo) => kv(depo, 'readonly',
  (os, set) => {
    if (os.getAllKeys) { const r = os.getAllKeys(); r.onsuccess = () => set(r.result.map(String)); return; }
    const out = []; const c = os.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push(String(cur.key)); cur.continue(); } else set(out); };
  },
  (m) => [...m.keys()]);
const kvHepsi = (depo) => kv(depo, 'readonly',
  (os, set) => {
    const out = []; const c = os.openCursor();
    set(out);
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push([String(cur.key), cur.value]); cur.continue(); } };
  },
  (m) => [...m.entries()]);

// ---------------------------------------------------------------- bekleyen yazımlar

const bekleyen = new Set();
let sonHata = null;
function arkaPlan(soz) {
  const p = Promise.resolve(soz).catch((e) => {
    sonHata = e;
    console.warn('[store] kayıt hatası:', e);
  });
  bekleyen.add(p);
  p.finally(() => bekleyen.delete(p));
  return p;
}

// ---------------------------------------------------------------- fotoğraflar (bellek önbelleği + IDB)

const fotoOnbellek = new Map();   // 'profil:<id>' | 'aile:<id>' | 'kiyafet:<id>' → dataURL

function fotoYaz(k, dataURL) {
  if (!dataURL) return fotoSil(k);
  fotoOnbellek.set(k, dataURL);
  return arkaPlan(kvKoy(FOTO, k, dataURL).then(() => {
    if (idbYok) lsYaz('foto:' + k, dataURL);   // IDB yoksa en azından localStorage'a dene
  }));
}
function fotoSil(k) {
  fotoOnbellek.delete(k);
  if (idbYok) lsSil('foto:' + k);
  return arkaPlan(kvSil(FOTO, k));
}

// ---------------------------------------------------------------- base64

async function blobBase64(blob) {
  const buf = blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function base64Blob(b64, tur) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Blob([bytes], { type: tur || 'audio/mp4' });
}

// ---------------------------------------------------------------- temel içerik

let taban = bosIcerik();
let tabanSozu = null;
let icerikOnbellek = null;

function tabanNormalle(veri) {
  const c = bosIcerik();
  if (!nesneMi(veri)) return c;
  for (const [k, v] of Object.entries(veri)) c[k] = v;
  for (const k of ['npcler', 'gorevler', 'bulmacalar', 'aileMesajlari', 'fotolar']) {
    if (!Array.isArray(c[k])) c[k] = [];
    c[k] = c[k].filter(nesneMi);
  }
  // İçerik bankasının eski alan adlarını kanonik şemaya yaklaştır.
  for (const b of c.bulmacalar) if (b.soru == null && typeof b.soru_sesli === 'string') b.soru = b.soru_sesli;
  return c;
}

/** icerik/icerik.json dosyasını okur; yoksa ya da bozuksa boş diziler döner. */
export function loadBaseContent(url) {
  if (tabanSozu && !url) return tabanSozu;
  const adaylar = url ? [url] : [new URL('../../icerik/icerik.json', import.meta.url).href, 'icerik/icerik.json'];
  const soz = (async () => {
    for (const u of adaylar) {
      try {
        const r = await fetch(u, { cache: 'no-cache' });
        if (!r.ok) continue;
        taban = tabanNormalle(await r.json());
        icerikOnbellek = null;
        return taban;
      } catch (_) { /* bir sonrakini dene */ }
    }
    taban = bosIcerik();
    icerikOnbellek = null;
    return taban;
  })();
  if (!url) tabanSozu = soz;
  return soz;
}

// ---------------------------------------------------------------- durum

let durum = null;               // {profiller, aktif, ozel}
const ilerlemeOnbellek = {};    // profilId → Progress

function profilTemizle(p) {
  if (!nesneMi(p)) return null;
  return {
    id: metin(p.id, 60) || yeniId('c'),
    ad: metin(p.ad, 30) || 'Çocuk',
    renk: /^#[0-9a-f]{3,8}$/i.test(p.renk || '') ? p.renk : '#ff8a3d',
    foto: typeof p.foto === 'string' && p.foto.startsWith('data:image') ? p.foto : null,
  };
}

function secenekTemizle(s) {
  if (!nesneMi(s)) return null;
  const o = { ikon: metin(s.ikon, 16) || '❓', dogru: !!s.dogru };
  if (/^#[0-9a-f]{3,8}$/i.test(s.renk || '')) o.renk = s.renk;
  if (metin(s.ses)) o.ses = metin(s.ses);
  return o;
}

function bulmacaTemizle(b) {
  if (!nesneMi(b)) return null;
  const tur = BULMACA_TURLERI.includes(b.tur) ? b.tur : 'sec';
  const o = {
    ...b,
    id: metin(b.id, 60) || yeniId('ozel'),
    alan: ALANLAR.includes(b.alan) ? b.alan : 'aile',
    tur,
    soru: metin(b.soru),
    ozel: true,
  };
  if (b.odul != null) o.odul = metin(b.odul);
  if (tur === 'sec') {
    o.secenekler = (Array.isArray(b.secenekler) ? b.secenekler : []).map(secenekTemizle).filter(Boolean).slice(0, 4);
    if (o.secenekler.length < 2) return null;
  } else if (tur === 'say') {
    o.ikon = metin(b.ikon, 16) || '🍎';
    o.adet = Math.min(10, Math.max(1, Math.round(Number(b.adet) || 1)));
    const sec = (Array.isArray(b.secenekler) ? b.secenekler : []).map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n <= 20);
    o.secenekler = sec.includes(o.adet) ? sec : [...sec, o.adet];
  }
  return o;
}

function ozelTemizle(o) {
  const c = bosOzel();
  if (!nesneMi(o)) return c;
  c.bulmacalar = (Array.isArray(o.bulmacalar) ? o.bulmacalar : []).map(bulmacaTemizle).filter(Boolean);
  if (nesneMi(o.npcSatirlari)) {
    for (const [id, satirlar] of Object.entries(o.npcSatirlari)) {
      if (!Array.isArray(satirlar)) continue;
      const temiz = satirlar.map((s) => metin(s));
      while (temiz.length && !temiz[temiz.length - 1]) temiz.pop();
      if (temiz.length) c.npcSatirlari[id] = temiz;
    }
  }
  c.aileMesajlari = (Array.isArray(o.aileMesajlari) ? o.aileMesajlari : [])
    .filter(nesneMi)
    .map((m) => {
      const id = metin(m.id, 60) || yeniId('m');
      return { id, kimden: metin(m.kimden, 30) || 'Baba', metin: metin(m.metin), sesKey: 'mesaj:' + id };
    })
    .filter((m) => m.metin);
  c.fotolar = (Array.isArray(o.fotolar) ? o.fotolar : [])
    .filter(nesneMi)
    .map((f) => ({ id: metin(f.id, 60) || yeniId('f'), dataURL: typeof f.dataURL === 'string' ? f.dataURL : undefined }));
  c.kiyafetler = (Array.isArray(o.kiyafetler) ? o.kiyafetler : [])
    .filter(nesneMi)
    .map((k) => ({
      id: metin(k.id, 60) || yeniId('k'),
      tur: KIYAFET_TURLERI.includes(k.tur) ? k.tur : 'gomlek',
      tarih: typeof k.tarih === 'string' && !Number.isNaN(Date.parse(k.tarih)) ? k.tarih : new Date().toISOString(),
      dataURL: typeof k.dataURL === 'string' && k.dataURL.startsWith('data:image') ? k.dataURL : undefined,
    }));
  return c;
}

function yukle() {
  if (durum) return durum;
  const profiller = (jsonOku('profiller', []) || []).map(profilTemizle).filter(Boolean);
  let aktif = jsonOku('aktif', null);
  if (!profiller.some((p) => p.id === aktif)) aktif = profiller[0]?.id ?? null;
  durum = { profiller, aktif, ozel: ozelTemizle(jsonOku('ozel', null)) };
  return durum;
}

function profilleriKaydet() {
  jsonYaz('profiller', durum.profiller.map((p) => ({ id: p.id, ad: p.ad, renk: p.renk })));
  jsonYaz('aktif', durum.aktif);
}

function ozelKaydet() {
  const o = durum.ozel;
  jsonYaz('ozel', {
    v: 1,
    bulmacalar: o.bulmacalar,
    npcSatirlari: o.npcSatirlari,
    aileMesajlari: o.aileMesajlari,
    fotolar: o.fotolar.map((f) => ({ id: f.id })),
    kiyafetler: o.kiyafetler.map((k) => ({ id: k.id, tur: k.tur, tarih: k.tarih })),
  });
  icerikOnbellek = null;
}

function ilerlemeNormalle(p, yerinde = false) {
  const d = bosIlerleme();
  if (!nesneMi(p)) return d;
  const o = yerinde ? p : { ...d, ...p };
  for (const k of Object.keys(d)) if (!(k in o)) o[k] = d[k];
  o.altin = Math.max(0, Number(o.altin) || 0);
  if (!nesneMi(o.yildiz)) o.yildiz = {};
  if (!nesneMi(o.cozulen)) o.cozulen = {};
  if (!Array.isArray(o.kostumler)) o.kostumler = [];
  if (o.kostum !== null && typeof o.kostum !== 'string') o.kostum = null;
  if (o.gomlek !== null && typeof o.gomlek !== 'string') o.gomlek = null;
  return o;
}
function ilerlemeOku(id) {
  if (!ilerlemeOnbellek[id]) ilerlemeOnbellek[id] = ilerlemeNormalle(jsonOku('ilerleme:' + id, null));
  return ilerlemeOnbellek[id];
}
/** Silinen kıyafetleri hiçbir çocuğun üstünde bırakma (progress.gomlek temizlenir). */
function gomlekTemizle(idler) {
  if (!idler.size) return;
  for (const pid of [...durum.profiller.map((p) => p.id), 'misafir']) {
    const p = ilerlemeOku(pid);
    if (p.gomlek && idler.has(p.gomlek)) { p.gomlek = null; jsonYaz('ilerleme:' + pid, p); }
  }
}

// ---------------------------------------------------------------- dışa açık API

let initSozu = null;

export const store = {
  /** IndexedDB'yi açar, localStorage'ı ve fotoğrafları okur, temel içeriği yükler. Tekrar çağrılabilir. */
  init() {
    if (initSozu) return initSozu;
    initSozu = (async () => {
      yukle();
      const [, fotolar] = await Promise.all([
        loadBaseContent().catch(() => null),
        kvHepsi(FOTO).catch(() => []),
      ]);
      for (const [k, v] of fotolar || []) if (typeof v === 'string') fotoOnbellek.set(k, v);
      if (idbYok) {
        // IDB yoksa daha önce localStorage'a düşülmüş fotoğrafları topla.
        const anahtarlar = [
          ...durum.profiller.map((p) => 'profil:' + p.id),
          ...durum.ozel.fotolar.map((f) => 'aile:' + f.id),
          ...durum.ozel.kiyafetler.map((k) => 'kiyafet:' + k.id),
        ];
        for (const k of anahtarlar) { const v = lsOku('foto:' + k); if (v) fotoOnbellek.set(k, v); }
      }
      for (const p of durum.profiller) p.foto = fotoOnbellek.get('profil:' + p.id) || null;
      icerikOnbellek = null;
    })();
    return initSozu;
  },

  // ---- profiller
  profiles() {
    return yukle().profiller.map((p) => ({ ...p }));
  },
  activeProfile() {
    const d = yukle();
    const p = d.profiller.find((x) => x.id === d.aktif);
    return p ? { ...p } : null;
  },
  setActive(id) {
    const d = yukle();
    if (!d.profiller.some((p) => p.id === id)) return false;
    d.aktif = id;
    jsonYaz('aktif', id);
    return true;
  },
  addProfile({ ad, renk, foto } = {}) {
    const d = yukle();
    const p = profilTemizle({ id: yeniId('c'), ad, renk, foto });
    d.profiller.push(p);
    if (!d.aktif) d.aktif = p.id;
    profilleriKaydet();
    if (p.foto) fotoYaz('profil:' + p.id, p.foto);
    return { ...p };
  },
  updateProfile(id, patch = {}) {
    const d = yukle();
    const i = d.profiller.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const eski = d.profiller[i];
    const yeni = profilTemizle({ ...eski, ...patch, id });
    if ('foto' in patch && !patch.foto) yeni.foto = null;
    d.profiller[i] = yeni;
    profilleriKaydet();
    if (yeni.foto !== eski.foto) fotoYaz('profil:' + id, yeni.foto);
    return { ...yeni };
  },
  removeProfile(id) {
    const d = yukle();
    const i = d.profiller.findIndex((p) => p.id === id);
    if (i < 0) return false;
    d.profiller.splice(i, 1);
    if (d.aktif === id) d.aktif = d.profiller[0]?.id ?? null;
    profilleriKaydet();
    lsSil('ilerleme:' + id);
    delete ilerlemeOnbellek[id];
    fotoSil('profil:' + id);
    arkaPlan(store.deleteClip('hosgeldin:' + id));
    return true;
  },

  // ---- ilerleme
  /** Aktif profilin ilerlemesi (canlı nesne). Profil yoksa 'misafir' kaydı. */
  progress() {
    const d = yukle();
    return ilerlemeOku(d.aktif || 'misafir');
  },
  /** Birleştirip kaydeder. `yildiz`/`cozulen` gibi düz nesneler tek seviye derin birleşir. */
  saveProgress(patch = {}) {
    const d = yukle();
    const id = d.aktif || 'misafir';
    const p = ilerlemeOku(id);
    if (nesneMi(patch) && patch !== p) {
      for (const [k, v] of Object.entries(patch)) {
        if (nesneMi(v) && nesneMi(p[k])) p[k] = { ...p[k], ...v };
        else p[k] = v;
      }
    }
    ilerlemeNormalle(p, true);   // aynı nesne kalır: progress() referansı tutan kod bayatlamaz
    jsonYaz('ilerleme:' + id, p);
    return p;
  },
  resetProgress(profileId) {
    const d = yukle();
    const id = profileId || d.aktif || 'misafir';
    const p = ilerlemeOnbellek[id];
    if (p) {
      for (const k of Object.keys(p)) delete p[k];
      Object.assign(p, bosIlerleme());
    } else {
      ilerlemeOnbellek[id] = bosIlerleme();
    }
    jsonYaz('ilerleme:' + id, ilerlemeOnbellek[id]);
  },
  /** Herhangi bir profilin ilerlemesi (panel için). */
  progressOf(profileId) {
    return ilerlemeOku(profileId || 'misafir');
  },

  // ---- içerik
  /** icerik.json + ebeveyn eklemeleri. Önbellekli; her karede çağrılabilir. */
  content() {
    if (icerikOnbellek) return icerikOnbellek;
    const d = yukle();
    const o = d.ozel;
    const npcler = taban.npcler.map((n) => {
      const ust = o.npcSatirlari[n.id];
      if (!ust) return n;
      const alan = npcSatirAlani(n);
      const temel = Array.isArray(n[alan]) ? n[alan] : [];
      const satirlar = [];
      for (let i = 0; i < Math.max(temel.length, ust.length); i++) satirlar.push(ust[i] || temel[i] || '');
      while (satirlar.length && !satirlar[satirlar.length - 1]) satirlar.pop();
      return { ...n, [alan]: satirlar, ozelSatir: true };
    });
    icerikOnbellek = {
      ...taban,
      npcler,
      gorevler: taban.gorevler,
      bulmacalar: [...taban.bulmacalar, ...o.bulmacalar],
      aileMesajlari: [...taban.aileMesajlari, ...o.aileMesajlari],
      fotolar: [
        ...taban.fotolar,
        ...o.fotolar.map((f) => ({ id: f.id, dataURL: fotoOnbellek.get('aile:' + f.id) })).filter((f) => f.dataURL),
      ],
    };
    return icerikOnbellek;
  },
  /** Yalnız temel içerik (panel, NPC'nin varsayılan cümlelerini göstermek için). */
  baseContent() {
    return taban;
  },
  /** Yalnız ebeveyn eklemeleri (kopya). fotolar dataURL ile gelir. */
  custom() {
    const o = yukle().ozel;
    return {
      v: 1,
      bulmacalar: kopya(o.bulmacalar),
      npcSatirlari: kopya(o.npcSatirlari),
      aileMesajlari: kopya(o.aileMesajlari),
      fotolar: o.fotolar.map((f) => ({ id: f.id, dataURL: fotoOnbellek.get('aile:' + f.id) || null })),
      kiyafetler: o.kiyafetler.map((k) => ({ ...k, dataURL: fotoOnbellek.get('kiyafet:' + k.id) || null })),
    };
  },
  /** Ebeveyn eklemelerini kaydeder. Silinen mesaj/bulmacaların ses kayıtları ve silinen fotoğraflar da temizlenir. */
  saveCustom(custom) {
    const d = yukle();
    const eski = d.ozel;
    const yeni = ozelTemizle(custom);
    const yeniFotoIdleri = new Set(yeni.fotolar.map((f) => f.id));
    for (const f of eski.fotolar) if (!yeniFotoIdleri.has(f.id)) fotoSil('aile:' + f.id);
    for (const f of yeni.fotolar) {
      if (f.dataURL && f.dataURL !== fotoOnbellek.get('aile:' + f.id)) fotoYaz('aile:' + f.id, f.dataURL);
      delete f.dataURL;
    }
    yeni.fotolar = yeni.fotolar.filter((f) => fotoOnbellek.has('aile:' + f.id));
    const yeniKiyafetIdleri = new Set(yeni.kiyafetler.map((k) => k.id));
    const silinenKiyafet = new Set();
    for (const k of eski.kiyafetler) if (!yeniKiyafetIdleri.has(k.id)) { silinenKiyafet.add(k.id); fotoSil('kiyafet:' + k.id); }
    for (const k of yeni.kiyafetler) {
      if (k.dataURL && k.dataURL !== fotoOnbellek.get('kiyafet:' + k.id)) fotoYaz('kiyafet:' + k.id, k.dataURL);
      delete k.dataURL;
    }
    yeni.kiyafetler = yeni.kiyafetler.filter((k) => fotoOnbellek.has('kiyafet:' + k.id));
    gomlekTemizle(silinenKiyafet);
    const mesajlar = new Set(yeni.aileMesajlari.map((m) => m.id));
    for (const m of eski.aileMesajlari) if (!mesajlar.has(m.id)) arkaPlan(store.deleteClip('mesaj:' + m.id));
    const bulmacalar = new Set(yeni.bulmacalar.map((b) => b.id));
    for (const b of eski.bulmacalar) if (!bulmacalar.has(b.id)) arkaPlan(store.deleteClip('bulmaca:' + b.id));
    d.ozel = yeni;
    ozelKaydet();
    return store.flush();
  },

  // ---- kıyafetler (ebeveynin fotoğrafladığı gömlekler; init() sonrası)
  /** Gömlek listesi: [{id, tur:'gomlek', tarih}] (görseli dosyada olanlar, eskiden yeniye). */
  shirts() {
    return yukle().ozel.kiyafetler
      .filter((k) => k.tur === 'gomlek' && fotoOnbellek.has('kiyafet:' + k.id))
      .map((k) => ({ ...k }));
  },
  /** Gömleğin görseli (JPEG dataURL, 256×256) ya da null. Eşzamanlı. */
  getShirt(id) {
    return id ? fotoOnbellek.get('kiyafet:' + id) || null : null;
  },
  /** Yeni gömlek ekler (dataURL: kare JPEG). Yazım bitince {id, tur, tarih} döner. */
  async addShirt(dataURL) {
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image')) throw new Error('Geçersiz kıyafet fotoğrafı');
    const d = yukle();
    const k = { id: yeniId('k'), tur: 'gomlek', tarih: new Date().toISOString() };
    d.ozel.kiyafetler.push(k);
    fotoYaz('kiyafet:' + k.id, dataURL);
    ozelKaydet();
    await store.flush();
    return { ...k };
  },
  /** Gömleği siler; üstünde olan çocukların `gomlek` alanı null olur. */
  async removeShirt(id) {
    const d = yukle();
    const i = d.ozel.kiyafetler.findIndex((k) => k.id === id);
    if (i < 0) return false;
    d.ozel.kiyafetler.splice(i, 1);
    fotoSil('kiyafet:' + id);
    gomlekTemizle(new Set([id]));
    ozelKaydet();
    await store.flush();
    return true;
  },

  // ---- ses klipleri
  async getClip(key) {
    if (!key) return null;
    try {
      const v = await kvAl(SES, String(key));
      if (!v) return null;
      if (v instanceof Blob) return v;
      if (v.veri) return new Blob([v.veri], { type: v.tur || 'audio/mp4' });
      return null;
    } catch (e) {
      console.warn('[store] ses okunamadı:', key, e);
      return null;
    }
  },
  async putClip(key, blob) {
    if (!key || !(blob instanceof Blob)) throw new Error('Geçersiz ses kaydı');
    const db = await dbAc();
    if (!db) { yedekKV[SES].set(String(key), blob); return; }
    // Blob yerine ArrayBuffer saklanır: eski Safari sürümleri IDB'de Blob'u bozabiliyor.
    const veri = blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
    await kvKoy(SES, String(key), { tur: blob.type || 'audio/mp4', veri, boyut: blob.size, tarih: Date.now() });
  },
  async deleteClip(key) {
    if (!key) return;
    await kvSil(SES, String(key));
  },
  async listClips() {
    try { return await kvAnahtarlar(SES); } catch (_) { return []; }
  },

  // ---- yedek
  async exportAll() {
    await store.init();
    await store.flush();
    const d = yukle();
    const sesler = {};
    for (const key of await store.listClips()) {
      const blob = await store.getClip(key);
      if (blob && blob.size) sesler[key] = { tur: blob.type || 'audio/mp4', b64: await blobBase64(blob) };
    }
    const ilerleme = {};
    for (const p of d.profiller) ilerleme[p.id] = ilerlemeOku(p.id);
    return JSON.stringify({
      uygulama: 'ayi-macerasi',
      v: 1,
      tarih: new Date().toISOString(),
      profiller: store.profiles(),
      aktif: d.aktif,
      ilerleme,
      ozel: store.custom(),
      sesler,
    });
  },
  /**
   * Yedeği geri yükler. `secim` isteğe bağlı: {cocuklar, icerik, sesler} (varsayılan hepsi true).
   * cocuklar → profiller + ilerleme tamamen değiştirilir; icerik → ebeveyn eklemeleri değiştirilir;
   * sesler → dosyadaki klipler eklenir/üzerine yazılır (diğer klipler kalır).
   */
  async importAll(json, secim = {}) {
    await store.init();
    let veri;
    try {
      veri = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (_) {
      throw new Error('Dosya okunamadı: geçerli bir yedek dosyası değil.');
    }
    if (!nesneMi(veri) || (veri.uygulama && veri.uygulama !== 'ayi-macerasi')
        || !('profiller' in veri || 'ozel' in veri || 'sesler' in veri)) {
      throw new Error('Bu dosya bir Ayıcık Mahallede yedeği değil.');
    }
    const s = { cocuklar: true, icerik: true, sesler: true, ...secim };
    const d = yukle();

    if (s.cocuklar && Array.isArray(veri.profiller)) {
      for (const p of d.profiller) {
        lsSil('ilerleme:' + p.id);
        delete ilerlemeOnbellek[p.id];
        fotoSil('profil:' + p.id);
      }
      d.profiller = veri.profiller.map(profilTemizle).filter(Boolean);
      d.aktif = d.profiller.some((p) => p.id === veri.aktif) ? veri.aktif : d.profiller[0]?.id ?? null;
      profilleriKaydet();
      for (const p of d.profiller) if (p.foto) fotoYaz('profil:' + p.id, p.foto);
      if (nesneMi(veri.ilerleme)) {
        for (const p of d.profiller) {
          if (!veri.ilerleme[p.id]) continue;
          ilerlemeOnbellek[p.id] = ilerlemeNormalle(veri.ilerleme[p.id]);
          jsonYaz('ilerleme:' + p.id, ilerlemeOnbellek[p.id]);
        }
      }
    }
    if (s.icerik && nesneMi(veri.ozel)) {
      // Kıyafetlerden önceki sürümün yedeği kıyafet listesi taşımaz: bu cihazdakileri silme.
      const ozel = Array.isArray(veri.ozel.kiyafetler) ? veri.ozel : { ...veri.ozel, kiyafetler: store.custom().kiyafetler };
      await store.saveCustom(ozel);
    }
    if (s.sesler && nesneMi(veri.sesler)) {
      for (const [key, v] of Object.entries(veri.sesler)) {
        if (!nesneMi(v) || typeof v.b64 !== 'string') continue;
        await store.putClip(key, base64Blob(v.b64, v.tur));
      }
    }
    icerikOnbellek = null;
    await store.flush();
  },

  // ---- yardımcılar (sözleşme dışı ekler)
  /** Arka planda süren fotoğraf/klip yazımlarını bekler. */
  async flush() {
    while (bekleyen.size) await Promise.all([...bekleyen]);
  },
  /** Son arka plan kayıt hatası (yoksa null). */
  lastError() {
    return sonHata;
  },
  /** Kalıcı depolama durumu (true: IndexedDB + localStorage çalışıyor). */
  isPersistent() {
    return lsKontrol() && !idbYok;
  },
};
