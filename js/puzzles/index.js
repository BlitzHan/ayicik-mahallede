/**
 * Ayıcık Mahallede — bulmaca ekranları (bulmaca ajanı)
 * Sözleşme: SOZLESME.md → "js/puzzles/index.js"
 *
 *   openPuzzle(def, ctx): Promise<{solved:boolean}>
 *   ctx = {speak, sfx, childName, onClose}        (isteğe bağlı: stopSpeak)
 *
 * Türler: sec · say · sirala · esles · hafiza
 * Bilinmeyen tür: seçenek nesneleri varsa `sec` gibi davranır, yoksa hemen {solved:false} ile kapanır.
 * Ekran #overlay içine kurulur (yoksa oluşturulur). Çocuk okumuyor: tüm yönergeler sesli,
 * ekrandaki tek yazı üstteki küçük ebeveyn alt yazısıdır. Yanlışta ceza yok.
 */

const OVGULER = ['Aferin!', 'Harikasın!', 'Süpersin!'];
const TEKRAR = 'Bir daha deneyelim!';
const BIRLER = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const KONFETI_RENK = ['#ff5252', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc', '#ff7043', '#26c6da', '#ec407a'];
const SAYI_RENK = ['#ff7043', '#42a5f5', '#43b05c', '#ab47bc', '#ec407a', '#26a69a'];
const PASTEL = ['#fff1b8', '#d3f5d6', '#d3eaff', '#ffdbe8', '#e8dbff', '#ffe1cf'];
const CIFT_RENK = ['#ff7043', '#42a5f5', '#43c463', '#ab47bc', '#ffb300', '#26c6da'];
const ZAR = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const RENK_ADI = {
  kirmizi: '#e53935', mavi: '#1e88e5', sari: '#fdd835', yesil: '#43a047', turuncu: '#fb8c00',
  mor: '#8e24aa', pembe: '#ec407a', siyah: '#212121', beyaz: '#ffffff', kahverengi: '#8d6e63',
  kahve: '#8d6e63', gri: '#9e9e9e', lacivert: '#283593', turkuaz: '#00acc1',
};
const SVG_NS = 'http://www.w3.org/2000/svg';
let PIKTO = null;
try { PIKTO = new RegExp('\\p{Extended_Pictographic}', 'u'); } catch (_) { PIKTO = null; }

let aktif = null;      // açık bulmaca oturumu (aynı anda tek bulmaca)
let ovSayac = 0;       // #overlay'i kullanan bulmaca kökü sayısı
let ovOnceki = null;   // #overlay'in açılmadan önceki satır içi durumu

// ───────────────────────── Dış API ─────────────────────────

export function openPuzzle(def, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return new Promise((resolve) => {
    if (aktif) aktif.kapat(false);
    let bildirildi = false;
    const kapanis = (sonuc) => {
      if (bildirildi) return;
      bildirildi = true;
      resolve(sonuc);
      try { if (typeof c.onClose === 'function') c.onClose(sonuc); } catch (e) { console.error('[bulmaca] onClose', e); }
    };
    const tur = turBul(def);
    if (!tur || typeof document === 'undefined') {
      console.warn('[bulmaca] tanınmayan bulmaca, kibarca kapatılıyor:', def && def.tur);
      kapanis({ solved: false });
      return;
    }
    try {
      const o = oturumAc(def, tur, c, kapanis);
      aktif = o && !o.bitti() ? o : null;
    } catch (e) {
      console.error('[bulmaca] açılamadı', e);
      aktif = null;
      kapanis({ solved: false });
    }
  });
}

// ───────────────────────── Oturum ─────────────────────────

function oturumAc(def, tur, ctx, kapanis) {
  const cssLink = cssYukle();
  const ses = sesKatmani(ctx);
  const ad = typeof ctx.childName === 'string' ? ctx.childName.trim() : '';
  const hareket = !azHareket();
  // Açılıştan sonraki ilk 700 ms dokunuş alınmaz: bulmacayı açan dokunuş cevabı seçmesin.
  const st = { bitti: false, cozuldu: false, kilitTam: false, kilitSon: performance.now() + 700, kilitId: null, yanlisSeri: 0 };
  const zamanlar = new Set();
  const yerlesimler = [];
  const animZaman = new WeakMap();
  const oncekiOdak = document.activeElement;
  let rafId = 0;
  let ro = null;
  let soruJeton = 0;
  let sonDinle = 0;

  // — DOM iskeleti —
  const kok = el('div', 'bm-kok');
  kok.dataset.tur = tur;
  kok.setAttribute('role', 'dialog');
  kok.setAttribute('aria-modal', 'true');
  kok.setAttribute('aria-label', def.soru ? String(def.soru) : 'Bulmaca');
  kok.tabIndex = -1;
  const ic = el('div', 'bm-ic');
  const sahne = el('div', 'bm-sahne');
  const altyazi = el('div', 'bm-altyazi');
  const kapatBtn = dugme('bm-btn bm-kapat', '✖', 'Kapat');
  const dinleBtn = dugme('bm-btn bm-dinle', '🔊', 'Soruyu tekrar dinle');
  const konfetiK = el('div', 'bm-konfeti');
  konfetiK.setAttribute('aria-hidden', 'true');
  if (def.soru) altyazi.textContent = String(def.soru); else altyazi.hidden = true;
  ic.append(sahne, altyazi, kapatBtn, dinleBtn);
  kok.append(ic, konfetiK);

  // Oyunun pencere düzeyindeki dinleyicilerine dokunuş sızmasın (bırakma olayları serbest: joystick takılmasın).
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick']) {
    kok.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }
  kok.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  kok.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });

  const ov = overlayAl(kok);
  try { kok.focus({ preventScroll: true }); } catch (_) {}

  const me = { kapat: (c) => bitir(!!c), bitti: () => st.bitti };

  // — Yardımcılar (oturuma bağlı) —
  function zamanla(fn, ms) {
    const id = setTimeout(() => { zamanlar.delete(id); if (!st.bitti) fn(); }, ms);
    zamanlar.add(id);
    return id;
  }

  function kilitliMi() { return st.kilitTam || performance.now() < st.kilitSon; }
  function kilitle(ms) { st.kilitSon = Math.max(st.kilitSon, performance.now() + ms); }
  function kilitliBekle(p, min = 0) {
    st.kilitTam = true;
    const id = {};
    st.kilitId = id;
    return Promise.all([Promise.resolve(p).catch(() => {}), bekle(min)]).then(() => {
      if (!st.bitti && !st.cozuldu && st.kilitId === id) st.kilitTam = false;
    });
  }

  function dokun(h, fn, { her = false } = {}) {
    const calis = (ev) => {
      if (st.bitti) return;
      if (!her && kilitliMi()) return;
      try { fn(ev); } catch (e) { console.error('[bulmaca]', e); }
    };
    h.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      h.classList.add('bm-bas');
      calis(ev);
    });
    const birak = () => h.classList.remove('bm-bas');
    h.addEventListener('pointerup', birak);
    h.addEventListener('pointercancel', birak);
    h.addEventListener('pointerleave', birak);
    // Klavye (Enter/Boşluk) — fare/dokunma tıklamaları pointerdown ile zaten işlendi.
    h.addEventListener('click', (ev) => { if (ev.detail === 0) calis(ev); });
  }

  function sinifOynat(e, sinif, ms) {
    if (!e) return;
    let m = animZaman.get(e);
    if (!m) { m = {}; animZaman.set(e, m); }
    clearTimeout(m[sinif]);
    e.classList.remove(sinif);
    void e.offsetWidth; // animasyonu yeniden başlat
    e.classList.add(sinif);
    m[sinif] = setTimeout(() => e.classList.remove(sinif), ms);
  }
  const salla = (e) => sinifOynat(e, 'bm-salla', 650);
  const zipla = (e) => sinifOynat(e, 'bm-zipla', 600);

  function ipucu(els) {
    kok.querySelectorAll('.bm-ipucu').forEach((e) => e.classList.remove('bm-ipucu'));
    els.filter(Boolean).forEach((e) => e.classList.add('bm-ipucu'));
  }
  function ipucuTemizle() {
    st.yanlisSeri = 0;
    kok.querySelectorAll('.bm-ipucu').forEach((e) => e.classList.remove('bm-ipucu'));
  }

  function yanlis(hedefler, { kilitMs = 650 } = {}) {
    if (st.bitti || st.cozuldu) return 0;
    st.yanlisSeri++;
    ses.sfx('no');
    [].concat(hedefler).forEach(salla);
    kilitliBekle(ses.speak(TEKRAR, { key: 'tekrar' }), kilitMs);
    return st.yanlisSeri;
  }

  function ovguMetni() {
    if (typeof def.odul === 'string' && def.odul.trim()) return [adEkle(def.odul, ad), { alt: def.odul.trim() }];
    const i = Math.floor(Math.random() * OVGULER.length);
    const m = OVGULER[i];
    return [ad ? m.replace('!', ` ${ad}!`) : m, { key: `aferin-${i + 1}`, alt: m }];
  }

  function basari(hedef, onSoz = []) {
    if (st.bitti || st.cozuldu) return;
    st.cozuldu = true;
    st.kilitTam = true;
    ipucuTemizle();
    kok.classList.add('bm-cozuldu');
    if (hedef) { hedef.classList.add('bm-dogru'); zipla(hedef); }
    ses.sfx('yes');
    const r = hedef ? hedef.getBoundingClientRect() : null;
    const W = window.innerWidth, H = window.innerHeight;
    konfeti(r ? r.left + r.width / 2 : W / 2, r ? r.top + r.height / 2 : H / 2, 70);
    zamanla(() => { konfeti(W * 0.18, H * 0.3, 34); konfeti(W * 0.82, H * 0.3, 34); }, 280);
    yildizGoster();
    let zincir = Promise.resolve();
    for (const s of onSoz) if (s) zincir = zincir.then(() => (st.bitti ? null : ses.speak(s)));
    const [metin, secenek] = ovguMetni();
    zincir = zincir.then(() => (st.bitti ? null : ses.speak(metin, secenek)));
    Promise.all([bekle(1800), Promise.race([zincir.then(() => bekle(150)), bekle(8000)])])
      .then(() => bitir(true));
  }

  function yildizGoster() {
    const y = el('div', 'bm-yildiz');
    y.textContent = '🌟';
    y.setAttribute('aria-hidden', 'true');
    kok.append(y);
    zamanla(() => y.remove(), 1700);
  }

  function konfeti(x, y, adet = 60) {
    if (st.bitti) return;
    const W = window.innerWidth, H = window.innerHeight;
    const n = hareket ? adet : Math.min(14, adet);
    for (let i = 0; i < n; i++) {
      const p = el('span', 'bm-parca');
      const s = 8 + Math.random() * 10;
      const yuvarlak = Math.random() < 0.35;
      p.style.width = `${s}px`;
      p.style.height = `${yuvarlak ? s : s * 0.55}px`;
      p.style.background = KONFETI_RENK[(i + Math.floor(Math.random() * 3)) % KONFETI_RENK.length];
      if (yuvarlak) p.style.borderRadius = '50%';
      const sil = () => p.remove();
      if (!hareket || typeof p.animate !== 'function') {
        // Az hareket: yerinde beliren ve sönen renkli noktalar.
        p.style.left = `${x + (Math.random() - 0.5) * Math.min(W, H) * 0.6}px`;
        p.style.top = `${y + (Math.random() - 0.5) * Math.min(W, H) * 0.5}px`;
        konfetiK.appendChild(p);
        if (typeof p.animate === 'function') {
          p.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1200, fill: 'forwards' });
        }
        setTimeout(sil, 1300);
        continue;
      }
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      konfetiK.appendChild(p);
      const aci = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const hiz = (0.3 + Math.random() * 0.6) * Math.min(W, H) * 0.95;
      const dx = Math.cos(aci) * hiz, dy = Math.sin(aci) * hiz;
      const dus = H * (0.45 + Math.random() * 0.45);
      const don = (Math.random() - 0.5) * 1080;
      const sure = 1100 + Math.random() * 700;
      const a = p.animate([
        { transform: 'translate(-50%,-50%) translate(0px,0px) rotate(0deg)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${don * 0.4}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(-50%,-50%) translate(${dx * 1.25}px,${dy + dus}px) rotate(${don}deg)`, opacity: 0 },
      ], { duration: sure, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
      a.onfinish = sil;
      setTimeout(sil, sure + 250);
    }
  }

  // Bir öğeyi (klonunu) başka bir öğenin yerine uçurur. Promise uçuş bitince çözülür.
  function ucur(kaynak, hedef) {
    const a = kaynak.getBoundingClientRect();
    const b = hedef.getBoundingClientRect();
    kaynak.classList.add('bm-bos');
    if (!hareket || typeof kaynak.animate !== 'function' || !a.width || !b.width) return Promise.resolve();
    const k = kaynak.cloneNode(true);
    k.classList.remove('bm-bas', 'bm-zipla', 'bm-salla', 'bm-ipucu', 'bm-bos');
    k.classList.add('bm-ucan');
    k.removeAttribute('aria-label');
    k.setAttribute('aria-hidden', 'true');
    k.style.left = `${a.left}px`;
    k.style.top = `${a.top}px`;
    k.style.width = `${a.width}px`;
    k.style.height = `${a.height}px`;
    k.style.setProperty('--w', `${a.width}px`);
    k.style.setProperty('--h', `${a.height}px`);
    kok.appendChild(k);
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const s = b.width / a.width;
    const anim = k.animate([
      { transform: 'translate(0px,0px) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 50}px) scale(${((1 + s) / 2) * 1.12}) rotate(-6deg)`, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)` },
    ], { duration: 480, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'forwards' });
    return new Promise((r) => {
      let tamam = false;
      const son = () => { if (tamam) return; tamam = true; k.remove(); r(); };
      anim.onfinish = son;
      setTimeout(son, 700);
    });
  }

  // — Yerleşim —
  function bolgeler() {
    const W = ic.clientWidth, H = ic.clientHeight;
    const B = (kapatBtn.offsetHeight || 88) + 10;
    const ust = altyazi.hidden ? 4 : Math.min(60, altyazi.offsetHeight + 6);
    const g = Math.round(Math.max(10, Math.min(24, Math.min(W, H) * 0.04)));
    return {
      W, H, B, ust, g,
      orta: { x: B, y: ust, w: Math.max(0, W - 2 * B), h: Math.max(0, H - ust) },   // düğme sütunları arası
      alt: { x: 0, y: B, w: W, h: Math.max(0, H - B) },                            // düğmelerin altı, tam genişlik
    };
  }
  function kutu(sinif) {
    const bolge = el('div', `bm-bolge ${sinif}`);
    const izgara = el('div', 'bm-izgara');
    bolge.append(izgara);
    sahne.append(bolge);
    return { bolge, izgara };
  }
  function yerlestir(k, R, f, g) {
    const s = k.bolge.style;
    s.left = `${Math.round(R.x)}px`;
    s.top = `${Math.round(R.y)}px`;
    s.width = `${Math.max(0, Math.round(R.w))}px`;
    s.height = `${Math.max(0, Math.round(R.h))}px`;
    const z = k.izgara.style;
    z.setProperty('--w', `${f.w}px`);
    z.setProperty('--h', `${f.h}px`);
    z.setProperty('--g', `${g}px`);
    z.width = `${f.cols * f.w + (f.cols - 1) * g + 1}px`;
  }
  function konum(e) { // .bm-ic içine göre, transform'lardan etkilenmeyen konum
    let x = 0, y = 0, n = e;
    while (n && n !== ic) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: e.offsetWidth, h: e.offsetHeight };
  }
  function yerlesimYap() {
    if (st.bitti) return;
    for (const f of yerlesimler) {
      try { f(); } catch (e) { console.error('[bulmaca] yerleşim', e); }
    }
  }
  function planla() {
    if (rafId || st.bitti) return;
    rafId = requestAnimationFrame(() => { rafId = 0; yerlesimYap(); });
  }

  // — Soru —
  function soruOku() {
    if (!def.soru) return;
    const j = ++soruJeton;
    dinleBtn.classList.add('bm-konusuyor');
    ses.speak(String(def.soru), def.id != null ? { key: `bulmaca:${def.id}` } : {})
      .then(() => { if (j === soruJeton) dinleBtn.classList.remove('bm-konusuyor'); });
  }

  // — Kapanış —
  function tus(e) { if (e.key === 'Escape') { e.preventDefault(); bitir(st.cozuldu); } }

  function bitir(cozuldu) {
    if (st.bitti) return;
    st.bitti = true;
    if (!cozuldu) ses.durdur();
    for (const id of zamanlar) clearTimeout(id);
    zamanlar.clear();
    if (rafId) cancelAnimationFrame(rafId);
    if (ro) ro.disconnect();
    window.removeEventListener('resize', planla);
    window.removeEventListener('orientationchange', planla);
    window.removeEventListener('keydown', tus);
    if (cssLink) cssLink.removeEventListener('load', planla);
    kok.classList.add('bm-kapaniyor');
    // Kök kısa bir süre yerinde kalır: parmağın kalkmasıyla gelen "click" alttaki oyuna düşmesin.
    setTimeout(() => { kok.remove(); ov.birak(); }, 280);
    if (aktif === me) aktif = null;
    try {
      if (oncekiOdak && typeof oncekiOdak.focus === 'function' && document.contains(oncekiOdak)) oncekiOdak.focus({ preventScroll: true });
    } catch (_) {}
    kapanis({ solved: !!cozuldu });
  }

  // — Tür kurulumu —
  const api = {
    def, ad, hareket, st, kok, ic, sahne,
    speak: (t, o) => ses.speak(t, o),
    sfx: (n) => ses.sfx(n),
    dokun, kilitle, kilitliBekle, zamanla, basari, yanlis, ipucu, ipucuTemizle, zipla, salla, ucur,
    bolgeler, kutu, yerlestir, konum,
    yerlesim: (f) => yerlesimler.push(f),
  };
  const kurucu = { sec: kurSec, say: kurSay, sirala: kurSirala, esles: kurEsles, hafiza: kurHafiza }[tur];
  let tamam = false;
  try { tamam = kurucu(api) !== false; } catch (e) { console.error('[bulmaca] kurulum', e); }
  if (!tamam) {
    console.warn('[bulmaca] bulmaca verisi eksik, kapatılıyor:', def && def.id);
    bitir(false);
    return me;
  }

  // Sabit düğmeler
  dokun(kapatBtn, () => bitir(st.cozuldu), { her: true });
  dokun(dinleBtn, () => {
    const t = performance.now();
    if (t - sonDinle < 450 || st.cozuldu) return;
    sonDinle = t;
    zipla(dinleBtn);
    soruOku();
  });

  yerlesimYap();
  requestAnimationFrame(() => yerlesimYap());
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(planla); ro.observe(ic); }
  window.addEventListener('resize', planla);
  window.addEventListener('orientationchange', planla);
  window.addEventListener('keydown', tus);
  if (cssLink) cssLink.addEventListener('load', planla);

  ses.sfx('open');
  soruOku();
  return me;
}

