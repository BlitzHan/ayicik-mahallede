// Küçük yardımcılar: emoji sprite, basit hayvan modelleri, ağaç, ev, cami, kule...
import * as THREE from 'three';
import { toon, createBear, collapse } from './bear.js';

const emojiCache = new Map();
export function emojiTexture(emoji, size = 128, bg = null) {
  const k = emoji + size + bg;
  if (emojiCache.has(k)) return emojiCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); x.fill(); }
  x.font = `${size * 0.72}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, size / 2, size / 2 + size * 0.05);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  emojiCache.set(k, t);
  return t;
}
export function emojiSprite(emoji, scale = 1, bg = null) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji, 128, bg), depthWrite: false }));
  s.scale.setScalar(scale);
  return s;
}
export function textSprite(text, { color = '#4a3311', bg = 'rgba(255,255,255,.9)', size = 64 } = {}) {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  x.font = `bold ${size}px ui-rounded, system-ui, sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + size;
  c.width = w; c.height = size * 1.5;
  x.font = `bold ${size}px ui-rounded, system-ui, sans-serif`;
  x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, w, c.height, c.height / 2); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(w / c.height * 0.6, 0.6, 1);
  return s;
}

export function mesh(geo, color, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, typeof color === 'string' || typeof color === 'number' ? toon(color) : color);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

// Ortak palet: aynı renk aynı malzeme, sahne birleştirmesinde tek çizim çağrısı
export const PAL = {
  beyaz: '#fff8ec', tas: '#efe6d6', koyuTas: '#bcaaa4', ahsap: '#a0642e', koyuAhsap: '#5d3a1a',
  kiremit: '#e0533a', cam: '#8fd3f4', altin: '#ffc107', yaprak: '#5cb85c', koyuYaprak: '#2e8b3e',
  acikYaprak: '#8bd450', gri: '#90a4ae', koyuGri: '#546e7a', kirmizi: '#e53935', mavi: '#1e88e5', sari: '#ffd54f',
};

// Dış hat: büyük parçaların arkasına ters yüzlü, biraz büyük koyu kabuk (ayıyla aynı çizgi film çizgisi)
const EDGE = new THREE.MeshBasicMaterial({ color: '#2b1a10', side: THREE.BackSide });
EDGE.userData.outline = true;
const _c = new THREE.Vector3(), _s = new THREE.Vector3();
export function edge(m, t = 0.05) {
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  g.boundingBox.getCenter(_c); g.boundingBox.getSize(_s);
  const o = new THREE.Mesh(g, EDGE);
  o.userData.outline = true;
  o.rotation.copy(m.rotation);
  o.scale.set(m.scale.x + 2 * t / Math.max(_s.x, 1e-3), m.scale.y + 2 * t / Math.max(_s.y, 1e-3), m.scale.z + 2 * t / Math.max(_s.z, 1e-3));
  // Geometri merkezi orijinde değilse kabuğu kaydır, şekle ortalı kalsın
  const off = new THREE.Vector3(_c.x * (m.scale.x - o.scale.x), _c.y * (m.scale.y - o.scale.y), _c.z * (m.scale.z - o.scale.z)).applyEuler(m.rotation);
  o.position.copy(m.position).add(off);
  (m.parent || m).add(o);
  return m;
}

export function tree(x, y, z, s = 1, leaf = '#4caf50') {
  // Yuvarlak, kabarık çizgi film ağacı. Taç y 1.8..3.9, yatay yarıçap en fazla 1.7. Üçgen ~780 (dış hat dahil)
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
  // Üstteki toplar leaf renginin %15 açığı
  const acik = '#' + new THREE.Color(leaf).offsetHSL(0, 0, 0.15).getHexString();

  // Gövde: hafif kıvrık, konik (yarıçap en fazla 0.4)
  const gg = new THREE.CylinderGeometry(0.18, 0.35, 2, 8, 4);
  const p = gg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin((p.getY(i) + 1) * 1.2) * 0.08);
  gg.computeVertexNormals();
  edge(mesh(gg, PAL.koyuAhsap, 0, 1, 0, g));

  // Kök çıkıntıları: üç küçük ezik küre
  const kok = new THREE.IcosahedronGeometry(1, 0);
  for (const a of [0.4, 2.5, 4.4]) mesh(kok, PAL.koyuAhsap, Math.cos(a) * 0.24, 0.06, Math.sin(a) * 0.24, g).scale.set(0.14, 0.1, 0.14);

  // Taç: 5 yumuşak top. Üst 3 açık, alt 2 leaf rengi
  const top = new THREE.IcosahedronGeometry(1, 1);   // 80 üçgen
  const taclar = [
    [0, 3.0, 0, 0.9, 0.85, 0.9, acik],
    [0.75, 2.62, 0.1, 0.85, 0.8, 0.85, acik],
    [-0.7, 2.62, -0.3, 0.85, 0.8, 0.85, acik],
    [0.2, 2.3, 0.75, 0.9, 0.5, 0.9, leaf],
    [-0.5, 2.3, -0.6, 0.9, 0.5, 0.9, leaf],
  ];
  const kl = taclar.map(([tx, ty, tz, sx, sy, sz, renk]) => {
    const k = mesh(top, renk, tx, ty, tz, g); k.scale.set(sx, sy, sz); return k;
  });
  edge(kl[0]);   // en büyük üst top

  // 4 kırmızı elma: en üst topun yüzeyinde
  const elma = new THREE.IcosahedronGeometry(0.12, 0);
  for (const [a, b] of [[0.6, 0.85], [2.4, 0.95], [3.7, 0.8], [5.3, 1.0]]) {
    mesh(elma, PAL.kirmizi, Math.sin(b) * Math.cos(a) * 0.95, 3.0 + Math.cos(b) * 0.9, Math.sin(b) * Math.sin(a) * 0.95, g);
  }
  return g;
}

export function flower(x, y, z, color) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), '#2e7d32', 0, 0.17, 0, g);
  mesh(new THREE.SphereGeometry(0.1, 8, 6), color, 0, 0.36, 0, g);
  mesh(new THREE.SphereGeometry(0.05, 6, 4), '#ffeb3b', 0, 0.38, 0.06, g);
  return g;
}

