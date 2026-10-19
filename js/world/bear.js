// Prosedürel, sevimli alçak-poligon ayı (çibi oran, çizgi film dış hattı). Model dosyası yok.
// createBear({kurk, renk, kostum, olcek, npc}) → {group, body, head, shadow, animate(state, dt), setCostume(name), setScarf(color), setShirt(img|null)}
// animate state: {speed 0..1, grounded, vy, landed, jumped, talking}
import * as THREE from 'three';

// 5 basamaklı, yumuşak toon gradyanı (doğrusal ışıkta ~0.22 / 0.38 / 0.6 / 0.82 / 1)
const gradient = (() => {
  const c = document.createElement('canvas'); c.width = 5; c.height = 1;
  const x = c.getContext('2d');
  ['#808080', '#a6a6a6', '#cbcbcb', '#ebebeb', '#ffffff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// Aynı renk ve ayarlar aynı malzemeyi paylaşır: sahne birleştirmesi malzemeye göre gruplar.
const toonCache = new Map();
export function toon(color, extra = {}) {
  const key = (color instanceof THREE.Color ? '#' + color.getHexString() : String(color)) + JSON.stringify(extra);
  let m = toonCache.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra }); toonCache.set(key, m); }
  return m;
}

// Ortak geometriler: tüm ayılar paylaşır (collapse kopya alır, bunlara dokunmaz)
const SPH = new THREE.SphereGeometry(1, 24, 18);   // büyük parçalar
const SPM = new THREE.SphereGeometry(1, 16, 12);   // orta parçalar ve büyük parçaların dış hattı
const SPS = new THREE.SphereGeometry(1, 10, 8);    // küçük ayrıntılar
const DOME = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const ARM = new THREE.CapsuleGeometry(0.11, 0.2, 4, 12);
const LEG = new THREE.CapsuleGeometry(0.14, 0.16, 4, 12);
const SMILE = new THREE.TorusGeometry(0.075, 0.012, 6, 16, Math.PI);   // gülümseme yayı
const SCARF = new THREE.TorusGeometry(0.31, 0.075, 8, 24);

// Ortak malzemeler
const OUTLINE = new THREE.MeshBasicMaterial({ color: '#2b1a10', side: THREE.BackSide });   // ters yüzlü dış hat kabuğu
OUTLINE.userData.outline = true;   // collapse birleşik dış hat ağını da userData.outline ile işaretler
const OUTLINE_FRONT = new THREE.MeshBasicMaterial({ color: '#2b1a10' });   // düz dış hat çizgisi (kol ağzı halkası)
const WHITE = new THREE.MeshBasicMaterial({ color: '#ffffff' });

// Yumuşak yuvarlak gölge (tek doku, tek geometri, tek malzeme)
const SHADOW_GEO = new THREE.CircleGeometry(0.5, 20);
const SHADOW_MAT = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ color: '#000', map, transparent: true, opacity: 0.38, depthWrite: false });
})();

// Kostüm geometrileri bir kez üretilir
const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());