// ───────────────────────── Türler ─────────────────────────

// sec: 2-4 seçenek; doğru olan(lar)ın hepsine dokununca çözülür.
function kurSec(api) {
  let ops = (Array.isArray(api.def.secenekler) ? api.def.secenekler : []).map(normOp).filter(Boolean);
  if (!ops.length) return false;
  if (!ops.some((o) => o.dogru)) {
    console.warn('[bulmaca] doğru seçenek işaretlenmemiş; her seçenek doğru sayılıyor:', api.def.id);
    ops.forEach((o) => { o.dogru = true; });
  }
  ops = karistir(ops);
  const K = api.kutu('bm-secenekler');
  const kartlar = ops.map((o, i) => {
    const b = dugme('bm-kart bm-sec-kart', '', o.ses || `Seçenek ${i + 1}`);
    b.append(ikonYap(o));
    api.dokun(b, () => sec(o, b));
    K.izgara.append(b);
    return b;
  });
  const dogrular = kartlar.filter((_, i) => ops[i].dogru);
  let bulunan = 0;

  function sec(o, b) {
    if (b.classList.contains('bm-bulundu')) return;
    if (o.dogru) {
      bulunan++;
      b.classList.add('bm-bulundu');
      api.ipucuTemizle();
      if (bulunan >= dogrular.length) { api.basari(b, o.ses ? [o.ses] : []); return; }
      api.sfx('pop');
      api.zipla(b);
      api.kilitliBekle(o.ses ? api.speak(o.ses) : null, 400);
    } else if (api.yanlis(b) >= 2) {
      api.ipucu(dogrular.filter((x) => !x.classList.contains('bm-bulundu')));
    }
  }

  api.yerlesim(() => {
    const b = api.bolgeler();
    const f = enIyi(ops.length, [b.orta, b.alt], { g: b.g, oran: 1, max: 260, tekSatirBonus: 1.12 });
    api.yerlestir(K, f.R, f, b.g);
  });
}