export function house(w, h, d, wall = '#fff3e0', roof = '#e53935') {
  const g = new THREE.Group();
  const hw = w / 2, hd = d / 2, B = PAL.beyaz;
  const zf = hd + 0.03;                        // ön yüzdeki süslerin düzlemi
  const dh = Math.min(1.9, h * 0.55);          // kapı yüksekliği
  const kat = h * 0.66;                        // kat kuşağı yüksekliği

  // Kiremit çatı: 4 yöne eğimli (kırma). a,b = taban yarı boyutları, r = sırt yarı uzunluğu, t = yükseklik
  const cati = (a, b, r, t) => {
    const A = [-a, 0, b], Bb = [a, 0, b], C = [a, 0, -b], D = [-a, 0, -b], R1 = [-r, t, 0], R2 = [r, t, 0];
    const f = [A, Bb, R2, A, R2, R1,   // ön
      C, D, R1, C, R1, R2,             // arka
      Bb, C, R2,                       // sağ
      D, A, R1,                        // sol
      A, D, C, A, C, Bb];              // alt
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(f.flat(), 3));
    geo.computeVertexNormals();
    return geo;
  };

  // Gövde, ahşap sokle, kat kuşağı ve köşe şeritleri
  edge(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0, g), 0.05);
  mesh(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), PAL.ahsap, 0, 0.1, 0, g);
  mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), B, 0, kat, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, h, 0.14), B, sx * hw, h / 2, sz * hd, g);

  // Saçak altı beyaz şerit + kırma çatı + yuvarlak sırt
  mesh(new THREE.BoxGeometry(w + 0.7, 0.1, d + 0.7), B, 0, h, 0, g);
  const a = hw + 0.35, b = hd + 0.35, t = 1.15;
  const rl = Math.max(0.3, Math.min(a - b + 0.3, a * 0.6));
  const y0 = h + 0.05;
  edge(mesh(cati(a, b, rl, t), roof, 0, y0, 0, g), 0.05);
  mesh(new THREE.CylinderGeometry(0.09, 0.09, rl * 2, 8), roof, 0, y0 + t, 0, g).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.1, 6, 4), roof, s * rl, y0 + t, 0, g);

  // Baca (taş) + beyaz başlık
  mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), PAL.ahsap, hw * 0.5, h + 0.95, -hd * 0.2, g);
  mesh(new THREE.BoxGeometry(0.64, 0.09, 0.64), B, hw * 0.5, h + 1.54, -hd * 0.2, g);

  // Kemerli üst: dikdörtgen + yarım silindir
  const kemerli = (kw, kh, th, col, z) => {
    mesh(new THREE.BoxGeometry(kw, kh - kw / 2, th), col, 0, (kh - kw / 2) / 2, z, g);
    mesh(new THREE.CylinderGeometry(kw / 2, kw / 2, th, 12, 1, false, Math.PI / 2, Math.PI), col, 0, kh - kw / 2, z, g).rotation.x = Math.PI / 2;
  };

  // Kapı: beyaz çerçeve, kemerli ahşap kapı, yuvarlak pencere, kol, saçak, basamak
  const dw = 0.95;
  kemerli(dw + 0.24, dh + 0.12, 0.06, B, zf);
  kemerli(dw, dh, 0.1, PAL.ahsap, zf + 0.025);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12), PAL.cam, 0, dh * 0.7, zf + 0.075, g).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.16, 0.025, 5, 12), B, 0, dh * 0.7, zf + 0.085, g);
  mesh(new THREE.SphereGeometry(0.055, 6, 4), PAL.sari, 0.3, dh * 0.4, zf + 0.1, g);              // kapı kolu
  mesh(new THREE.BoxGeometry(1.7, 0.1, 0.46), roof, 0, dh + 0.2, hd + 0.14, g).rotation.x = 0.32;  // kapı üstü saçak
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), PAL.ahsap, s * 0.72, dh + 0.03, hd + 0.1, g).rotation.x = 0.7;
  const bas = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 12, 1, false, -Math.PI / 2, Math.PI), B, 0, 0.08, hd, g);
  bas.scale.x = 2.2;                                                                                // tek basamak

  // Pencere: çerçeve + cam + çıtalar + açık kepenkler (+ denizlik ya da çiçek kutusu)
  const pw0 = Math.min(0.85, Math.max(0.62, w * 0.14)), sx0 = w * 0.3;
  const pencere = (x, y, pw, ph, kutu) => {
    const sw = pw * 0.4, ac = 0.45;
    mesh(new THREE.BoxGeometry(pw + 0.14, ph + 0.14, 0.06), B, x, y, zf, g);
    mesh(new THREE.BoxGeometry(pw, ph, 0.07), PAL.cam, x, y, zf + 0.015, g);
    mesh(new THREE.BoxGeometry(0.035, ph, 0.09), B, x, y, zf + 0.02, g);
    mesh(new THREE.BoxGeometry(pw, 0.035, 0.09), B, x, y, zf + 0.02, g);
    for (const s of [-1, 1]) {   // kepenkler dışa doğru hafif açık
      const k = mesh(new THREE.BoxGeometry(sw, ph + 0.08, 0.06), PAL.ahsap,
        x + s * (pw / 2 + 0.07 + sw / 2 * Math.cos(ac)), y, zf + 0.03 + sw / 2 * Math.sin(ac), g);
      k.rotation.y = -s * ac;
    }
    const yb = y - ph / 2;
    if (!kutu) { mesh(new THREE.BoxGeometry(pw + 0.26, 0.07, 0.17), B, x, yb - 0.1, zf + 0.05, g); return; }
    mesh(new THREE.BoxGeometry(pw + 0.2, 0.2, 0.22), PAL.ahsap, x, yb - 0.13, zf + 0.1, g);          // çiçek kutusu
    mesh(new THREE.BoxGeometry(pw + 0.12, 0.08, 0.16), PAL.yaprak, x, yb, zf + 0.1, g);               // yapraklar
    [PAL.kirmizi, PAL.sari, B, PAL.kirmizi].forEach((c, i) =>                                          // renkli çiçek topları
      mesh(new THREE.SphereGeometry(0.075, 6, 4), c, x + (i - 1.5) * (pw + 0.04) / 3, yb + 0.05 + (i % 2) * 0.03, zf + 0.11 + (i % 2 ? 0.03 : -0.03), g));
  };
  const ph0 = Math.min(0.85, h * 0.24), yg = dh * 0.68, yu = (kat + h) / 2 + 0.02;
  for (const s of [-1, 1]) {
    pencere(s * sx0, yg, pw0, ph0, true);          // alt kat: çiçek kutulu
    pencere(s * sx0, yu, pw0 * 0.85, 0.5, false);  // üst kat
  }

  // Cumba: üst katta çıkma pencere (saçağın altında kalır)
  const bw = Math.min(1.7, w * 0.28), by0 = kat + 0.07, bh = Math.min(0.9, h - by0 - 0.12);
  edge(mesh(new THREE.BoxGeometry(bw, bh, 0.32), wall, 0, by0 + bh / 2, hd + 0.16, g), 0.03);
  mesh(new THREE.BoxGeometry(bw + 0.1, 0.08, 0.38), B, 0, by0 - 0.01, hd + 0.19, g);
  mesh(new THREE.BoxGeometry(bw + 0.1, 0.07, 0.38), B, 0, by0 + bh + 0.03, hd + 0.19, g);
  mesh(new THREE.BoxGeometry(bw * 0.66 + 0.1, bh * 0.62 + 0.1, 0.03), B, 0, by0 + bh / 2, hd + 0.325, g);
  mesh(new THREE.BoxGeometry(bw * 0.66, bh * 0.62, 0.04), PAL.cam, 0, by0 + bh / 2, hd + 0.335, g);
  mesh(new THREE.BoxGeometry(0.03, bh * 0.62, 0.06), B, 0, by0 + bh / 2, hd + 0.34, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, bh * 0.62, 0.16), PAL.cam, s * (bw / 2 + 0.005), by0 + bh / 2, hd + 0.17, g);
  return g;
}