function part(g, mat, sx, sy, sz, x, y, z, parent) {
  const m = new THREE.Mesh(g, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Dış hat: şeklin ~%5 büyütülmüş, ters yüzlü kopyası (kalınlık her eksende yaklaşık eşit)
const ol = s => s * 1.04 + 0.014;
function hull(g, sx, sy, sz, x, y, z, parent) {
  const o = part(g, OUTLINE, sx, sy, sz, x, y, z, parent);
  o.userData.outline = true;
  return o;
}
function outlined(g, hg, mat, sx, sy, sz, x, y, z, parent) {
  hull(hg, ol(sx), ol(sy), ol(sz), x, y, z, parent);
  return part(g, mat, sx, sy, sz, x, y, z, parent);
}

const LEG_Y = 0.36, HEAD_Y = 1.12, BROW_Y = 0.25;

// ---- Gömlek (setShirt) ----
// Kabuk: gövde küresinin altı ~%68'i (üst kenar birim küre y=0.36), gövdeden 0.014 büyük. Kollarda kısa kol.
const SHIRT_Y = 0.56;                              // gövde küresinin merkezi
const SHIRT_R = [0.454, 0.474, 0.414];             // kabuk yarıçapları (gövde 0.44/0.46/0.40 + 0.014)
const SHIRT_OL = SHIRT_R.map(r => r + 0.026);      // kabuğun dış hat kabuğu (gövde dış hattıyla aynı kalınlık)
const SHIRT_CUT = 0.36;                            // kabuğun üst kenarı (birim küre üzerinde y)
const SHIRT_T = 0.64;                              // dokunun kapladığı dünya genişliği (düzlemsel izdüşüm)
const SHIRT_CY = 0.5;                              // baskının merkezi (dünya y)
const SHIRT_PRINT = 0.6;                           // baskının doku içindeki payı

// Kabuk geometrisi tüm ayılarda ortak. UV: önden (+z) düz izdüşüm; baskı karnın önünde durur.
// Üçgenler ayrıştırılır (non-indexed): ön üçgenler izdüşüm UV'si, diğerleri tek sabit UV alır;
// böylece arka/yan tarafta baskı yansımaz ve üçgen içinde UV sıçraması (mip lekesi) olmaz.
function shirtShell() {
  return geo('shirt', () => {
    const t0 = Math.acos(SHIRT_CUT);
    const g = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, t0, Math.PI - t0).toNonIndexed();
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
      const on = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 > 0.2;
      for (let j = i; j < i + 3; j++) {
        if (on) uv.setXY(j, 0.5 + p.getX(j) * SHIRT_R[0] / SHIRT_T, 0.5 + (SHIRT_Y + p.getY(j) * SHIRT_R[1] - SHIRT_CY) / SHIRT_T);
        else uv.setXY(j, 0, 0);   // doku köşesi = taban renk
      }
    }
    return g;
  });
}
// Kısa kol: kolun üst yarım kapsülünü saran, altı açık kılıf (merkez = kolun üst yarım küresinin merkezi)
function sleeveGeo() {
  return geo('sleeve', () => {
    const R = 0.132, pts = [new THREE.Vector2(R, -0.13), new THREE.Vector2(R, -0.065), new THREE.Vector2(R, 0)];
    for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(R * Math.cos(a), R * Math.sin(a))); }
    return new THREE.LatheGeometry(pts, 16);
  });
}
// Yaka: kabuğun üst kenarına oturan ince halka
function collarGeo() {
  return geo('collar', () => { const g = new THREE.TorusGeometry(0.4, 0.022, 8, 32); g.rotateX(Math.PI / 2); return g; });
}
// Kol ağzı çizgisi: kısa kolun alt kenarını kapatan ince koyu halka (dış hat yan çizgileri burada biter)
function hemGeo() {
  return geo('hem', () => { const g = new THREE.TorusGeometry(0.134, 0.009, 6, 20); g.rotateX(Math.PI / 2); return g; });
}

function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Doku tuvali: taban renk = fotoğraf kenar piksellerinin ortalaması; ortada fotoğrafın merkez karesi baskı olarak.
function shirtTexture(img) {
  const iw = img.naturalWidth || img.videoWidth || img.width || 0, ih = img.naturalHeight || img.videoHeight || img.height || 0;
  const k = Math.min(iw, ih), sx = (iw - k) / 2, sy = (ih - k) / 2;   // merkez kare
  let base = '#90a4ae';
  try {
    const n = 24, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, sx, sy, k, k, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    let r = 0, gr = 0, b = 0, m = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (x > 1 && x < n - 2 && y > 1 && y < n - 2) continue;         // yalnız dış 2 piksellik halka
      const i = (y * n + x) * 4; r += d[i]; gr += d[i + 1]; b += d[i + 2]; m++;
    }
    base = '#' + [r, gr, b].map(v => Math.max(28, Math.min(245, Math.round(v / m))).toString(16).padStart(2, '0')).join('');
  } catch (_) { /* kirli tuval vb.: varsayılan renk */ }
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const P = N * SHIRT_PRINT, o = (N - P) / 2;
  rrect(g, o - 14, o - 14, P + 28, P + 28, P * 0.16); g.fillStyle = '#2b1a10'; g.fill();   // koyu dış çizgi
  rrect(g, o - 8, o - 8, P + 16, P + 16, P * 0.14); g.fillStyle = '#ffffff'; g.fill();     // beyaz pay
  g.save(); rrect(g, o, o, P, P, P * 0.1); g.clip();
  g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, k, k, o, o, P, P);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, base };
}