// say: adet kadar ikon (dokununca sesli sayılır) + büyük rakam ve noktalı sayı seçenekleri.
function kurSay(api) {
  const def = api.def;
  const ham = Math.round(Number(def.adet));
  if (!Number.isFinite(ham) || ham < 1) return false;
  const N = Math.min(ham, 20);
  let secs = (Array.isArray(def.secenekler) ? def.secenekler : [])
    .map((x) => Math.round(Number(x && typeof x === 'object' ? (x.sayi ?? x.deger) : x)))
    .filter((x) => Number.isFinite(x) && x >= 0 && x <= 99);
  secs = [...new Set(secs)];
  if (!secs.includes(N)) secs.push(N);
  if (secs.length < 2) for (const d of [N + 1, N - 1, N + 2]) if (secs.length < 3 && d >= 1 && !secs.includes(d)) secs.push(d);
  secs = karistir(secs);

  const ikon = def.ikon != null && String(def.ikon).trim() ? String(def.ikon) : '⭐';
  const renk = renkGecerli(def.renk);
  const UST = api.kutu('bm-say-ogeler');
  const ALT = api.kutu('bm-say-secenekler');
  let sayac = 0;

  for (let i = 0; i < N; i++) {
    const b = dugme('bm-oge', '', 'Saymak için dokun');
    b.append(ikonYap({ ikon, renk }));
    const rozet = el('span', 'bm-rozet');
    rozet.setAttribute('aria-hidden', 'true');
    b.append(rozet);
    api.dokun(b, () => {
      if (b.dataset.no) { // sayılmış öğe: sayısını tekrar söyle
        api.zipla(b);
        api.speak(sayiKelime(+b.dataset.no));
        api.kilitle(250);
        return;
      }
      sayac++;
      b.dataset.no = String(sayac);
      rozet.textContent = String(sayac);
      b.classList.add('bm-sayildi');
      api.sfx('pop');
      api.zipla(b);
      api.speak(sayiKelime(sayac));
      api.kilitle(300);
      if (sayac === N) ALT.bolge.classList.add('bm-hazir');
    });
    UST.izgara.append(b);
  }

  let dogruBtn = null;
  secs.forEach((n, i) => {
    const b = dugme('bm-kart bm-sayi', '', sayiKelime(n));
    b.style.setProperty('--kart-renk', SAYI_RENK[i % SAYI_RENK.length]);
    const r = el('span', 'bm-rakam');
    r.textContent = String(n);
    b.append(r, noktalar(n));
    if (n === N) dogruBtn = b;
    api.dokun(b, () => {
      if (n === N) api.basari(b, [`${buyukHarf(sayiKelime(n))}!`]);
      else if (api.yanlis(b) >= 2) api.ipucu([dogruBtn]);
    });
    ALT.izgara.append(b);
  });

  api.yerlesim(() => {
    const b = api.bolgeler();
    const Ho = Math.round(clamp(b.H * 0.36, 96, 200));
    const altR = { x: 0, y: b.H - Ho, w: b.W, h: Ho };
    if (altR.y < b.B) { altR.x = b.B; altR.w = b.W - 2 * b.B; }
    const fA = izgaraSigdir(secs.length, altR, { g: b.g, oran: 1.05, max: 190, maxSatir: 1 });
    api.yerlestir(ALT, altR, fA, b.g);
    const ustAlt = b.H - Ho - b.g;
    const g2 = Math.round(b.g * 0.8);
    const R1 = { x: b.B, y: b.ust, w: b.W - 2 * b.B, h: ustAlt - b.ust };
    const R2 = { x: 0, y: b.B, w: b.W, h: ustAlt - b.B };
    const fU = enIyi(N, [R1, R2], { g: g2, oran: 1, max: 150, min: 48, tekSatirBonus: 1.05 });
    api.yerlestir(UST, fU.R, fU, g2);
  });
}