export function mosque() {
  // Osmanlı tarzı küçük cami: 8x8 taban (x,z -4..4), kubbe+alem tepesi ~9.4, minare (5.2, 0, -3) ~18 yüksek
  const g = new THREE.Group();
  const T = PAL.tas, K = PAL.koyuTas, G = PAL.gri, L = PAL.beyaz, PI = Math.PI;
  const altin = toon(PAL.altin, { emissive: '#3a2600' });
  const H = 4.3, cz = -0.7;                                   // salon yüksekliği ve salonun z merkezi (z -3.8..2.4)
  const EX = { depth: 0.04, bevelEnabled: false, curveSegments: 3 };

  // Yüzeye dik yönde dz kadar ileri koyup y ekseninde ry kadar döndürür
  const yuz = (geo, mat, x, y, z, ry, dz) => {
    const m = mesh(geo, mat, x + Math.sin(ry) * dz, y, z + Math.cos(ry) * dz, g);
    m.rotation.y = ry;
    return m;
  };
  // Kemerli şekil: altı düz, üstü yarım daire (toplam yükseklik h + w/2)
  const sekil = (w, h) => {
    const r = w / 2, s = new THREE.Shape();
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h); s.absarc(0, h, r, 0, PI, false);
    return s;
  };
  // Duvara oturan kemerli pencere: taş çerçeve + cam
  const pencere = (x, y, z, ry, w, h) => {
    yuz(new THREE.ExtrudeGeometry(sekil(w + 0.18, h + 0.09), EX), K, x, y - 0.09, z, ry, 0);
    yuz(new THREE.ShapeGeometry(sekil(w, h), 3), PAL.cam, x, y, z, ry, 0.047);
  };

  // Alt taban, salon, silme
  mesh(new THREE.BoxGeometry(8, 0.16, 8), K, 0, 0.08, 0, g);
  edge(mesh(new THREE.BoxGeometry(7.6, H, 6.2), T, 0, H / 2, cz, g), 0.05);
  mesh(new THREE.BoxGeometry(8, 0.22, 6.6), K, 0, H + 0.02, cz, g);
  mesh(new THREE.BoxGeometry(7.7, 0.1, 6.3), L, 0, 2.5, cz, g);                // ara kuşak
  const yt = H + 0.13;                                                          // çatı terası seviyesi

  // Yan ve arka yüz: iki sıra kemerli pencere
  for (const z of [-2.6, -0.7, 1.2]) for (const s of [-1, 1]) {
    pencere(s * 3.8, 0.7, z, s * PI / 2, 0.8, 1.0);
    pencere(s * 3.8, 2.85, z, s * PI / 2, 0.65, 0.55);
  }
  for (const x of [-2.3, 0, 2.3]) {
    pencere(x, 0.7, -3.8, PI, 0.8, 1.0);
    pencere(x, 2.85, -3.8, PI, 0.65, 0.55);
  }

  // Ana kubbe: kasnak (8 küçük pencere) + kurşun kubbe + altın alem
  mesh(new THREE.CylinderGeometry(2.85, 2.85, 1.0, 24, 1, true), T, 0, yt + 0.5, cz, g);
  const rk = 2.85 * Math.cos(PI / 24);
  for (let i = 0; i < 8; i++) {
    const a = PI / 24 + i * PI / 4;
    pencere(Math.sin(a) * rk, yt + 0.3, cz + Math.cos(a) * rk, a, 0.5, 0.36);
  }
  const yk = yt + 1.0;                                                          // kubbe tabanı
  mesh(new THREE.CylinderGeometry(2.97, 2.97, 0.14, 24, 1, true), K, 0, yk, cz, g);
  edge(mesh(new THREE.SphereGeometry(2.9, 20, 9, 0, PI * 2, 0, PI / 2), G, 0, yk, cz, g), 0.05);
  const ya = yk + 2.9;                                                          // kubbe tepesi
  mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 6), altin, 0, ya + 0.2, cz, g);
  mesh(new THREE.SphereGeometry(0.17, 8, 6), altin, 0, ya + 0.5, cz, g);
  mesh(new THREE.TorusGeometry(0.2, 0.035, 4, 12, PI * 1.7), altin, 0, ya + 0.85, cz, g).rotation.z = PI * 0.15;   // hilal

  // Dört köşede küçük kubbeler
  for (const x of [-3.05, 3.05]) for (const z of [-3.05, 1.65]) {
    mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.6, 12, 1, true), T, x, yt + 0.3, z, g);
    mesh(new THREE.SphereGeometry(0.88, 10, 5, 0, PI * 2, 0, PI / 2), G, x, yt + 0.6, z, g);
    mesh(new THREE.SphereGeometry(0.1, 6, 4), altin, x, yt + 1.5, z, g);
    mesh(new THREE.ConeGeometry(0.05, 0.24, 6), altin, x, yt + 1.68, z, g);
  }

  // Ön yüz: 3 kemerli revak (delikli ön duvar, sütunlar, kemer şeritleri, üstünde küçük kubbeler)
  const fs = new THREE.Shape();
  fs.moveTo(-3.8, 0); fs.lineTo(3.8, 0); fs.lineTo(3.8, 3.55); fs.lineTo(-3.8, 3.55);
  const cs = [-2.367, 0, 2.367], hr = 0.933;
  for (const cx of cs) {
    const hp = new THREE.Path();
    hp.moveTo(cx - hr, 0.16); hp.lineTo(cx + hr, 0.16); hp.lineTo(cx + hr, 2.15); hp.absarc(cx, 2.15, hr, 0, PI, false);
    fs.holes.push(hp);
  }
  yuz(new THREE.ExtrudeGeometry(fs, { depth: 0.3, bevelEnabled: false, curveSegments: 8 }), T, 0, 0, 3.4, 0, 0);
  mesh(new THREE.BoxGeometry(7.8, 0.14, 1.6), K, 0, 3.62, 3.2, g);              // revak çatı silmesi
  for (const cx of cs) {
    mesh(new THREE.TorusGeometry(hr, 0.065, 4, 12, PI), K, cx, 2.15, 3.72, g);   // yarım daire kemer
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.12, 1.99, 0.06), K, cx + s * hr, 1.155, 3.72, g);
    mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12, 1, true), T, cx, 3.82, 3.0, g);   // küçük kubbe kasnağı
    mesh(new THREE.SphereGeometry(0.95, 10, 5, 0, PI * 2, 0, PI / 2), G, cx, 3.94, 3.0, g);
    mesh(new THREE.SphereGeometry(0.08, 6, 4), altin, cx, 4.94, 3.0, g);
  }
  for (const x of [-3.55, -1.1835, 1.1835, 3.55]) {                               // sütunlar
    mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.12, 8), K, x, 0.22, 3.76, g);
    mesh(new THREE.CylinderGeometry(0.14, 0.15, 1.95, 8), L, x, 1.26, 3.76, g);
    mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.16, 8), K, x, 2.32, 3.76, g);
  }
  // Revağın arkasında ana kapı (ahşap, kemerli) ve iki yan pencere
  yuz(new THREE.ExtrudeGeometry(sekil(1.5, 2.0), EX), K, 0, 0.16, 2.4, 0, 0);
  yuz(new THREE.ExtrudeGeometry(sekil(1.28, 1.9), { depth: 0.08, bevelEnabled: false, curveSegments: 6 }), PAL.ahsap, 0, 0.16, 2.4, 0, 0);
  mesh(new THREE.BoxGeometry(0.03, 1.9, 0.02), K, 0, 1.11, 2.485, g);            // kapı kanat çizgisi
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.05, 6, 4), altin, s * 0.14, 1.0, 2.5, g);
  for (const s of [-1, 1]) pencere(s * 2.367, 0.95, 2.4, 0, 0.9, 1.15);

  // Minare: çokgen kaide, ince gövde, şerefe (korkuluklu), kurşun külah, altın alem
  const m = new THREE.Group(); m.position.set(5.2, 0, -3); g.add(m);
  mesh(new THREE.CylinderGeometry(0.94, 0.99, 0.3, 8), K, 0, 0.15, 0, m);
  edge(mesh(new THREE.CylinderGeometry(0.72, 0.84, 3.0, 8), T, 0, 1.8, 0, m), 0.05);
  mesh(new THREE.CylinderGeometry(0.52, 0.76, 0.5, 8), T, 0, 3.55, 0, m);       // pahlı geçiş
  edge(mesh(new THREE.CylinderGeometry(0.45, 0.52, 7.6, 16), T, 0, 7.6, 0, m), 0.05);
  for (const y of [6.0, 8.8]) mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.16, 16), L, 0, y, 0, m);
  mesh(new THREE.CylinderGeometry(0.92, 0.45, 0.45, 16), K, 0, 11.625, 0, m);   // şerefe altı
  mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.12, 16), T, 0, 11.9, 0, m);     // şerefe zemini
  for (let i = 0; i < 12; i++) {                                                // korkuluk dikmeleri
    const a = i / 12 * PI * 2;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5, 1, true), L, Math.sin(a) * 0.88, 12.21, Math.cos(a) * 0.88, m);
  }
  mesh(new THREE.TorusGeometry(0.88, 0.04, 3, 16), L, 0, 12.47, 0, m).rotation.x = PI / 2;
  mesh(new THREE.CylinderGeometry(0.36, 0.4, 2.34, 16), T, 0, 13.13, 0, m);     // şerefe üstü gövde
  mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), K, 0, 14.34, 0, m);
  edge(mesh(new THREE.ConeGeometry(0.52, 2.9, 16), G, 0, 15.85, 0, m), 0.04);   // kurşun külah
  mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.5, 6), altin, 0, 17.45, 0, m);
  mesh(new THREE.SphereGeometry(0.12, 8, 6), altin, 0, 17.72, 0, m);
  mesh(new THREE.TorusGeometry(0.17, 0.03, 4, 12, PI * 1.7), altin, 0, 18.0, 0, m).rotation.z = PI * 0.15;
  return g;
}