export function createBear({ kurk = '#a0622d', renk = '#e53935', kostum = null, olcek = 1, npc = false } = {}) {
  const fur = toon(kurk);
  const light = toon(new THREE.Color(kurk).lerp(new THREE.Color('#ffe7c4'), 0.6));
  const dark = toon('#2b1a10');
  const noseMat = toon('#15100d');
  const pupilMat = toon('#120c0a');
  const inMouth = toon('#7a2433');
  const blush = toon('#ff8fa3');
  const scarfMat = toon(renk).clone();   // setScarf rengi değiştirir: paylaşılmasın

  const group = new THREE.Group();          // dünya konumu, yönü
  const body = new THREE.Group();           // zıplama/ezilme animasyonu
  group.add(body);

  // ---- Gövde ----
  outlined(SPH, SPM, fur, 0.44, 0.46, 0.40, 0, 0.56, 0, body);
  const bellyPatch = part(SPM, light, 0.29, 0.31, 0.16, 0, 0.54, 0.27, body);   // göbek lekesi (gömlek giyince gizlenir)
  const tailG = new THREE.Group(); tailG.position.set(0, 0.38, -0.37); body.add(tailG);
  outlined(SPM, SPS, fur, 0.11, 0.11, 0.10, 0, 0, -0.01, tailG);         // kısa kuyruk

  // ---- Kafa ----
  const head = new THREE.Group(); head.position.set(0, HEAD_Y, 0.02); body.add(head);
  outlined(SPH, SPM, fur, 0.50, 0.44, 0.45, 0, 0, 0, head);
  outlined(SPM, SPS, light, 0.22, 0.17, 0.16, 0, -0.1, 0.36, head);     // yuvarlak burun-ağız çıkıntısı
  part(SPS, noseMat, 0.075, 0.055, 0.05, 0, -0.035, 0.49, head);         // parlak siyah burun
  part(SPS, WHITE, 0.022, 0.012, 0.01, -0.025, -0.012, 0.53, head);      // burun parıltısı
  const smile = part(SMILE, dark, 1, 1, 1, 0, -0.105, 0.508, head);      // gülümseme çizgisi
  smile.rotation.z = Math.PI;
  const mouth = part(SPS, inMouth, 0.06, 0.01, 0.03, 0, -0.15, 0.495, head);   // açık ağız (konuşurken)
  mouth.visible = false; mouth.userData.keep = true;                      // collapse'ta canlı kalır

  const ears = [], gaze = [], lidP = [], lids = [], browP = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.36, 0.34, -0.04);
    ear.rotation.set(0, s * 0.3, -s * 0.25); head.add(ear);
    outlined(SPM, SPS, fur, 0.17, 0.17, 0.09, 0, 0, 0, ear);
    part(SPS, light, 0.105, 0.105, 0.05, 0, -0.005, 0.05, ear);          // iç kulak
    ears.push(ear);

    // Göz: akı + göz bebeği + iki parıltı + üstten kapanan kapak
    const eg = new THREE.Group(); eg.position.set(s * 0.19, 0.07, 0.38); eg.rotation.y = s * 0.3; head.add(eg);
    part(SPM, WHITE, 0.095, 0.115, 0.05, 0, 0, 0.005, eg);
    const gz = new THREE.Group(); eg.add(gz);
    part(SPS, pupilMat, 0.062, 0.08, 0.03, 0, -0.005, 0.04, gz);
    part(SPS, WHITE, 0.022, 0.025, 0.015, 0.02, 0.035, 0.065, gz);
    part(SPS, WHITE, 0.012, 0.012, 0.008, -0.022, -0.035, 0.067, gz);
    const lp = new THREE.Group(); lp.position.set(0, 0.12, 0); lp.scale.y = 0.001; eg.add(lp);
    const lid = part(SPS, fur, 0.108, 0.128, 0.075, 0, -0.12, 0.025, lp);
    lid.visible = false; lid.userData.keep = true;                        // kırpma NPC'lerde de çalışsın
    gaze.push(gz); lidP.push(lp); lids.push(lid);

    // Kaş
    const bp = new THREE.Group(); bp.position.set(s * 0.19, BROW_Y, 0.33);
    bp.rotation.order = 'YXZ'; bp.rotation.set(-0.45, s * 0.44, 0); head.add(bp);
    part(SPS, dark, 0.075, 0.016, 0.025, 0, 0, 0.012, bp).rotation.z = -s * 0.15;
    browP.push(bp);

    // Yanak
    const ch = part(SPS, blush, 0.07, 0.045, 0.02, s * 0.31, -0.1, 0.335, head);
    ch.rotation.order = 'YXZ'; ch.rotation.set(0.14, s * 0.63, 0);
  }

  // ---- Kollar ve bacaklar ----
  const limbs = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.43, 0.82, 0.02); arm.rotation.z = s * 0.12; body.add(arm);
    part(ARM, fur, 1, 1, 1, 0, -0.17, 0, arm);
    hull(ARM, 1.18, 1.18, 1.18, 0, -0.17, 0, arm);
    part(SPS, light, 0.08, 0.05, 0.07, 0, -0.36, 0.06, arm);             // pati içi
    const leg = new THREE.Group(); leg.position.set(s * 0.2, LEG_Y, 0.02); body.add(leg);
    part(LEG, fur, 1, 1, 1, 0, -0.14, 0.03, leg);
    hull(LEG, 1.17, 1.17, 1.17, 0, -0.14, 0.03, leg);
    part(SPS, light, 0.11, 0.035, 0.14, 0, -0.32, 0.07, leg);            // pati altı
    limbs[s < 0 ? 'armL' : 'armR'] = arm;
    limbs[s < 0 ? 'legL' : 'legR'] = leg;
  }

  // ---- Atkı: çocuğun rengi ----
  const scarf = new THREE.Mesh(SCARF, scarfMat);
  scarf.rotation.x = Math.PI / 2; scarf.scale.set(1.06, 0.97, 1); scarf.position.set(0, 0.8, 0.01); body.add(scarf);
  const scarfP = new THREE.Group(); scarfP.position.set(0.2, 0.8, 0.25); scarfP.rotation.x = -0.2; body.add(scarfP);
  const scarfTail = part(SPM, scarfMat, 0.075, 0.19, 0.04, 0, -0.17, 0.075, scarfP);
  if (npc) { scarf.visible = false; scarfTail.visible = false; }

  // ---- Kostüm yuvası ----
  const hat = new THREE.Group(); hat.position.set(0, 0.38, 0); head.add(hat);

  // Yumuşak yuvarlak gölge
  const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;

  group.scale.setScalar(olcek);
  group.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // ---- Animasyon durumu ----
  let t = Math.random() * 20, phase = 0;
  let sm = 0, air = 0, airUp = 0, talk = 0, lean = 0;      // yumuşatılmış değerler
  let sq = 0, sqv = 0;                                      // ezilme/uzama yayı (+ ezilme, - uzama)
  let blinkIn = 1 + Math.random() * 3.5, blinkT = -1;

  function setCostume(name) {
    hat.clear();
    if (!name) return;
    if (name === 'fes') {
      const g = geo('fes', () => new THREE.CylinderGeometry(0.17, 0.21, 0.26, 18));
      part(g, toon('#c62828'), 1, 1, 1, 0, 0.08, 0, hat);
      hull(g, 1.07, 1.04, 1.07, 0, 0.08, 0, hat);
      const tassel = part(SPS, dark, 0.025, 0.13, 0.025, 0.15, 0.13, 0.03, hat);   // püskül
      tassel.rotation.z = -0.25;
    } else if (name === 'tac') {
      const gold = toon('#ffc107', { emissive: '#553300', side: THREE.DoubleSide });
      part(geo('tac', () => new THREE.CylinderGeometry(0.23, 0.23, 0.14, 10, 1, true)), gold, 1, 1, 1, 0, 0.06, 0, hat);
      const cone = geo('tacCone', () => new THREE.ConeGeometry(0.05, 0.13, 6));
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        part(cone, gold, 1, 1, 1, Math.sin(a) * 0.22, 0.195, Math.cos(a) * 0.22, hat);
      }
    } else if (name === 'kep') {
      const c = toon(renk);
      outlined(SPM, SPM, c, 0.34, 0.2, 0.33, 0, -0.03, 0, hat);            // kasket kubbesi
      part(SPM, c, 0.24, 0.025, 0.2, 0, -0.07, 0.3, hat);                  // siperlik
    } else if (name === 'cicek') {
      const fl = new THREE.Group(); fl.position.set(0.19, 0.04, 0.06); fl.rotation.z = -0.45; hat.add(fl);
      const pink = toon('#ff80ab');
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        part(SPS, pink, 0.06, 0.028, 0.06, Math.sin(a) * 0.085, 0, Math.cos(a) * 0.085, fl);
      }
      part(SPS, toon('#ffeb3b'), 0.05, 0.04, 0.05, 0, 0.012, 0, fl);
    } else if (name === 'kask') {
      outlined(DOME, DOME, toon('#43a047'), 0.44, 0.28, 0.42, 0, -0.08, 0, hat);
      part(SPS, WHITE, 0.07, 0.045, 0.02, 0, 0.02, 0.385, hat);            // kask işareti
    }
    hat.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  setCostume(kostum);

  function setScarf(color) { scarfMat.color.set(color); }

  // ---- Gömlek: setShirt(img | null). img: HTMLImageElement | canvas | ImageBitmap | dataURL (metin). null = çıkar. ----
  // Kabuk ve yaka gövdeye, kısa kollar kol gruplarına bağlanır: gövde/kol animasyonunu izler. NPC'lerde etkisizdir.
  const scarfZ0 = scarfP.position.z;
  let shirt = null, shirtTok = 0;
  function clearShirt() {
    if (!shirt) return;
    for (const o of shirt.parts) o.parent && o.parent.remove(o);
    shirt.tex.dispose(); shirt.mats.forEach(m => m.dispose());
    shirt = null;
    bellyPatch.visible = true; scarfP.position.z = scarfZ0;
  }
  function buildShirt(img) {
    const w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
    if (!w || !h) return;   // çözülemeyen görsel: gömlek giydirme
    let tx;
    try { tx = shirtTexture(img); } catch (e) { console.warn('[bear] gömlek dokusu', e); return; }
    const { tex, base } = tx;
    const shellMat = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient });
    const cloth = new THREE.Color(base);
    const sleeveMat = new THREE.MeshToonMaterial({ color: cloth, gradientMap: gradient });
    const collarMat = new THREE.MeshToonMaterial({ color: cloth.clone().multiplyScalar(0.78), gradientMap: gradient });
    const parts = [];
    // Gölge bayrakları: oyun parçaları sonradan (görsel yüklenince) eklenebilir, main.js'in castShadows turuna güvenme
    const add = (m, parent, outline) => { if (outline) m.userData.outline = true; else { m.castShadow = true; m.receiveShadow = true; } parent.add(m); parts.push(m); return m; };

    // Kabuk + dış hat (gövde dış hattıyla aynı kalınlıkta, kabuğun hemen dışında)
    const shell = new THREE.Mesh(shirtShell(), shellMat);
    shell.scale.set(...SHIRT_R); shell.position.y = SHIRT_Y;
    const hull = new THREE.Mesh(shirtShell(), OUTLINE);
    hull.scale.set(...SHIRT_OL); hull.position.y = SHIRT_Y;
    add(hull, body, true); add(shell, body, false);

    // Yaka: kabuğun üst kenarında
    const f = Math.sqrt(1 - SHIRT_CUT * SHIRT_CUT);
    const collar = new THREE.Mesh(collarGeo(), collarMat);
    collar.position.y = SHIRT_Y + SHIRT_CUT * SHIRT_R[1];
    collar.scale.set(SHIRT_R[0] * f / 0.4, 1, SHIRT_R[2] * f / 0.4);
    add(collar, body, false);

    // Kısa kollar (+ dış hat)
    for (const arm of [limbs.armL, limbs.armR]) {
      const oh = new THREE.Mesh(sleeveGeo(), OUTLINE);                 // dış hat: alt kenarı kolla aynı hizada
      oh.scale.set(1.12, 1.06, 1.12); oh.position.y = -0.0622;
      const sl = new THREE.Mesh(sleeveGeo(), sleeveMat);
      sl.position.y = -0.07;
      const hem = new THREE.Mesh(hemGeo(), OUTLINE_FRONT);
      hem.position.y = -0.2;
      add(oh, arm, true); add(sl, arm, false); add(hem, arm, true);
    }
    shirt = { parts, tex, mats: [shellMat, sleeveMat, collarMat] };
    bellyPatch.visible = false;            // açık renkli göbek lekesi kabuğu delmesin
    scarfP.position.z = scarfZ0 + 0.03;    // atkı ucu gömleğin önünde kalsın
  }
  function setShirt(img) {
    const tok = ++shirtTok;
    clearShirt();
    if (!img || npc) return;
    if (typeof img === 'string') {
      const im = new Image();
      im.onload = () => { if (tok === shirtTok) buildShirt(im); };
      im.src = img;
    } else if (img.complete === false) {
      img.addEventListener('load', () => { if (tok === shirtTok) buildShirt(img); }, { once: true });
    } else buildShirt(img);
  }

  // state: {speed (0..1), grounded, vy, landed, jumped, talking}
  function animate(s, dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.05);
    const k = r => 1 - Math.exp(-r * dt);
    const grounded = !!s.grounded, vy = s.vy || 0;
    const sp = Math.min(1, Math.max(0, s.speed || 0));

    t += dt;
    sm += (sp - sm) * k(10);
    air += ((grounded ? 0 : 1) - air) * k(grounded ? 22 : 14);
    airUp += ((grounded ? 0 : (vy > 0 ? 1 : 0.7)) - airUp) * k(16);
    talk += ((s.talking ? 1 : 0) - talk) * k(12);
    phase += dt * (7 + sm * 7);
    const g = 1 - air, idle = 1 - sm;

    // Ezilme / uzama: iniş ezer, zıplama uzatır, havada hıza göre uzar; yay hafif geri tepme verir
    if (s.landed) { sq = 1; sqv = 0; }
    if (s.jumped) { sq = -0.9; sqv = 0; }
    sqv += (-190 * sq - 15 * sqv) * dt; sq += sqv * dt;
    const q = sq - air * Math.min(1, Math.abs(vy) / 10) * (vy > 0 ? 0.55 : 0.3);
    const sk = q > 0 ? q * 0.26 : q * 0.22;
    const br = Math.sin(t * 2.3);                           // nefes
    const breath = br * 0.014 * idle;

    // Gövde: yürürken zıplama, yalpalama, öne eğilme; dururken nefes
    lean += ((grounded ? sm * 0.13 : 0.05) - lean) * k(10);
    body.position.y = Math.abs(Math.sin(phase)) * 0.075 * sm * g;
    body.rotation.x = lean;
    body.rotation.z = Math.sin(phase) * 0.05 * sm * g;
    body.scale.set(1 + sk * 0.55 - breath * 0.4, 1 - sk + breath, 1 + sk * 0.55 - breath * 0.4);

    // Bacaklar: yürüyüş salınımı, ayak kalkışı; havada toplu
    const sw = Math.sin(phase) * 0.9 * sm * g;
    limbs.legL.rotation.x = sw + 0.5 * air;
    limbs.legR.rotation.x = -sw - 0.3 * air;
    limbs.legL.position.y = LEG_Y + Math.max(0, -Math.cos(phase)) * 0.05 * sm * g;
    limbs.legR.position.y = LEG_Y + Math.max(0, Math.cos(phase)) * 0.05 * sm * g;

    // Kollar: ters salınım, havada yukarı, konuşurken küçük jest
    const asw = Math.sin(phase) * 0.75 * sm * g;
    const up = 0.12 + 2.33 * airUp;
    limbs.armL.rotation.x = -asw;
    limbs.armR.rotation.x = asw;
    limbs.armL.rotation.z = -up;
    limbs.armR.rotation.z = up + talk * g * (0.3 + Math.sin(t * 5) * 0.15);

    // Kafa: yürürken hafif sallanma, dururken etrafa bakınma, konuşurken sallanma, havada yukarı bakış
    head.position.y = HEAD_Y + br * 0.006 * idle + Math.abs(Math.sin(phase + 0.5)) * 0.015 * sm * g;
    head.rotation.z = Math.sin(phase + 0.8) * 0.05 * sm + idle * (Math.sin(t * 1.3) * 0.03 + Math.sin(t * 0.47) * 0.02) + talk * Math.sin(t * 9) * 0.07;
    head.rotation.x = Math.sin(phase * 2) * 0.025 * sm + talk * Math.sin(t * 11) * 0.05 + air * (vy > 0 ? -0.15 : 0.1);
    head.rotation.y = (Math.sin(t * 0.6) * 0.1 + Math.sin(t * 1.1 + 1) * 0.05) * idle * (1 - talk * 0.6) * g;

    // Kulaklar: yürürken çırpınır, havada geriye/aşağı yatar
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      ears[i].rotation.z = -sd * (0.25 + Math.sin(phase * 2 + 1) * 0.09 * sm + 0.45 * air + talk * Math.sin(t * 7 + i * 2) * 0.04);
    }

    // Kuyruk ve atkı ucu
    tailG.position.x = Math.sin(phase) * 0.035 * sm + Math.sin(t * 2.2) * 0.012 * idle;
    scarfP.rotation.x = -0.2 + sm * 0.75 + air * 0.5 + Math.sin(t * 9 + phase) * 0.07 * (sm + air * 0.5) + Math.sin(t * 1.7) * 0.03;
    scarfP.rotation.z = Math.sin(t * 8) * 0.08 * sm;

    // Göz kırpma: 3-5 sn'de bir (ara sıra çift); inişte göz kısılır
    blinkIn -= dt;
    let lid = 0;
    if (blinkT < 0 && blinkIn <= 0) blinkT = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      const u = blinkT / 0.17;
      if (u >= 1) { blinkT = -1; blinkIn = Math.random() < 0.2 ? 0.2 : 3 + Math.random() * 2; }
      else lid = Math.sin(u * Math.PI);
    }
    lid = Math.max(lid, Math.min(0.85, Math.max(0, sq - 0.45) * 1.6));
    const lidOn = lid > 0.04;
    const gx = (Math.sin(t * 0.8) * 0.012 + Math.sin(t * 2.1 + 2) * 0.005) * idle * g;
    const gy = Math.sin(t * 0.6 + 1) * 0.006 * idle + 0.012 * airUp;
    for (let i = 0; i < 2; i++) {
      lidP[i].scale.y = Math.max(0.001, lid);
      lids[i].visible = lidOn;
      gaze[i].position.set(gx, gy, 0);
      browP[i].position.y = BROW_Y + 0.03 * air + talk * Math.sin(t * 8 + i) * 0.008;
    }

    // Ağız: konuşurken açılıp kapanır, havada neşeyle hafif açık
    const mo = Math.max(talk * (0.3 + 0.7 * Math.abs(Math.sin(t * 10.5) * 0.7 + Math.sin(t * 16.3) * 0.3)), air * 0.55);
    mouth.visible = mo > 0.06;
    mouth.scale.set(0.05 + 0.025 * mo, 0.004 + 0.06 * mo, 0.03);
  }

  return { group, body, head, shadow, animate, setCostume, setScarf, setShirt };
}