// sirala: adımlar karışık gösterilir; doğru sıradaki adıma dokununca üstteki numaralı yuvaya uçar.
function kurSirala(api) {
  const adimlar = (Array.isArray(api.def.adimlar) ? api.def.adimlar : []).map(normOp).filter(Boolean);
  const n = adimlar.length;
  if (!n) return false;
  const YUVA = api.kutu('bm-sira-yuvalar');
  const KART = api.kutu('bm-sira-kartlar');

  const yuvalar = adimlar.map((_, i) => {
    const y = el('div', 'bm-yuva');
    const no = el('span', 'bm-yuva-no');
    no.textContent = String(i + 1);
    y.append(no);
    YUVA.izgara.append(y);
    return y;
  });

  let sira = karistir(adimlar.map((_, i) => i));
  for (let d = 0; n > 1 && d < 12 && sira.every((v, i) => v === i); d++) sira = karistir(sira);

  const kartlar = new Array(n);
  sira.forEach((k) => {
    const a = adimlar[k];
    const b = dugme('bm-kart bm-sira-kart', '', a.ses || `Adım ${k + 1}`);
    b.style.setProperty('--kart-bg', PASTEL[k % PASTEL.length]);
    b.append(ikonYap(a));
    kartlar[k] = b;
    api.dokun(b, () => sec(k, b));
    KART.izgara.append(b);
  });

  let siradaki = 0;
  function sec(k, b) {
    if (b.classList.contains('bm-bos')) return;
    if (k !== siradaki) {
      if (api.yanlis(b) >= 2) api.ipucu([kartlar[siradaki]]);
      return;
    }
    api.ipucuTemizle();
    const a = adimlar[k];
    const yuva = yuvalar[k];
    siradaki++;
    const son = siradaki === n;
    api.sfx('whoosh');
    const ucus = api.ucur(b, yuva).then(() => {
      yuva.classList.add('bm-dolu');
      yuva.style.setProperty('--kart-bg', PASTEL[k % PASTEL.length]);
      yuva.append(ikonYap(a));
      api.zipla(yuva);
      if (!son) api.sfx('pop');
    });
    if (son) {
      api.kilitliBekle(ucus.then(() => api.basari(yuva, a.ses ? [a.ses] : [])));
    } else {
      api.kilitliBekle(Promise.all([ucus, a.ses ? api.speak(a.ses) : null]), 450);
    }
  }

  api.yerlesim(() => {
    const b = api.bolgeler();
    const gY = Math.max(b.g, 26);
    const kullan = b.H - b.ust - b.g;
    const yuvaH = Math.round(kullan * 0.45);
    const yuvaR = { x: b.B, y: b.ust, w: b.W - 2 * b.B, h: yuvaH };
    const kartR = { x: 0, y: b.ust + yuvaH + b.g, w: b.W, h: kullan - yuvaH };
    if (kartR.y < b.B) { kartR.x = b.B; kartR.w = b.W - 2 * b.B; }
    const fK = izgaraSigdir(n, kartR, { g: b.g, max: 200, maxSatir: n > 5 ? 2 : 1 });
    const fY = izgaraSigdir(n, yuvaR, { g: gY, max: 170, min: 44, maxSatir: n > 6 ? 2 : 1 });
    const kY = Math.min(fY.w, fK.w);
    api.yerlestir(YUVA, yuvaR, { cols: fY.cols, w: kY, h: kY }, gY);
    api.yerlestir(KART, kartR, fK, b.g);
  });
}