export function fountain() {
  // Cami avlusu şadırvanı. Kaide yarıçapı 1.75 (dış hat ile 1.8), çatı yarıçapı 2.15 (dış hat ile 2.2), yükseklik ~3.3. Üçgen ~900
  const g = new THREE.Group();
  const T = PAL.tas, K = PAL.koyuTas, B = PAL.beyaz, D = PAL.gri, PI = Math.PI;
  const A = toon(PAL.altin, { emissive: '#3a2600' });   // pirinç

  // Sekizgen taş kaide
  edge(mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.36, 8), T, 0, 0.18, 0, g));
  // Yarı saydam su yüzeyi
  mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 8), toon(PAL.cam, { transparent: true, opacity: 0.85 }), 0, 0.39, 0, g);
  // Merkez sekizgen gövde (y 0.4..2.3)
  mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.9, 8), T, 0, 1.35, 0, g);
  // Gövde üst çerçevesi
  mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.1, 8), K, 0, 2.27, 0, g);

  // Her yüzde (köşelerin arasında) bir pirinç musluk, altında taş oturak
  const musluk = new THREE.CylinderGeometry(0.055, 0.07, 0.2, 6);
  musluk.rotateX(PI / 2);                        // ekseni yüzeye dik yap
  const oturak = new THREE.BoxGeometry(0.36, 0.1, 0.26);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    mesh(musluk, A, sx * 0.8, 1.35, sz * 0.8, g).rotation.y = a;
    mesh(oturak, K, sx * 0.85, 0.95, sz * 0.85, g).rotation.y = a;
  }

  // 8 ince sütun (köşelerde), kaideden çatıya
  const sutun = new THREE.CylinderGeometry(0.07, 0.08, 2.14, 6);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2;
    mesh(sutun, B, Math.sin(a) * 1.4, 1.43, Math.cos(a) * 1.4, g);
  }

  // Hafif içbükey sekizgen saçaklı kurşun gri çatı (saçak yukarı kıvrık)
  const catiProfil = [[0, 0.9], [0.6, 0.76], [1.17, 0.56], [1.66, 0.4], [2.0, 0.3], [2.15, 0.32]];
  const cati = mesh(new THREE.LatheGeometry(catiProfil.map(([r, y]) => new THREE.Vector2(r, y)), 8), toon(PAL.gri, { side: THREE.DoubleSide }), 0, 2.0, 0, g);
  edge(cati);

  // Tepede küçük altın alem
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), A, 0, 3.0, 0, g);
  mesh(new THREE.SphereGeometry(0.14, 8, 6), A, 0, 3.16, 0, g);
  return g;
}

export function tower() {   // Galata benzeri taş kule
  const g = new THREE.Group();
  const T = PAL.tas, K = PAL.koyuTas, D = PAL.koyuGri, L = PAL.beyaz, PI = Math.PI;
  const altin = toon(PAL.altin, { emissive: '#3a2600' });
  const rot = PI / 16;                                           // 16 kenarlı gövdede kenar ortası +z yönüne gelsin
  const rY = y => 1.85 - (y - 0.35) * 0.35 / 8.55;               // gövde yarıçapı (y yüksekliğinde)
  const EX = { depth: 0.04, bevelEnabled: false, curveSegments: 3 };

  // Dönmüş silindir: kenar ortaları 0, 22.5, 45... derecede
  const sil = (rt, rb, h, y, mat) => {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat, 0, y, 0, g);
    m.rotation.y = rot;
    return m;
  };
  // Yüzeye dik dz kadar ileri koyup y ekseninde ry kadar döndürür
  const yuz = (geo, mat, x, y, z, ry, dz) => {
    const m = mesh(geo, mat, x + Math.sin(ry) * dz, y, z + Math.cos(ry) * dz, g);
    m.rotation.y = ry;
    return m;
  };
  // Kemerli şekil: altı düz, üstü yarım daire (toplam yükseklik h + w/2)
  const sekil = (w, h) => {
    const r = w / 2, s = new THREE.Shape();
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h); s.absarc(0, h, r, 0, PI, false);
    return s;
  };
  // Kemerli pencere: taş çerçeve + koyu gri açıklık. a = açı, y0 = alt kenar, rr = yüzey yarıçapı
  const pencere = (a, y0, w, h, rr) => {
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    yuz(new THREE.ExtrudeGeometry(sekil(w + 0.16, h + 0.08), EX), K, x, y0 - 0.08, z, a, -0.01);
    yuz(new THREE.ShapeGeometry(sekil(w, h), 3), D, x, y0, z, a, 0.037);
  };

  // Taş taban + gövde (yukarı doğru hafif incelen) + kat kuşakları
  mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.35, 16), K, 0, 0.175, 0, g);
  edge(sil(1.5, 1.85, 8.55, 4.625, T), 0.05);
  for (const y of [3.05, 5.6, 8.15]) sil(rY(y) + 0.06, rY(y) + 0.06, 0.16, y, K);

  // Küçük kemerli pencereler: 3 kat; alt katta ön yüzde ahşap kapı
  const rd = rY(1.2) * Math.cos(PI / 16);
  yuz(new THREE.ExtrudeGeometry(sekil(1.05, 1.25), EX), K, 0, 0.35, rd, 0, -0.01);
  yuz(new THREE.ExtrudeGeometry(sekil(0.85, 1.2), { depth: 0.1, bevelEnabled: false, curveSegments: 4 }), PAL.ahsap, 0, 0.35, rd, 0, -0.04);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.04, 5, 4), altin, s * 0.1, 1.0, rd + 0.07, g);
  for (const a of [PI / 2, PI, PI * 1.5]) pencere(a, 1.4, 0.38, 0.4, rY(1.7) * Math.cos(PI / 16));
  for (let k = 0; k < 4; k++) {
    pencere(PI / 4 + k * PI / 2, 4.0, 0.38, 0.4, rY(4.3) * Math.cos(PI / 16));
    pencere(k * PI / 2, 6.6, 0.38, 0.4, rY(6.9) * Math.cos(PI / 16));
  }

  // Seyir katı: konsollu geniş taban, 0.3 taşan balkon halkası, korkuluk, büyük kemerli pencereler
  sil(1.55, 1.95, 0.45, 9.125, K);
  sil(2.05, 2.05, 0.15, 9.425, K);
  edge(sil(1.72, 1.72, 1.5, 10.25, T), 0.05);
  for (let i = 0; i < 16; i++) {                                 // korkuluk dikmeleri
    const a = i / 16 * PI * 2;
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5, 1, true), L, Math.sin(a) * 1.92, 9.75, Math.cos(a) * 1.92, g);
  }
  mesh(new THREE.TorusGeometry(1.92, 0.045, 3, 24), L, 0, 10.02, 0, g).rotation.x = PI / 2;
  for (let k = 0; k < 8; k++) pencere(k * PI / 4, 10.05, 0.55, 0.5, 1.72 * Math.cos(PI / 16));
  sil(1.95, 1.8, 0.2, 11.1, K);

  // Konik kurşun külah + altın top
  edge(mesh(new THREE.ConeGeometry(2.0, 2.0, 16), D, 0, 12.2, 0, g), 0.05);
  mesh(new THREE.SphereGeometry(0.14, 8, 6), altin, 0, 13.22, 0, g);
  mesh(new THREE.ConeGeometry(0.045, 0.12, 6), altin, 0, 13.42, 0, g);
  return g;
}

