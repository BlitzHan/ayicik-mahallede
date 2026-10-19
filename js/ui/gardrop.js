// Ayıcık Mahallede — gardırop: şapka ve (ebeveynin fotoğrafladığı) gömlek seçimi.
// openWardrobe({ player, store, sfx, speak, kostumler, progress, saveProgress, onChange?, camera? }) → Promise<void> (kapanınca çözülür)
//   player      createBear sonucu (setCostume, setShirt)
//   kostumler   sahip olunan şapkalar [{ad, ikon}] (ikon: emoji)
//   progress    () → Progress (ya da nesne); saveProgress(patch) → alanları `kostum` ve `gomlek` yazılır
//   onChange    her seçimden sonra çağrılır (ör. gölge bayraklarını yenilemek için)
//   camera      verilirse sahne sola kaydırılır (setViewOffset), böylece ayı panelin yanında görünür; kapanınca geri alınır
// Çocuk okumaz: yazı yok, büyük yuvarlak düğmeler; her dokunuş ayıya anında uygulanır.

let acik = null;   // aynı anda tek gardırop

export function openWardrobe(opts = {}) {
  if (acik) return acik;
  acik = new Promise((resolve) => {
    baslat(opts || {}, resolve).catch((e) => { console.error('[gardirop] açılamadı:', e); resolve(); });
  }).finally(() => { acik = null; });
  return acik;
}

const SESSIZ = { play() {} };

async function baslat(o, resolve) {
  const { player, store } = o;
  const sfx = o.sfx || SESSIZ;
  const ilerleme = () => (typeof o.progress === 'function' ? o.progress() : o.progress) || {};
  const kaydet = (p) => { try { (o.saveProgress || ((x) => store.saveProgress(x)))(p); } catch (e) { console.warn('[gardirop] kayıt:', e); } };
  const guvenli = (fn) => { try { return fn && fn(); } catch (e) { console.warn('[gardirop]', e); } };

  const sapkalar = (o.kostumler || []).filter((k) => k && k.ad);
  const gomlekler = (store && store.shirts ? store.shirts() : [])
    .map((k) => ({ id: k.id, src: store.getShirt(k.id) })).filter((k) => k.src);

  // Şapka da gömlek de yoksa çocuğa bir ipucu söyle, açma.
  if (!sapkalar.length && !gomlekler.length) {
    guvenli(() => o.speak && o.speak('Altın topla, şapka kazan!'));
    resolve();
    return;
  }
  await cssYukle();

  const pr = ilerleme();
  let seciliSapka = pr.kostum ?? null;
  let seciliGomlek = gomlekler.some((g) => g.id === pr.gomlek) ? pr.gomlek : null;
  const gruplar = { sapka: [], gomlek: [] };   // [{dugme, deger}]

  const isaretle = (tur, deger) => {
    for (const g of gruplar[tur]) {
      const s = g.deger === deger;
      g.dugme.classList.toggle('gd-secili', s);
      g.dugme.setAttribute('aria-pressed', String(s));
    }
  };

  function giy(tur, deger, dugme, img) {
    if (tur === 'sapka') {
      seciliSapka = deger;
      guvenli(() => player.setCostume(deger));
      kaydet({ kostum: deger });
    } else {
      seciliGomlek = deger;
      guvenli(() => player.setShirt(deger ? img : null));
      kaydet({ gomlek: deger });
    }
    isaretle(tur, deger);
    guvenli(() => sfx.play('pop'));
    guvenli(() => o.onChange && o.onChange());
    dugme.classList.remove('gd-zipla'); void dugme.offsetWidth; dugme.classList.add('gd-zipla');
  }

  function secDugmesi(tur, deger, etiket, icerik, img) {
    const d = el('button', 'gd-sec', icerik);
    d.type = 'button';
    d.setAttribute('aria-label', etiket);
    d.setAttribute('aria-pressed', 'false');
    d.addEventListener('click', () => giy(tur, deger, d, img));
    basGeribildirimi(d);
    gruplar[tur].push({ dugme: d, deger });
    return d;
  }

  // ---- DOM ----
  const kok = el('div', 'gd-kok');
  kok.setAttribute('role', 'dialog');
  kok.setAttribute('aria-modal', 'true');
  kok.setAttribute('aria-label', 'Gardırop');
  kok.tabIndex = -1;

  const kapatBtn = el('button', 'gd-kapat', '✖️');
  kapatBtn.type = 'button';
  kapatBtn.setAttribute('aria-label', 'Kapat');
  basGeribildirimi(kapatBtn);

  const tepsi = el('div', 'gd-tepsi');
  if (sapkalar.length) {
    const izgara = el('div', 'gd-izgara');
    izgara.append(secDugmesi('sapka', null, 'Şapkasız', el('span', 'gd-emoji', '🚫')));
    for (const k of sapkalar) izgara.append(secDugmesi('sapka', k.ad, 'Şapka', el('span', 'gd-emoji', k.ikon || '🎩')));
    tepsi.append(izgara);
  }
  if (sapkalar.length && gomlekler.length) tepsi.append(el('div', 'gd-ayrac'));
  if (gomlekler.length) {
    const izgara = el('div', 'gd-izgara');
    const yok = secDugmesi('gomlek', null, 'Gömleksiz', [el('span', 'gd-emoji gd-soluk', '👕'), el('span', 'gd-emoji gd-ust', '🚫')]);
    yok.classList.add('gd-yok');
    izgara.append(yok);
    for (const g of gomlekler) {
      const im = el('img');
      im.src = g.src; im.alt = ''; im.draggable = false;
      izgara.append(secDugmesi('gomlek', g.id, 'Gömlek', im, im));
    }
    tepsi.append(izgara);
  }
  kok.append(tepsi, kapatBtn);

  isaretle('sapka', seciliSapka);
  isaretle('gomlek', seciliGomlek);

  // Oyunun pencere düzeyindeki dinleyicilerine dokunuş sızmasın (joystick, kamera sürükleme).
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel']) {
    kok.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }
  kok.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

  const ov = overlayAl(kok);
  guvenli(() => kok.focus({ preventScroll: true }));

  // ---- Kamera: sahneyi sola kaydır (ayı panelin yanında kalsın) ----
  const cam = o.camera && o.camera.setViewOffset ? o.camera : null;
  const kaydir = () => {
    if (!cam) return;
    const w = innerWidth, h = innerHeight;
    if (w > h) cam.setViewOffset(w, h, w * 0.22, 0, w, h); else cam.clearViewOffset();
  };
  kaydir();
  addEventListener('resize', kaydir);

  // ---- Kapanış ----
  let bitti = false;
  function kapat() {
    if (bitti) return;
    bitti = true;
    removeEventListener('keydown', tus, true);
    removeEventListener('keyup', tus, true);
    removeEventListener('resize', kaydir);
    kok.classList.add('gd-kapaniyor');
    setTimeout(() => {
      kok.remove();
      ov.birak();
      if (cam) cam.clearViewOffset();
      resolve();
    }, 230);
  }
  function tus(e) {   // gardırop açıkken klavye oyuna gitmesin (boşluk = zıpla)
    e.stopPropagation();
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Esc')) kapat();
  }
  addEventListener('keydown', tus, true);
  addEventListener('keyup', tus, true);
  kapatBtn.addEventListener('click', kapat);

  guvenli(() => o.speak && o.speak('Ne giymek istersin?'));
}