const VC_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
const duzToon = m => m.isMeshToonMaterial && !m.transparent && !m.map && !m.vertexColors && m.emissive.getHex() === 0 && m.side === THREE.FrontSide;

// Bir grubun altındaki hareketsiz parçaları malzemeye göre tek ağa indirger (NPC'ler için).
// keep: dokunulmayacak alt ağaçlar (ör. konuşurken sallanan kafa).
export function collapse(root, keep = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), victims = [], renk = new Map();
  const kept = o => { for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return true; return false; };
  root.traverse(o => {
    if (!o.isMesh || o === root || Array.isArray(o.material) || kept(o) || o.userData.keep) return;
    if (!o.visible) { victims.push(o); return; }   // gizli parça (NPC atkısı) birleşince görünmesin
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // Düz renkli opak toon parçalar tek ağda; renk köşe rengi olarak taşınır (NPC başına çizim çağrısı azalır)
    let key = o.material;
    if (duzToon(o.material)) { key = VC_MAT; renk.set(g, o.material.color); }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
    victims.push(o);
  });
  if (victims.length < 2) return;
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of groups) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = mat === VC_MAT ? new Float32Array(n * 3) : null;
    let k = 0;
    for (const g of geos) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3);
      if (col) { const r = renk.get(g); for (let i = k; i < k + c; i++) { col[i * 3] = r.r; col[i * 3 + 1] = r.g; col[i * 3 + 2] = r.b; } }
      k += c; g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    if (mat.userData && mat.userData.outline) mesh.userData.outline = true;   // birleşik dış hat ağı gölge düşürmesin
    root.add(mesh);
  }
}