export function school() {
  // Neşeli ilkokul: 9x5 gövde (x -4.5..4.5, z -2.5..2.5), çatı tepesi ~4.9, bayrak direği (5.5, 0, 2.5)
  const g = new THREE.Group();
  const Y = '#ffe082', R = PAL.kirmizi, B = PAL.beyaz, C = PAL.cam, M = PAL.mavi, D = PAL.koyuGri, PI = Math.PI;
  const H = 3.9, zf = 2.53;                                      // gövde yüksekliği, ön yüzdeki süs düzlemi

  // Gövde, süpürgelik, kat kuşağı, köşe şeritleri
  edge(mesh(new THREE.BoxGeometry(9, H, 5), Y, 0, H / 2, 0, g), 0.05);
  mesh(new THREE.BoxGeometry(9.1, 0.28, 5.1), D, 0, 0.14, 0, g);
  mesh(new THREE.BoxGeometry(9.08, 0.1, 5.08), B, 0, 2.0, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.16, H, 0.16), B, sx * 4.5, H / 2, sz * 2.5, g);

  // Saçaklı kırma çatı (4 yöne eğimli) + beyaz alın şeridi
  mesh(new THREE.BoxGeometry(9.7, 0.1, 5.7), B, 0, H, 0, g);
  const a = 4.85, b = 2.85, r = 2.5, t = 0.95, y0 = H + 0.05;
  const A0 = [-a, 0, b], B0 = [a, 0, b], C0 = [a, 0, -b], D0 = [-a, 0, -b], R1 = [-r, t, 0], R2 = [r, t, 0];
  const cf = [A0, B0, R2, A0, R2, R1, C0, D0, R1, C0, R1, R2, B0, C0, R2, D0, A0, R1, A0, D0, C0, A0, C0, B0];
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cf.flat(), 3));
  cg.computeVertexNormals();
  edge(mesh(cg, R, 0, y0, 0, g), 0.05);
  mesh(new THREE.CylinderGeometry(0.09, 0.09, r * 2, 8), R, 0, y0 + t, 0, g).rotation.z = PI / 2;

  // Pencere: beyaz çerçeve + cam + çıta (+ denizlik). Ön yüz için z, yan yüz için ry ile döner
  const pencere = (x, y, z, ry, pw, ph, denizlik) => {
    const put = (geo, col, dx, dz) => {
      const m = mesh(geo, col, x + Math.cos(ry) * dx + Math.sin(ry) * dz, y, z - Math.sin(ry) * dx + Math.cos(ry) * dz, g);
      m.rotation.y = ry;
      return m;
    };
    put(new THREE.BoxGeometry(pw + 0.16, ph + 0.16, 0.07), B, 0, 0);
    put(new THREE.BoxGeometry(pw, ph, 0.08), C, 0, 0.015);
    put(new THREE.BoxGeometry(0.04, ph, 0.1), B, 0, 0.02);
    put(new THREE.BoxGeometry(pw, 0.04, 0.1), B, 0, 0.02);
    if (denizlik) {
      const s = put(new THREE.BoxGeometry(pw + 0.34, 0.08, 0.2), B, 0, 0.06);
      s.position.y = y - ph / 2 - 0.12;
    }
  };
  for (const s of [-1, 1]) for (const x of [2.3, 3.65]) {          // ön cephe: iki sıra, her yanda iki pencere
    pencere(s * x, 1.4, zf, 0, 0.85, 0.9, true);
    pencere(s * x, 2.85, zf, 0, 0.85, 0.9, true);
  }
  for (const s of [-1, 1]) for (const z of [-1.1, 1.1]) {          // yan cepheler
    pencere(s * 4.53, 1.4, z, s * PI / 2, 0.8, 0.9, false);
    pencere(s * 4.53, 2.85, z, s * PI / 2, 0.8, 0.9, false);
  }

  // Çift kanatlı mavi kapı, yuvarlak pencereler, kollar
  mesh(new THREE.BoxGeometry(2.1, 2.34, 0.07), B, 0, 1.41, zf, g);
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.9, 2.2, 0.1), M, s * 0.46, 1.34, zf + 0.03, g);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), C, s * 0.46, 1.85, zf + 0.09, g).rotation.x = PI / 2;
    mesh(new THREE.TorusGeometry(0.21, 0.03, 4, 12), B, s * 0.46, 1.85, zf + 0.095, g);
    mesh(new THREE.SphereGeometry(0.06, 6, 4), PAL.altin, s * 0.13, 1.1, zf + 0.12, g);
  }
  mesh(new THREE.BoxGeometry(0.05, 2.2, 0.11), D, 0, 1.34, zf + 0.035, g);       // kanat ayrımı

  // Kapı üstü kırmızı saçak + payandalar, 2 basamak, iki yuvarlak çalı
  mesh(new THREE.BoxGeometry(2.9, 0.12, 0.5), R, 0, 2.78, 2.75, g).rotation.x = 0.28;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), B, s * 1.2, 2.5, 2.65, g).rotation.x = 0.7;
  const st1 = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14, 1, false, -PI / 2, PI), B, 0, 0.06, 2.5, g);
  st1.scale.x = 3.2;
  const st2 = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14, 1, false, -PI / 2, PI), B, 0, 0.18, 2.5, g);
  st2.scale.x = 4.6;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.3, 8, 6), PAL.yaprak, s * 2.0, 0.26, 2.7, g).scale.set(1, 0.85, 0.85);

  // Ön cephe: renkli dört kare pano (beyaz çerçeveli, üstünde basit şekiller)
  const cols = [R, PAL.yaprak, M, PAL.altin];
  cols.forEach((c, i) => {
    const x = (i - 1.5) * 0.72;
    mesh(new THREE.BoxGeometry(0.66, 0.66, 0.06), B, x, 3.35, zf, g);
    mesh(new THREE.BoxGeometry(0.56, 0.56, 0.08), c, x, 3.35, zf + 0.015, g);
  });
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), B, -1.08, 3.35, zf + 0.07, g).rotation.x = PI / 2;      // daire
  mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 3), B, -0.36, 3.35, zf + 0.07, g).rotation.set(PI / 2, PI, 0); // üçgen
  mesh(new THREE.BoxGeometry(0.26, 0.26, 0.03), B, 0.36, 3.35, zf + 0.07, g);                                   // kare
  mesh(new THREE.BoxGeometry(0.34, 0.1, 0.03), B, 1.08, 3.35, zf + 0.07, g);                                    // artı
  mesh(new THREE.BoxGeometry(0.1, 0.34, 0.03), B, 1.08, 3.35, zf + 0.07, g);

  // Bayrak direği (5.5, 0, 2.5) ve dalgalanan bayrak
  mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.2, 10), D, 5.5, 0.1, 2.5, g);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 8), B, 5.5, 3, 2.5, g);
  mesh(new THREE.SphereGeometry(0.12, 8, 6), PAL.altin, 5.5, 6.08, 2.5, g);
  const flag = mesh(new THREE.PlaneGeometry(1.6, 1.07, 8, 1), new THREE.MeshBasicMaterial({ map: turkFlag(), side: THREE.DoubleSide }), 6.33, 5.4, 2.5, g);
  g.userData.flag = flag;
  return g;
}