// ───────────────────────── Yardımcılar ─────────────────────────

function el(tag, cls, ...cocuklar) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of cocuklar.flat()) if (c != null) e.append(c);
  return e;
}

// Basılı tutarken küçül (CSS :active iOS'ta güvenilmez)
function basGeribildirimi(d) {
  const ac = () => d.classList.add('gd-bas');
  const kapa = () => d.classList.remove('gd-bas');
  d.addEventListener('pointerdown', ac);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) d.addEventListener(t, kapa);
}

function cssYukle() {
  if (document.querySelector('link[href*="gardrop.css"]')) return Promise.resolve();
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../../css/gardrop.css', import.meta.url).href;
    l.onload = l.onerror = () => resolve();
    document.head.append(l);
    setTimeout(resolve, 1500);
  });
}

// #overlay'i (yoksa oluşturarak) kullanır; kapanınca eski durumuna döndürür
function overlayAl(kok) {
  let ov = document.getElementById('overlay');
  let yarattim = false;
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'overlay';
    ov.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:50';
    document.body.append(ov);
    yarattim = true;
  }
  const onceki = { hidden: ov.hidden, display: ov.style.display, pe: ov.style.pointerEvents };
  ov.append(kok);
  ov.hidden = false;
  ov.style.pointerEvents = 'auto';
  if (getComputedStyle(ov).display === 'none') ov.style.display = 'block';
  return {
    birak() {
      if (yarattim) { ov.remove(); return; }
      if (ov.children.length) return;   // başka ekran da açık
      ov.hidden = onceki.hidden;
      ov.style.display = onceki.display;
      ov.style.pointerEvents = onceki.pe;
    },
  };
}