// esles: bir gruptan birine, öteki gruptan eşine dokun; doğruysa çizgiyle bağlanır.
function kurEsles(api) {
  const ciftler = (Array.isArray(api.def.ciftler) ? api.def.ciftler : []).map((c) => {
    if (Array.isArray(c) && c.length >= 2) return [normOp(c[0]), normOp(c[1])];
    if (c && typeof c === 'object') return [normOp(c.sol ?? c.a), normOp(c.sag ?? c.b)];
    return null;
  }).filter((c) => c && c[0] && c[1]);
  const n = ciftler.length;
  if (!n) return false;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bm-cizgiler');
  svg.setAttribute('aria-hidden', 'true');
  api.sahne.prepend(svg);
  const AK = api.kutu('bm-esles-a');
  const BK = api.kutu('bm-esles-b');

  const ogeA = karistir(ciftler.map((c, i) => ({ yan: 'a', cift: i, op: c[0] })));
  let ogeB = karistir(ciftler.map((c, i) => ({ yan: 'b', cift: i, op: c[1] })));
  for (let d = 0; n > 1 && d < 12 && ogeB.every((o, i) => o.cift === ogeA[i].cift); d++) ogeB = karistir(ogeB);

  for (const o of [...ogeA, ...ogeB]) {
    o.btn = dugme('bm-kart bm-esles-kart', '', o.op.ses || 'Eşini bul');
    o.btn.append(ikonYap(o.op));
    (o.yan === 'a' ? AK : BK).izgara.append(o.btn);
    api.dokun(o.btn, () => dokunus(o));
  }

  const anahtar = (op) => `${op.ikon}|${op.renk}`;
  // Aynı görünen öğeler (ör. iki 🥛) birbirinin yerine geçebilir.
  const uyar = (a, b) => a.cift === b.cift
    || anahtar(ciftler[a.cift][1]) === anahtar(b.op)
    || anahtar(ciftler[b.cift][0]) === anahtar(a.op);

  let secili = null;
  let eslesen = 0;
  let duzen = 'satir';
  let kalinlik = 10;
  const baglar = [];

  function dokunus(o) {
    if (o.eslesti) return;
    if (!secili || secili.yan === o.yan) {
      if (secili) secili.btn.classList.remove('bm-secili');
      if (secili === o) { secili = null; return; }
      secili = o;
      o.btn.classList.add('bm-secili');
      api.sfx('pop');
      return;
    }
    const a = secili.yan === 'a' ? secili : o;
    const b = secili.yan === 'a' ? o : secili;
    if (uyar(a, b)) {
      api.ipucuTemizle();
      a.eslesti = b.eslesti = true;
      secili = null;
      const renk = CIFT_RENK[eslesen % CIFT_RENK.length];
      for (const x of [a, b]) {
        x.btn.classList.remove('bm-secili');
        x.btn.classList.add('bm-eslesti');
        x.btn.style.setProperty('--cift-renk', renk);
      }
      baglar.push({ a: a.btn, b: b.btn, renk, yeni: true });
      ciz();
      eslesen++;
      const sesler = [a.op.ses, b.op.ses].filter(Boolean);
      if (eslesen === n) { api.basari(o.btn, sesler); return; }
      api.sfx('pop');
      api.zipla(a.btn);
      api.zipla(b.btn);
      api.kilitliBekle(sesler.length ? api.speak(sesler.join('. ')) : null, 450);
    } else if (api.yanlis(o.btn) >= 2) {
      const karsi = (secili.yan === 'a' ? ogeB : ogeA)
        .find((x) => !x.eslesti && (secili.yan === 'a' ? uyar(secili, x) : uyar(x, secili)));
      if (karsi) api.ipucu([karsi.btn]);
    }
  }

  function svgEl(ad, attrs) {
    const e = document.createElementNS(SVG_NS, ad);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function ciz() {
    while (svg.firstChild) svg.firstChild.remove();
    for (const bg of baglar) {
      const p = api.konum(bg.a), q = api.konum(bg.b);
      let x1, y1, x2, y2;
      if (duzen === 'satir') { x1 = p.x + p.w / 2; y1 = p.y + p.h; x2 = q.x + q.w / 2; y2 = q.y; }
      else { x1 = p.x + p.w; y1 = p.y + p.h / 2; x2 = q.x; y2 = q.y + q.h / 2; }
      const cizgi = svgEl('line', { x1, y1, x2, y2, stroke: bg.renk, 'stroke-width': kalinlik, 'stroke-linecap': 'round' });
      svg.append(
        cizgi,
        svgEl('circle', { cx: x1, cy: y1, r: kalinlik * 0.95, fill: bg.renk }),
        svgEl('circle', { cx: x2, cy: y2, r: kalinlik * 0.95, fill: bg.renk }),
      );
      if (bg.yeni && api.hareket && typeof cizgi.animate === 'function') {
        const L = Math.hypot(x2 - x1, y2 - y1) || 1;
        cizgi.setAttribute('stroke-dasharray', `${L} ${L}`);
        cizgi.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
      }
      bg.yeni = false;
    }
  }

  api.yerlesim(() => {
    const b = api.bolgeler();
    const g = b.g;
    // Yatay ekran: üstte bir grup, altta eşleri (satır); yer varsa sol/sağ sütun.
    const ara = Math.round(clamp(b.H * 0.14, 36, 120));
    const sH = (b.H - b.ust - ara) / 2;
    const RA = { x: b.B, y: b.ust, w: b.W - 2 * b.B, h: sH };
    const RB = { x: 0, y: b.ust + sH + ara, w: b.W, h: sH };
    if (RB.y < b.B) { RB.x = b.B; RB.w = b.W - 2 * b.B; }
    const kS = Math.min(
      izgaraSigdir(n, RA, { g, max: 190, maxSatir: 1 }).w,
      izgaraSigdir(n, RB, { g, max: 190, maxSatir: 1 }).w,
    );
    const RC = b.orta;
    const kC = Math.floor(Math.min((RC.h - (n - 1) * g) / n, RC.w * 0.3, 190));
    if (kC >= kS * 1.08) {
      duzen = 'sutun';
      api.yerlestir(AK, { x: RC.x + RC.w * 0.06, y: RC.y, w: kC, h: RC.h }, { cols: 1, w: kC, h: kC }, g);
      api.yerlestir(BK, { x: RC.x + RC.w * 0.94 - kC, y: RC.y, w: kC, h: RC.h }, { cols: 1, w: kC, h: kC }, g);
      kalinlik = Math.round(clamp(kC * 0.07, 6, 14));
    } else {
      duzen = 'satir';
      api.yerlestir(AK, RA, { cols: n, w: kS, h: kS }, g);
      api.yerlestir(BK, RB, { cols: n, w: kS, h: kS }, g);
      kalinlik = Math.round(clamp(kS * 0.07, 6, 14));
    }
    api.kok.dataset.duzen = duzen;
    ciz();
  });
}

// hafiza: kartlar ters; ikişer çevir, eşleri bul.
function kurHafiza(api) {
  let ikonlar = (Array.isArray(api.def.ikonlar) ? api.def.ikonlar : [])
    .map((x) => (x && typeof x === 'object' ? x.ikon : x))
    .filter((x) => x != null && String(x).trim())
    .map(String);
  ikonlar = [...new Set(ikonlar)];
  if (ikonlar.length > 6) ikonlar = karistir(ikonlar).slice(0, 6);
  if (!ikonlar.length) return false;

  const kartlar = karistir([...ikonlar, ...ikonlar]).map((ikon) => ({ ikon }));
  const K = api.kutu('bm-hafiza');
  for (const c of kartlar) {
    const b = dugme('bm-hkart', '', 'Kartı çevir');
    const icK = el('span', 'bm-hkart-ic');
    const arka = el('span', 'bm-yuz bm-yuz-arka');
    const pati = el('span', 'bm-pati');
    pati.textContent = '🐾';
    arka.append(pati);
    const on = el('span', 'bm-yuz bm-yuz-on');
    on.append(ikonYap({ ikon: c.ikon }));
    icK.append(arka, on);
    b.append(icK);
    c.btn = b;
    api.dokun(b, () => cevir(c));
    K.izgara.append(b);
  }

  let acik = [];
  let bulunan = 0;
  function cevir(c) {
    if (c.bulundu || c.acik || acik.length >= 2) return;
    c.acik = true;
    c.btn.classList.add('bm-acik');
    api.sfx('pop');
    acik.push(c);
    if (acik.length < 2) return;
    const [x, y] = acik;
    if (x.ikon === y.ikon) {
      api.kilitliBekle(null, 470);
      api.zamanla(() => {
        x.bulundu = y.bulundu = true;
        acik = [];
        x.btn.classList.add('bm-eslesti');
        y.btn.classList.add('bm-eslesti');
        bulunan++;
        if (bulunan === ikonlar.length) { api.basari(y.btn); return; }
        api.sfx('star');
        api.zipla(x.btn);
        api.zipla(y.btn);
      }, 420);
    } else {
      api.kilitliBekle(null, 800);
      api.zamanla(() => {
        api.yanlis([x.btn, y.btn], { kilitMs: 900 });
        api.zamanla(() => {
          x.acik = y.acik = false;
          x.btn.classList.remove('bm-acik');
          y.btn.classList.remove('bm-acik');
          acik = [];
        }, 650);
      }, 750);
    }
  }

  api.yerlesim(() => {
    const b = api.bolgeler();
    const f = enIyi(kartlar.length, [b.orta, b.alt], { g: b.g, oran: 0.84, max: 210, maxSatir: 3 });
    api.yerlestir(K, f.R, f, b.g);
  });
}

// ───────────────────────── Ortak yardımcılar ─────────────────────────

function el(tag, sinif) {
  const e = document.createElement(tag);
  if (sinif) e.className = sinif;
  return e;
}

function dugme(sinif, metin, etiket) {
  const b = el('button', sinif);
  b.type = 'button';
  if (metin) b.textContent = metin;
  if (etiket) b.setAttribute('aria-label', etiket);
  return b;
}

function bekle(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function karistir(dizi) {
  const a = dizi.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function azHareket() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
}

function sayiKelime(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 10) return BIRLER[n];
  if (n < 100) return ONLAR[Math.floor(n / 10)] + (n % 10 ? ` ${BIRLER[n % 10]}` : '');
  return String(n);
}

function buyukHarf(s) { return s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s; }

// "Aferin! Kırmızıyı buldun!" + "Ali" → "Aferin Ali! Kırmızıyı buldun!"
function adEkle(metin, ad) {
  const m = String(metin).trim();
  if (!ad) return m;
  if (m.toLocaleLowerCase('tr').includes(ad.toLocaleLowerCase('tr'))) return m;
  const r = m.match(/^([^!.?,]{1,24}?)\s*!/);
  if (r && r[1].trim().split(/\s+/).length <= 2) return `${r[1].trim()} ${ad}!${m.slice(r[0].length)}`;
  return `${ad}, ${m}`;
}

function turBul(def) {
  if (!def || typeof def !== 'object') return null;
  const t = String(def.tur || '').toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z]/g, '');
  const harita = {
    sec: 'sec', secim: 'sec', say: 'say', sayma: 'say', sirala: 'sirala', siralama: 'sirala',
    esles: 'esles', esle: 'esles', eslestir: 'esles', eslestirme: 'esles', hafiza: 'hafiza', hafizaoyunu: 'hafiza',
  };
  if (harita[t]) return harita[t];
  if (Array.isArray(def.secenekler) && def.secenekler.some((o) => o && typeof o === 'object')) return 'sec';
  return null;
}