// Türk bayrağı (oranlar yaklaşık)
function turkFlag() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#e30a17'; x.fillRect(0, 0, 300, 200);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(100, 100, 50, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e30a17'; x.beginPath(); x.arc(112.5, 100, 40, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 10 : 25, a = Math.PI + i * Math.PI / 5;   // bir ucu hilale bakar
    const px = 162 + Math.cos(a) * r, py = 100 + Math.sin(a) * r;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function boat(color = '#fafafa') {
  // İstanbul Şehir Hatları vapuru. x -3..3, z -1.3..1.3, güverte y 0.5, gövde alt y -0.6. Üçgen ~1050 (dış hat dahil)
  const g = new THREE.Group();
  const PI = Math.PI, SIYAH = '#263238';
  // Pruvası sivri, kıçı düz bir kesit (x: -L..L, z: -W..W)
  const kesit = (L, W) => {
    const s = new THREE.Shape();
    s.moveTo(-L, -W); s.lineTo(L - 0.6, -W);
    s.quadraticCurveTo(L - 0.1, -W * 0.8, L, 0);
    s.quadraticCurveTo(L - 0.1, W * 0.8, L - 0.6, W);
    s.lineTo(-L, W); s.closePath();
    return s;
  };
  // Kesiti yükseklik boyunca ekstrüde eder (y0..y0+derinlik)
  const katman = (L, W, y0, derinlik, renk) => {
    const geo = new THREE.ExtrudeGeometry(kesit(L, W), { depth: derinlik, bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-PI / 2); geo.translate(0, y0, 0);
    return mesh(geo, renk, 0, 0, 0, g);
  };
  // Siyah gövde ve beyaz güverte (üst y 0.5, düz)
  edge(katman(2.95, 1.25, -0.6, 0.9, SIYAH));
  katman(3.0, 1.3, 0.3, 0.2, PAL.beyaz);

  // Kamara: x -2.4..0.8, z ±1.1, y 0.5..1.8, üstü düz
  edge(mesh(new THREE.BoxGeometry(3.2, 1.3, 2.2), color, -0.8, 1.15, 0, g));
  // Üst kenarda beyaz saçak (yürünen üst yüzey 1.8 olarak kalır)
  mesh(new THREE.BoxGeometry(3.36, 0.1, 2.36), color, -0.8, 1.74, 0, g);
  // Yuvarlak cam pencereler (iki yan)
  const pencere = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8);
  pencere.rotateX(PI / 2);                       // ekseni z yönüne çevir
  for (const s of [-1, 1]) for (const px of [-2.0, -1.2, -0.4, 0.4]) mesh(pencere, PAL.cam, px, 1.2, s * 1.115, g);

  // Baca: x 0.2, y 1.8..3.1, sarı, üstünde siyah bant
  mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.3, 10), PAL.sari, 0.2, 2.45, 0, g);
  mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.26, 10), SIYAH, 0.2, 2.99, 0, g);

  // Güverte kenarında alçak korkuluk (güverteden 0.32 yükseklik)
  const direk = new THREE.BoxGeometry(0.04, 0.3, 0.04);
  for (const s of [-1, 1]) {
    const z = s * 1.22;
    for (let i = 0; i < 7; i++) mesh(direk, PAL.koyuGri, -2.8 + i * 0.8, 0.65, z, g);
    mesh(new THREE.BoxGeometry(4.84, 0.04, 0.04), PAL.koyuGri, -0.4, 0.8, z, g);
  }
  // İki yanda kırmızı-beyaz can simidi (iki yarım halka)
  const simit = new THREE.TorusGeometry(0.2, 0.06, 5, 8, PI);
  for (const s of [-1, 1]) {
    mesh(simit, PAL.kirmizi, -2.7, 1.0, s * 1.22, g);
    mesh(simit, PAL.beyaz, -2.7, 1.0, s * 1.22, g).rotation.z = PI;
  }
  return g;
}

export function crate(s = 1.2, color = '#c8894b') {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(s, s, s), color, 0, s / 2, 0, g);
  const e = toon('#8d5a2b');
  for (const y of [0.06, s - 0.06]) for (const z of [-1, 1]) mesh(new THREE.BoxGeometry(s + 0.02, 0.12, 0.12), e, 0, y, z * s / 2, g);
  return g;
}

export function cloud() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m);
    s.position.set((i - 2) * 1.4, Math.sin(i) * 0.4, Math.cos(i * 2) * 0.6);
    s.scale.setScalar(1.2 + Math.sin(i * 3) * 0.5);
    g.add(s);
  }
  return g;
}

// NPC görünümü: ada ve role göre hayvan seç
export function npcModel(npc) {
  const m = npcModelRaw(npc);
  // Kafa ayrı kalır (konuşurken sallanır); gövde ve kafa kendi içinde birleştirilir.
  collapse(m.head);
  collapse(m.body, new Set([m.head]));
  return m;
}
function npcModelRaw(npc) {
  const ad = (npc.ad || '') + ' ' + (npc.rol || '');
  const low = ad.toLocaleLowerCase('tr');
  if (/kedi|pisi/.test(low)) return cat();
  if (/baykuş|öğretmen/.test(low)) return owl();
  if (/martı|güvercin|kuş/.test(low)) return bird();
  // Aile ve diğerleri: farklı kürk tonlarında ayılar
  let kurk = '#b07a4a';
  if (/dede|nine|büyük/.test(low)) kurk = '#9e9e9e';
  else if (/anne/.test(low)) kurk = '#c98a5a';
  else if (/baba/.test(low)) kurk = '#7a4a26';
  else if (/kuzen|kardeş|abla|abi/.test(low)) kurk = '#d9a066';
  else if (/simit|çaycı|satıcı|balıkçı/.test(low)) kurk = '#8d6e63';
  else if (/panda/.test(low)) kurk = '#f5f5f5';
  const b = createBear({ kurk, npc: true, olcek: /dede|nine|baba|anne/.test(low) ? 1.15 : 1 });
  if (/dede/.test(low)) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#fafafa'));
    cap.position.set(0, 0.12, 0); b.head.add(cap);
  }
  if (/nine|anne/.test(low)) {
    const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(/nine/.test(low) ? '#7e57c2' : '#ec407a'));
    scarf.position.set(0, 0.0, -0.03); b.head.add(scarf);
  }
  if (/simit/.test(low)) {
    const tray = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12), toon('#d4913d'));
    tray.position.set(0, 0.42, 0); tray.rotation.x = Math.PI / 2; b.head.add(tray);
  }
  return b;
}