function renkGecerli(r) {
  if (typeof r !== 'string' || !r.trim()) return '';
  const s = r.trim();
  const anahtar = s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u');
  if (RENK_ADI[anahtar]) return RENK_ADI[anahtar];
  try { if (window.CSS && typeof CSS.supports === 'function') return CSS.supports('color', s) ? s : ''; } catch (_) {}
  return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s : '';
}

function normOp(o) {
  if (o == null) return null;
  if (typeof o === 'string' || typeof o === 'number') return { ikon: String(o), renk: '', ses: '', dogru: false };
  if (typeof o !== 'object') return null;
  return {
    ikon: o.ikon != null ? String(o.ikon) : '',
    renk: renkGecerli(o.renk),
    ses: typeof o.ses === 'string' ? o.ses.trim() : '',
    dogru: o.dogru === true || o.dogru === 'true' || o.dogru === 1,
  };
}

function resimMi(s) {
  return /^(data:image\/|blob:|https?:\/\/)/i.test(s) || /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(s);
}

// Kırmızı tabanlı emojiler: rengi istenen renge döndürülebilir (ör. "mavi balonu bul").
const KIRMIZI_TABAN = new Set(['🎈', '🍎', '❤️', '❤', '🚗', '🌹', '🍓', '🧣', '🎀', '🔴', '🟥', '🍒', '🌶️', '👕', '🧢', '🚒', '🪁']);
function renkHsl(css) {
  try {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = '#000'; c.fillStyle = css;
    const h = c.fillStyle;
    if (!/^#[0-9a-f]{6}$/i.test(h)) return null;
    const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh = (hh * 60 + 360) % 360;
    return { h: hh, s, l };
  } catch (_) { return null; }
}
function renkFiltresi(css) {
  const c = renkHsl(css);
  if (!c) return '';
  if (c.s < 0.15) return c.l > 0.7 ? 'grayscale(1) brightness(1.9)' : c.l < 0.25 ? 'grayscale(1) brightness(0.35)' : 'grayscale(1)';
  // Kırmızı emoji koyu; sarı/yeşil tonlara döndürünce kahverengiye kaçmasın diye parlat.
  let parlak = c.l < 0.35 ? ' brightness(0.65)' : c.l > 0.7 ? ' brightness(1.25)' : '';
  if (c.h >= 35 && c.h < 75) parlak = ' brightness(1.9) saturate(1.6)';
  else if (c.h >= 75 && c.h < 170) parlak = ' brightness(1.35) saturate(1.2)';
  return `hue-rotate(${Math.round(c.h)}deg) saturate(1.3)${parlak}`;
}

function ikonYap(o) {
  const k = el('span', 'bm-ikon');
  const ik = o.ikon ? String(o.ikon).trim() : '';
  const boyanir = !!(o.renk && ik && KIRMIZI_TABAN.has(ik));
  if (o.renk) {
    const d = el('span', 'bm-daire');
    d.style.background = o.renk;
    if (boyanir) d.style.opacity = '0.28';   // asıl renk nesnenin kendisinde
    k.append(d);
  }
  if (ik && resimMi(ik)) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = ik;
    k.append(img);
  } else if (ik || !o.renk) {
    const e = el('span', 'bm-emoji');
    e.textContent = ik || '❓';
    if (ik && [...ik].length > 2 && !(PIKTO && PIKTO.test(ik))) e.classList.add('bm-yazi');
    if (boyanir) e.style.filter = renkFiltresi(o.renk);
    k.append(e);
  }
  return k;
}

function noktalar(n) {
  const k = el('span', 'bm-noktalar');
  k.setAttribute('aria-hidden', 'true');
  if (!(n >= 1 && n <= 10)) { k.hidden = true; return k; }
  const zar = n <= 6;
  k.style.setProperty('--nc', zar ? 3 : 5);
  const hucre = zar ? 9 : 10;
  for (let i = 0; i < hucre; i++) {
    const d = el('span', 'bm-nokta');
    if (zar ? ZAR[n].includes(i) : i < n) d.classList.add('bm-dolu');
    k.append(d);
  }
  return k;
}

// n öğeyi R alanına en büyük boyutta yerleştiren sütun/satır sayısını bulur.
function izgaraSigdir(n, R, o = {}) {
  const g = o.g ?? 14, oran = o.oran ?? 1, max = o.max ?? 240, min = o.min ?? 60;
  const maxSatir = o.maxSatir ?? 99, bonus = o.tekSatirBonus ?? 1;
  let en = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (rows > maxSatir) continue;
    if (cols > 1 && Math.ceil(n / (cols - 1)) === rows) continue; // daha az sütunla aynı satır sayısı → o daha geniş
    const wMax = Math.min((R.w - (cols - 1) * g) / cols, ((R.h - (rows - 1) * g) / rows) * oran, max);
    const w = Math.max(min, Math.floor(wMax));
    const skor = wMax * (rows === 1 ? bonus : 1);
    if (!en || skor > en.skor) en = { cols, rows, w, h: Math.floor(w / oran), skor, R };
  }
  return en || { cols: n, rows: 1, w: min, h: Math.floor(min / oran), skor: -1, R };
}