function simpleAnimal(build) {
  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);
  const head = new THREE.Group(); body.add(head);
  build(body, head);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  let t = 0;
  return {
    group, body, head, shadow, setCostume() {}, setScarf() {},
    animate(s, dt) { t += dt; body.position.y = Math.abs(Math.sin(t * 2)) * 0.04; head.rotation.z = s.talking ? Math.sin(t * 12) * 0.12 : Math.sin(t) * 0.05; },
  };
}
export function cat() {
  return simpleAnimal((body, head) => {
    const PI = Math.PI;
    const F = '#f0a050', S = '#d9772b', W = PAL.beyaz, P = '#ff8fa3', K = '#1d120c';
    const gl = toon('#ffffff', { emissive: '#ffffff' });                       // parlayan beyaz nokta
    const rx = 0.26, ry = 0.19, rz = 0.2;                                      // kafa elipsoidi
    const nok = (az, el, k = 1) => [Math.sin(az) * Math.cos(el) * rx * k, Math.sin(el) * ry * k, Math.cos(az) * Math.cos(el) * rz * k];
    const dis = (m, az, el) => { m.rotation.set(-el, az, 0, 'YXZ'); return m; };   // +z yüzeyden dışarı baksın
    const cubuk = (a, b, r, col, par) => {                                     // iki nokta arası ince çubuk
      const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = v.length();
      const m = mesh(new THREE.CylinderGeometry(r, r, l, 4, 1, true), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, par);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
      return m;
    };

    // Gövde (turuncu tekir), beyaz göğüs, sırt çizgileri
    const bm = mesh(new THREE.SphereGeometry(1, 9, 7), F, 0, 0.3, 0, body);
    bm.scale.set(0.24, 0.21, 0.27); edge(bm, 0.025);
    mesh(new THREE.SphereGeometry(1, 7, 5), W, 0, 0.27, 0.19, body).scale.set(0.12, 0.15, 0.09);
    for (const dz of [-0.1, 0.02, 0.13]) {
      const el = Math.acos(dz / 0.27);
      const st = mesh(new THREE.SphereGeometry(1, 5, 3), S, 0, 0.3 + Math.sin(el) * 0.2, Math.cos(el) * 0.262, body);
      st.scale.set(0.14, 0.016, 0.03); st.rotation.x = PI / 2 - el;
    }
    // 4 bacak + beyaz patiler
    for (const [x, z] of [[-0.11, 0.14], [0.11, 0.14], [-0.13, -0.15], [0.13, -0.15]]) {
      mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.2, 7, 1, true), F, x, 0.12, z, body);
      mesh(new THREE.SphereGeometry(1, 5, 3), W, x, 0.045, z + 0.025, body).scale.set(0.072, 0.045, 0.092);
    }
    // Kıvrık kuyruk
    const yol = new THREE.CatmullRomCurve3([[0, 0.27, -0.24], [0, 0.3, -0.3], [0, 0.42, -0.32], [0, 0.57, -0.29], [0, 0.67, -0.21], [0, 0.69, -0.13]].map(p => new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(yol, 8, 0.04, 5), F, 0, 0, 0, body);
    mesh(new THREE.SphereGeometry(0.048, 6, 4), S, 0, 0.69, -0.13, body);

    // Kafa
    head.position.set(0, 0.65, 0.3);
    const hm = mesh(new THREE.SphereGeometry(1, 12, 8), F, 0, 0, 0, head);
    hm.scale.set(rx, ry, rz); edge(hm, 0.025);
    // Sivri kulaklar (içi pembe)
    for (const s of [-1, 1]) {
      const k = new THREE.Group(); k.position.set(s * 0.155, 0.13, -0.01); k.rotation.z = -s * 0.3; head.add(k);
      mesh(new THREE.ConeGeometry(0.105, 0.19, 5), F, 0, 0.02, 0, k);
      mesh(new THREE.ConeGeometry(0.055, 0.13, 5), P, 0, 0.0, 0.04, k);
    }
    // Alın çizgileri
    for (const [az, el] of [[-0.2, 1.0], [0, 1.05], [0.2, 1.0]]) {
      dis(mesh(new THREE.SphereGeometry(1, 5, 3), S, ...nok(az, el, 0.99), head), az, el).scale.set(0.014, 0.045, 0.02);
    }
    // İri parlak gözler + pembe yanaklar
    for (const s of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(...nok(s * 0.52, 0.12, 0.985)); dis(e, s * 0.52, 0.12); head.add(e);
      const r = 0.062;
      mesh(new THREE.SphereGeometry(r, 7, 5), K, 0, 0, 0, e).scale.set(1, 1.15, 0.62);
      mesh(new THREE.SphereGeometry(r * 0.3, 5, 4), gl, r * 0.3, r * 0.4, r * 0.5, e);
      mesh(new THREE.SphereGeometry(r * 0.15, 4, 3), gl, -r * 0.3, -r * 0.3, r * 0.5, e);
      dis(mesh(new THREE.SphereGeometry(0.055, 5, 3), P, ...nok(s * 0.98, -0.2, 0.97), head), s * 0.98, -0.2).scale.set(1, 0.7, 0.3);
    }
    // Beyaz ağız çevresi, pembe burun, küçük gülümseme, bıyıklar
    mesh(new THREE.SphereGeometry(1, 7, 4), W, 0, -0.07, 0.13, head).scale.set(0.115, 0.085, 0.08);
    mesh(new THREE.SphereGeometry(0.03, 5, 3), P, 0, -0.03, 0.2, head).scale.set(1, 0.7, 0.7);
    for (const s of [-1, 1]) {
      mesh(new THREE.TorusGeometry(0.032, 0.008, 3, 6, PI), K, s * 0.035, -0.1, 0.207, head).rotation.set(0.25, 0, PI, 'YXZ');
      for (const j of [-1, 1]) cubuk([s * 0.08, -0.055 + j * 0.01, 0.175], [s * 0.21, -0.055 + j * 0.05, 0.2], 0.005, W, head);
    }
  });
}
export function owl() {
  return simpleAnimal((body, head) => {
    const PI = Math.PI;
    const F = '#8d5e3c', D = '#6b4429', C = '#f1e2c0', O = '#ffb300', P = '#ff8fa3', K = '#1d120c', G = PAL.koyuGri;
    const gl = toon('#ffffff', { emissive: '#ffffff' });
    const rx = 0.42, ry = 0.37, rz = 0.37;                                     // kafa elipsoidi
    const nok = (az, el, k = 1) => [Math.sin(az) * Math.cos(el) * rx * k, Math.sin(el) * ry * k, Math.cos(az) * Math.cos(el) * rz * k];
    const dis = (m, az, el) => { m.rotation.set(-el, az, 0, 'YXZ'); return m; };
    const cubuk = (a, b, r, col, par) => {
      const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = v.length();
      const m = mesh(new THREE.CylinderGeometry(r, r, l, 4, 1, true), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, par);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
      return m;
    };

    // Gövde, açık göğüs ve tüy işaretleri, kanat çıkıntıları, kuyruk, küçük ayaklar
    const bm = mesh(new THREE.SphereGeometry(1, 9, 7), F, 0, 0.62, 0, body);
    bm.scale.set(0.45, 0.6, 0.42); edge(bm, 0.025);
    mesh(new THREE.SphereGeometry(1, 7, 5), C, 0, 0.55, 0.3, body).scale.set(0.3, 0.4, 0.16);
    for (const [x, y] of [[-0.09, 0.7], [0.09, 0.7], [-0.17, 0.55], [0.17, 0.55], [0, 0.55], [-0.09, 0.4], [0.09, 0.4]]) {
      const z = 0.3 + 0.16 * Math.sqrt(Math.max(0.05, 1 - (x / 0.3) ** 2 - ((y - 0.55) / 0.4) ** 2));
      mesh(new THREE.SphereGeometry(1, 4, 3), D, x, y, z, body).scale.set(0.055, 0.03, 0.02);
    }
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.SphereGeometry(1, 6, 4), D, s * 0.46, 0.6, -0.02, body);
      w.scale.set(0.1, 0.38, 0.2); w.rotation.z = -s * 0.1;
      for (const j of [-1, 0, 1]) {                                            // ayak parmakları
        const t = mesh(new THREE.SphereGeometry(1, 4, 3), O, s * 0.16 + j * 0.055, 0.03, 0.28 + (j ? 0 : 0.02), body);
        t.scale.set(0.034, 0.028, 0.085); t.rotation.y = j * 0.35;
      }
    }
    mesh(new THREE.SphereGeometry(1, 6, 4), D, 0, 0.14, -0.38, body).scale.set(0.2, 0.08, 0.26);

    // Kafa
    head.position.set(0, 1.2, 0);
    const hm = mesh(new THREE.SphereGeometry(1, 11, 8), F, 0, 0, 0, head);
    hm.scale.set(rx, ry, rz); edge(hm, 0.025);
    for (const s of [-1, 1]) {
      // Kulak tüyleri
      const k = new THREE.Group(); k.position.set(s * 0.23, 0.31, -0.02); k.rotation.z = -s * 0.35; head.add(k);
      mesh(new THREE.ConeGeometry(0.085, 0.27, 5), D, 0, 0.02, 0, k);
      // Yüz diski, iri parlak göz, gözlük çerçevesi, yanak
      const e = new THREE.Group(); e.position.set(...nok(s * 0.5, 0.05, 0.97)); dis(e, s * 0.5, 0.05); head.add(e);
      mesh(new THREE.SphereGeometry(1, 6, 4), C, 0, 0, 0, e).scale.set(0.165, 0.165, 0.07);
      const r = 0.085;
      mesh(new THREE.SphereGeometry(r, 7, 5), K, 0, 0, 0.045, e).scale.set(1, 1.1, 0.6);
      mesh(new THREE.SphereGeometry(r * 0.3, 5, 4), gl, r * 0.3, r * 0.4, 0.085, e);
      mesh(new THREE.SphereGeometry(r * 0.15, 4, 3), gl, -r * 0.3, -r * 0.3, 0.085, e);
      mesh(new THREE.TorusGeometry(0.15, 0.02, 3, 12), G, 0, 0, 0.075, e);
      dis(mesh(new THREE.SphereGeometry(0.06, 5, 3), P, ...nok(s * 0.95, -0.3, 0.97), head), s * 0.95, -0.3).scale.set(1, 0.7, 0.3);
    }
    cubuk([-0.1, 0.03, 0.43], [0.1, 0.03, 0.43], 0.014, G, head);               // gözlük köprüsü
    // Turuncu gaga ve küçük gülümseme
    mesh(new THREE.ConeGeometry(0.065, 0.15, 5), O, 0, -0.07, 0.41, head).rotation.x = PI / 2 + 0.25;
    mesh(new THREE.TorusGeometry(0.06, 0.01, 3, 8, PI), K, 0, -0.2, 0.33, head).rotation.set(0.3, 0, PI, 'YXZ');
  });
}
export function bird() {
  return simpleAnimal((body, head) => {
    const PI = Math.PI;
    const W = '#eceff1', G = PAL.gri, Dk = PAL.koyuGri, O = '#ffb300', P = '#ff8fa3', K = '#1d120c';
    const gl = toon('#ffffff', { emissive: '#ffffff' });
    const rx = 0.125, ry = 0.12, rz = 0.12;                                    // kafa elipsoidi
    const nok = (az, el, k = 1) => [Math.sin(az) * Math.cos(el) * rx * k, Math.sin(el) * ry * k, Math.cos(az) * Math.cos(el) * rz * k];
    const dis = (m, az, el) => { m.rotation.set(-el, az, 0, 'YXZ'); return m; };

    // Gövde: yuvarlak beyaz-gri, dolgun göğüs, gri kanatlar, koyu kanat uçları, kuyruk
    const bm = mesh(new THREE.SphereGeometry(1, 10, 8), W, 0, 0.29, 0, body);
    bm.scale.set(0.19, 0.17, 0.27); edge(bm, 0.025);
    mesh(new THREE.SphereGeometry(1, 7, 5), W, 0, 0.3, 0.15, body).scale.set(0.15, 0.14, 0.13);
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.SphereGeometry(1, 7, 5), G, s * 0.16, 0.31, -0.04, body);
      w.scale.set(0.04, 0.12, 0.22); w.rotation.z = -s * 0.1;
      mesh(new THREE.SphereGeometry(1, 5, 4), Dk, s * 0.165, 0.3, -0.24, body).scale.set(0.036, 0.075, 0.075);
      // Turuncu bacak ve ayak
      const b = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.15, 4, 1, true), O, s * 0.07, 0.085, 0.02, body);
      b.rotation.x = 0.1;
      mesh(new THREE.SphereGeometry(1, 5, 3), O, s * 0.07, 0.012, 0.06, body).scale.set(0.04, 0.012, 0.065);
    }
    const kt = mesh(new THREE.SphereGeometry(1, 6, 4), G, 0, 0.29, -0.3, body);
    kt.scale.set(0.1, 0.03, 0.14); kt.rotation.x = 0.3;

    // Kafa
    head.position.set(0, 0.45, 0.2);
    const hm = mesh(new THREE.SphereGeometry(1, 11, 8), W, 0, 0, 0, head);
    hm.scale.set(rx, ry, rz); edge(hm, 0.025);
    for (const s of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(...nok(s * 0.75, 0.1, 0.985)); dis(e, s * 0.75, 0.1); head.add(e);
      const r = 0.037;
      mesh(new THREE.SphereGeometry(r, 7, 5), K, 0, 0, 0, e).scale.set(1, 1.15, 0.62);
      mesh(new THREE.SphereGeometry(r * 0.3, 5, 4), gl, r * 0.3, r * 0.4, r * 0.5, e);
      mesh(new THREE.SphereGeometry(r * 0.15, 4, 3), gl, -r * 0.3, -r * 0.3, r * 0.5, e);
      dis(mesh(new THREE.SphereGeometry(0.032, 5, 3), P, ...nok(s * 1.05, -0.25, 0.97), head), s * 1.05, -0.25).scale.set(1, 0.7, 0.3);
    }
    mesh(new THREE.ConeGeometry(0.036, 0.1, 5), O, 0, -0.01, 0.14, head).rotation.x = PI / 2;      // turuncu gaga
    mesh(new THREE.TorusGeometry(0.035, 0.006, 3, 8, PI), K, 0, -0.075, 0.095, head).rotation.set(0.35, 0, PI, 'YXZ');   // gülümseme
  });
}