function enIyi(n, bolgeler, o) {
  let en = null;
  for (const R of bolgeler) {
    if (!(R.w > 0 && R.h > 0)) continue;
    const f = izgaraSigdir(n, R, o);
    if (!en || f.skor > en.skor) en = f;
  }
  return en || izgaraSigdir(n, bolgeler[0], o);
}

function sesKatmani(ctx) {
  return {
    speak(metin, secenek) {
      const t = metin == null ? '' : String(metin).trim();
      if (!t || typeof ctx.speak !== 'function') return Promise.resolve();
      let p;
      try { p = ctx.speak(t, secenek || {}); } catch (e) { console.warn('[bulmaca] speak', e); return Promise.resolve(); }
      if (!p || typeof p.then !== 'function') return Promise.resolve();
      // Bazı tarayıcılarda konuşma bitiş olayı hiç gelmez: üst sınır koy.
      return Promise.race([p.then(() => {}, () => {}), bekle(Math.min(9000, 1800 + t.length * 110))]);
    },
    sfx(ad) {
      try { if (ctx.sfx && typeof ctx.sfx.play === 'function') ctx.sfx.play(ad); } catch (e) { console.warn('[bulmaca] sfx', e); }
    },
    durdur() {
      try {
        if (typeof ctx.stopSpeak === 'function') ctx.stopSpeak();
        else if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      } catch (_) {}
    },
  };
}

function cssYukle() {
  if (document.querySelector('link[href*="bulmaca.css"]')) return null;
  try {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../../css/bulmaca.css', import.meta.url).href;
    l.dataset.bulmaca = '1';
    document.head.appendChild(l);
    return l;
  } catch (_) { return null; }
}

function overlayAl(kok) {
  let ov = document.getElementById('overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'overlay';
    ov.dataset.bulmacaOlusturdu = '1';
    document.body.appendChild(ov);
  }
  const ilk = ovSayac === 0;
  if (ilk) ovOnceki = { hidden: ov.hidden, display: ov.style.display, visibility: ov.style.visibility };
  ov.appendChild(kok);
  ov.hidden = false;
  if (ilk) {
    const cs = getComputedStyle(ov);
    if (cs.display === 'none') ov.style.display = 'block';
    if (cs.visibility === 'hidden') ov.style.visibility = 'visible';
  }
  ov.classList.add('bm-acik');
  ovSayac++;
  let birakildi = false;
  return {
    el: ov,
    birak() {
      if (birakildi) return;
      birakildi = true;
      ovSayac = Math.max(0, ovSayac - 1);
      if (ovSayac > 0) return;
      ov.classList.remove('bm-acik');
      if (!ov.children.length) {
        if (ov.dataset.bulmacaOlusturdu) ov.remove();
        else if (ovOnceki) {
          ov.hidden = ovOnceki.hidden;
          ov.style.display = ovOnceki.display;
          ov.style.visibility = ovOnceki.visibility;
        }
      }
      ovOnceki = null;
    },
  };
}
