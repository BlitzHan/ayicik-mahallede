// Dünya: 4 ada (Mahalle, Okul, Cami bahçesi, Sahil), köprüler, kapılar, altınlar, yıldızlar,
// anahtar-sandık, bulmaca taşları, NPC yuvaları, numaralı taşlar, vapur ve Kız Kulesi.
import * as THREE from 'three';
import { toon, collapse } from './bear.js';
import * as P from './props.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { decorateIsland } from './decor.js';

export const REGIONS = [
  { id: 'mahalle', ad: 'Mahalle', emoji: '🏡', alan: 'aile', x: 0, z: 0, r: 16, music: 'mahalle', renk: '#e53935', anahtarAd: 'kırmızı' },
  { id: 'okul', ad: 'Okul bahçesi', emoji: '🏫', alan: 'okul', x: 0, z: -42, r: 15, music: 'okul', renk: '#fdd835', anahtarAd: 'sarı' },
  { id: 'cami', ad: 'Cami bahçesi', emoji: '🕌', alan: 'din', x: 42, z: -42, r: 15, music: 'cami', renk: '#43a047', anahtarAd: 'yeşil' },
  { id: 'sahil', ad: 'Sahil', emoji: '⛴️', alan: 'kultur', x: 42, z: 0, r: 15, music: 'sahil', renk: '#1e88e5', anahtarAd: 'mavi' },
];
export const GROUND = 1;

export function buildWorld(scene) {
  const colliders = [];
  const W = {
    colliders, coins: [], stars: [], keys: [], chests: [], stones: [], npcSlots: {}, gates: [],
    pads: [], islands: [], movers: [], spinners: [], birds: [], flags: [], photoFrames: [], wardrobe: null,
    camOnly: [],                    // yalnız kamera ışını için engeller (ağaç yaprakları)
    regions: REGIONS, spawn: { x: 0, y: GROUND, z: 7 },
  };

  // --- Gökyüzü, ışık, su ---
  scene.fog = new THREE.Fog('#bfe6fb', 55, 150);
  W.sky = createSky(scene, { top: '#3d9be9', horizon: '#bfe6fb' });
  scene.add(new THREE.HemisphereLight('#ffffff', '#7fb069', 1.6));
  // Güneş: ayıyı takip eden gölge haritası (yalnız çevredeki ~25 m gölge çizilir)
  const sun = new THREE.DirectionalLight('#fff4e0', 1.9);
  const strong = (navigator.hardwareConcurrency || 4) > 4 && (navigator.deviceMemory || 4) > 3;
  sun.castShadow = true;
  sun.shadow.mapSize.set(strong ? 2048 : 1024, strong ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const SUN_OFS = new THREE.Vector3(18, 40, 14);
  W.updateSun = (x, y, z) => { sun.position.set(x + SUN_OFS.x, y + SUN_OFS.y, z + SUN_OFS.z); sun.target.position.set(x, y, z); };
  W.updateSun(0, 0, 0);


  // --- Yardımcılar ---
  const addBox = (x0, y0, z0, x1, y1, z1, opts = {}) => { const c = { type: 'box', min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, ...opts }; colliders.push(c); return c; };
  const addCyl = (x, z, r, y0, y1, opts = {}) => { const c = { type: 'cyl', x, z, r, y0, y1, ...opts }; colliders.push(c); return c; };
  const foliage = (x, z, s) => W.camOnly.push({ type: 'cyl', x, z, r: 1.4 * s, y0: GROUND + 1.7 * s, y1: GROUND + 3.8 * s });
  const place = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; scene.add(obj); return obj; };

  function island(x, z, r, grass = '#7ccf5f', region = null) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    P.mesh(new THREE.CylinderGeometry(r, r * 0.9, 4, 40), grass, 0, GROUND - 2, 0, g);
    P.mesh(new THREE.CylinderGeometry(r + 1.6, r + 1.8, 3.6, 40), '#f3dca0', 0, 0.6 - 1.8, 0, g);
    scene.add(g);
    addCyl(x, z, r, -3, GROUND, { island: true });
    addCyl(x, z, r + 1.6, -3, 0.6, { island: true, beach: true });
    W.islands.push({ x, z, r, region });
  }

  function bridge(x0, z0, x1, z1, need, label) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const hw = 1.7;
    const g = new THREE.Group();
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < len / 0.6; i++) {
      const t = -len / 2 + i * 0.6 + 0.3;
      const plank = P.mesh(new THREE.BoxGeometry(alongX ? 0.55 : hw * 2, 0.25, alongX ? hw * 2 : 0.55), i % 2 ? '#b07a45' : '#c48a52', alongX ? t : 0, GROUND - 0.12, alongX ? 0 : t, g);
    }
    for (const s of [-1, 1]) {
      P.mesh(new THREE.BoxGeometry(alongX ? len : 0.15, 0.15, alongX ? 0.15 : len), '#8d5a2b', alongX ? 0 : s * hw, GROUND + 0.8, alongX ? s * hw : 0, g);
      for (let i = 0; i <= len / 2; i++) {
        const t = -len / 2 + i * 2;
        P.mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), '#8d5a2b', alongX ? t : s * hw, GROUND + 0.4, alongX ? s * hw : t, g);
      }
    }
    place(g, cx, 0, cz);
    if (alongX) {
      addBox(Math.min(x0, x1), GROUND - 0.4, cz - hw, Math.max(x0, x1), GROUND, cz + hw);
      addBox(Math.min(x0, x1), GROUND, cz - hw - 0.2, Math.max(x0, x1), GROUND + 0.9, cz - hw, { camera: false });
      addBox(Math.min(x0, x1), GROUND, cz + hw, Math.max(x0, x1), GROUND + 0.9, cz + hw + 0.2, { camera: false });
    } else {
      addBox(cx - hw, GROUND - 0.4, Math.min(z0, z1), cx + hw, GROUND, Math.max(z0, z1));
      addBox(cx - hw - 0.2, GROUND, Math.min(z0, z1), cx - hw, GROUND + 0.9, Math.max(z0, z1), { camera: false });
      addBox(cx + hw, GROUND, Math.min(z0, z1), cx + hw + 0.2, GROUND + 0.9, Math.max(z0, z1), { camera: false });
    }
    // Kapı
    if (need) {
      const gx = label.x, gz = label.z;
      const gate = new THREE.Group();
      for (const s of [-1, 1]) P.mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), '#6d4c41', alongX ? 0 : s * (hw + 0.2), GROUND + 1.6, alongX ? s * (hw + 0.2) : 0, gate);
      const door = new THREE.Group(); gate.add(door);
      for (let i = 0; i < 5; i++) {
        const t = -hw + 0.35 + i * (hw * 2 - 0.7) / 4;
        P.mesh(new THREE.BoxGeometry(alongX ? 0.2 : 0.3, 2.2, alongX ? 0.3 : 0.2), '#a1887f', alongX ? 0 : t, GROUND + 1.1, alongX ? t : 0, door);
      }
      P.mesh(new THREE.BoxGeometry(alongX ? 0.25 : hw * 2, 0.3, alongX ? hw * 2 : 0.25), '#8d6e63', 0, GROUND + 1.8, 0, door);
      P.mesh(new THREE.BoxGeometry(alongX ? 0.25 : hw * 2, 0.3, alongX ? hw * 2 : 0.25), '#8d6e63', 0, GROUND + 0.5, 0, door);
      collapse(door);
      const lock = P.emojiSprite('🔒', 0.9); lock.position.set(0, GROUND + 1.2, 0); door.add(lock);
      place(gate, gx, 0, gz);
      // Görünmez duvar: köprüden çok daha geniş ve çift zıplamadan yüksek; yandan ya da üstten geçilmez
      const WW = hw + 7, WH = 14;
      const col = addBox(alongX ? gx - 0.3 : gx - WW, GROUND - 4, alongX ? gz - WW : gz - 0.3, alongX ? gx + 0.3 : gx + WW, GROUND + WH, alongX ? gz + WW : gz + 0.3, { camera: false });
      // Kapalıyken parlayan sihirli perde (kapı açılınca kapıyla birlikte iner)
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 0.6, 3.4), new THREE.MeshBasicMaterial({ color: '#9be7ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      curtain.position.set(0, GROUND + 1.6, 0); if (alongX) curtain.rotation.y = Math.PI / 2;
      door.add(curtain); door.userData.curtain = curtain;
      const sign = P.textSprite(`⭐ 0/${need}`); sign.position.set(gx, GROUND + 3.8, gz); scene.add(sign);
      W.gates.push({ need, door, collider: col, sign, x: gx, z: gz, open: false, from: label.from, to: label.to });
    }
  }

  function coinsCircle(cx, cz, r, n, y = GROUND + 0.8, a0 = 0) {
    for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; addCoin(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); }
  }
  function coinsLine(x0, z0, x1, z1, n, y = GROUND + 0.8) {
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; addCoin(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t); }
  }
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18);
  const coinMat = toon('#ffc107', { emissive: '#5a3a00' });
  function addCoin(x, y, z) { W.coins.push({ x, y, z, taken: false, base: y }); }

  const starGeo = (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.28 : 0.62, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 }).center();
  })();
  const starMat = toon('#ffd600', { emissive: '#665000' });
  W.makeStar = () => new THREE.Mesh(starGeo, starMat);
  function addStar(id, region, x, y, z, parentMover = null) {
    const m = W.makeStar(); m.position.set(x, y, z);
    (parentMover?.mesh || scene).add(m);
    W.stars.push({ id, region, mesh: m, x, y, z, local: !!parentMover, mover: parentMover, taken: false });
  }

  function addKeyChest(region, color, kx, ky, kz, cx, cz, ry = 0) {
    const key = new THREE.Group();
    const km = toon(color, { emissive: new THREE.Color(color).multiplyScalar(0.25) });
    P.mesh(new THREE.TorusGeometry(0.25, 0.08, 8, 16), km, 0, 0.35, 0, key);
    P.mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), km, 0, -0.1, 0, key);
    P.mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), km, 0.12, -0.3, 0, key);
    P.mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), km, 0.1, -0.15, 0, key);
    collapse(key);
    key.position.set(kx, ky + 0.8, kz); scene.add(key);
    const chest = new THREE.Group();
    P.mesh(new THREE.BoxGeometry(1.3, 0.8, 0.9), color, 0, 0.4, 0, chest);
    const lid = new THREE.Group(); lid.position.set(0, 0.8, -0.45); chest.add(lid);
    P.mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 12, 1, false, 0, Math.PI), color, 0, 0, 0.45, lid).rotation.set(0, 0, Math.PI / 2);
    P.mesh(new THREE.BoxGeometry(0.25, 0.3, 0.05), '#ffd54f', 0, 0.55, 0.47, chest);
    // Açık ağız (kapak kapalıyken görünmez) ve açılınca görünen hazine
    P.mesh(new THREE.PlaneGeometry(1.12, 0.72), '#3e2723', 0, 0.805, 0, chest).rotation.x = -Math.PI / 2;
    const hazine = new THREE.Group(); hazine.position.y = 0.8; hazine.visible = false; chest.add(hazine);
    const altin = toon('#ffc107', { emissive: '#5a3a00' });
    P.mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), altin, 0, 0, 0, hazine).scale.set(1.08, 0.55, 0.68);
    for (const [gx, gz, gc] of [[-0.3, 0.1, '#e53935'], [0.05, -0.12, '#1e88e5'], [0.32, 0.08, '#43a047']]) {
      const gem = P.mesh(new THREE.OctahedronGeometry(0.11), toon(gc, { emissive: new THREE.Color(gc).multiplyScalar(0.3) }), gx, 0.26, gz, hazine);
      gem.rotation.y = gx * 3;
    }
    for (const s of [-1, 1]) P.mesh(new THREE.BoxGeometry(0.08, 0.82, 0.92), '#5d4037', s * 0.5, 0.41, 0, chest);
    collapse(lid); collapse(hazine); collapse(chest, new Set([lid, hazine]));
    place(chest, cx, GROUND, cz, ry);
    addBox(cx - 0.7, GROUND, cz - 0.5, cx + 0.7, GROUND + 0.8, cz + 0.5);
    W.keys.push({ region, color, mesh: key, x: kx, y: ky, z: kz, taken: false });
    W.chests.push({ region, color, mesh: chest, lid, hazine, x: cx, z: cz, open: false });
  }

  const stoneGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.6, 8);
  function addStone(region, i, x, z) {
    const g = new THREE.Group();
    P.mesh(stoneGeo, '#b0bec5', 0, 0.3, 0, g);
    const cube = new THREE.Group(); cube.position.y = 1.4; g.add(cube);
    const colors = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#ff7043'];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), colors.map(c => toon(c)));
    cube.add(box);
    const q = P.emojiSprite('🧩', 0.9); q.position.y = 0.95; cube.add(q);
    place(g, x, GROUND, z);
    addCyl(x, z, 0.85, GROUND, GROUND + 0.6);
    W.stones.push({ id: `${region}-bulmaca-${i}`, region, group: g, cube, icon: q, x, z });
    W.spinners.push({ obj: cube, speed: 1.2, bob: true, base: 1.4 });
  }

  // =============== MAHALLE (0,0) ===============
  island(0, 0, 16, '#7ccf5f', 'mahalle');
  const h = place(P.house(6, 3.5, 5), -7, GROUND, -5); addBox(-10, GROUND, -7.5, -4, GROUND + 4.5, -2.5);
  const h2 = place(P.house(4.5, 3, 4, '#e3f2fd', '#1e88e5'), 7, GROUND, -9, -0.4); addBox(4.7, GROUND, -11, 9.3, GROUND + 4, -7);
  for (const [x, z, s] of [[11, -1, 1], [-12, 5, 1.1], [-13, -5, 0.9], [13, 9, 0.8]]) { place(P.tree(0, 0, 0, s), x, GROUND, z); addCyl(x, z, 0.4 * s, GROUND, GROUND + 2.2 * s); foliage(x, z, s); }
  // Aile panosu: 4 çerçeve
  const board = new THREE.Group();
  P.mesh(new THREE.BoxGeometry(5.2, 2.4, 0.2), '#8d5a2b', 0, 2.3, 0, board);
  for (const s of [-1, 1]) P.mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), '#6d4c41', s * 2.4, 0.6, 0, board);
  for (let i = 0; i < 4; i++) {
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map: P.emojiTexture(['❤️', '🏡', '🌷', '⭐'][i], 128, '#fff8e1') }));
    fr.position.set(-1.8 + i * 1.2, 2.3, 0.12); board.add(fr);
    P.mesh(new THREE.BoxGeometry(1.2, 1.2, 0.05), '#ffd54f', -1.8 + i * 1.2, 2.3, 0.08, board);
    W.photoFrames.push(fr);
  }
  const heart = P.emojiSprite('👨‍👩‍👧‍👦', 1.1); heart.position.set(0, 4, 0); board.add(heart);
  place(board, 0, GROUND, -8.6); addBox(-2.7, GROUND, -8.8, 2.7, GROUND + 3.5, -8.4);
  // Gardırop (kostümler)
  const ward = new THREE.Group();
  P.mesh(new THREE.BoxGeometry(1.4, 2.2, 0.8), '#a1887f', 0, 1.1, 0, ward);
  P.mesh(new THREE.BoxGeometry(0.05, 2, 0.05), '#5d4037', 0, 1.1, 0.41, ward);
  const shirt = P.emojiSprite('👕', 0.8); shirt.position.set(0, 2.7, 0); ward.add(shirt);
  place(ward, -3.2, GROUND, -1.4, 0.3); addBox(-3.9, GROUND, -1.8, -2.5, GROUND + 2.2, -1.0);
  W.wardrobe = { x: -3.2, z: -1.4 };
  // Gizli yıldız: sandık kuleleri
  for (const [x, z, n] of [[7, 5, 1], [8.8, 6.8, 2], [7, 8.6, 3]]) {
    for (let k = 0; k < n; k++) place(P.crate(1.2), x, GROUND + k * 1.2, z);
    addBox(x - 0.6, GROUND, z - 0.6, x + 0.6, GROUND + n * 1.2, z + 0.6);
  }
  addStar('mahalle-gizli', 'mahalle', 7, GROUND + 3.6 + 1, 8.6);
  addKeyChest('mahalle', '#e53935', -12.5, GROUND, 9, 4, -3.5);
  addStone('mahalle', 1, -6, 4);
  addStone('mahalle', 2, 12, -6);
  W.npcSlots.mahalle = [[-6.5, -1.2], [1.5, -5.5], [-12, 0.5], [12, 4]];
  coinsCircle(0, 1, 5, 10);
  coinsLine(-3, 9, -11, 9.5, 5);
  addCoin(7, GROUND + 1.2 + 0.8, 5); addCoin(8.8, GROUND + 2.4 + 0.8, 6.8);

  // Köprüler
  bridge(0, -15.5, 0, -27.5, 3, { x: 0, z: -18, from: 'mahalle', to: 'okul' });
  bridge(15.5, 0, 27.5, 0, 11, { x: 18.5, z: 0, from: 'mahalle', to: 'sahil' });
  bridge(14.5, -42, 27.5, -42, 7, { x: 18, z: -42, from: 'okul', to: 'cami' });
  bridge(42, -26.5, 42, -14.5, 11, { x: 42, z: -24, from: 'cami', to: 'sahil' });
  coinsLine(0, -20, 0, -26, 4); coinsLine(20, 0, 26, 0, 4); coinsLine(20, -42, 26, -42, 4); coinsLine(42, -22, 42, -16, 4);

  // =============== OKUL (0,-42) ===============
  island(0, -42, 15, '#8bd36a', 'okul');
  const sc = place(P.school(), 0, GROUND, -51.5); addBox(-4.5, GROUND, -54, 4.5, GROUND + 5, -49);
  W.flags.push(sc.userData.flag);
  // Renkli bloklar (üstüne çıkılabilir)
  const blocks = [['#ef5350', -9, -46, 1], ['#42a5f5', -10.5, -48, 2], ['#66bb6a', -8.5, -50, 3], ['#ffca28', 9, -46, 1], ['#ab47bc', 10.5, -48.5, 2]];
  for (const [c, x, z, n] of blocks) {
    P.mesh(new THREE.BoxGeometry(1.4, n * 1.1, 1.4), c, x, GROUND + n * 0.55, z, scene);
    addBox(x - 0.7, GROUND, z - 0.7, x + 0.7, GROUND + n * 1.1, z + 0.7);
  }
  addCoin(-8.5, GROUND + 3.3 + 0.8, -50);
  // Numaralı taşlar → küçük ada ve gizli yıldız
  const padX = [-17.5, -20, -22.5, -25, -27.5];
  padX.forEach((x, i) => {
    const z = -42 + (i % 2 ? 0.9 : -0.9);
    const pm = P.mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.2, 14), ['#ef5350', '#ffa726', '#ffee58', '#66bb6a', '#42a5f5'][i], x, 0.2, z, scene);
    const num = P.textSprite(String(i + 1), { size: 80 }); num.position.set(x, 1.6, z); num.scale.multiplyScalar(1.4); scene.add(num);
    const col = addCyl(x, z, 1.0, -2, 0.8, { pad: i + 1 });
    W.pads.push({ n: i + 1, collider: col, mesh: pm });
  });
  island(-32, -42, 3, '#9ccc65', 'okul');
  place(P.tree(0, 0, 0, 0.8, '#66bb6a'), -33.5, GROUND, -43.5); addCyl(-33.5, -43.5, 0.35, GROUND, GROUND + 2);
  addStar('okul-gizli', 'okul', -31.5, GROUND + 1.2, -41.5);
  addKeyChest('okul', '#fdd835', 10.5, GROUND + 2.2, -48.5, -6, -37);
  addStone('okul', 1, -6, -45);
  addStone('okul', 2, 7, -38);
  W.npcSlots.okul = [[-2.8, -47.2], [5, -44], [-10, -37], [10, -35]];
  coinsCircle(0, -40, 5, 10, GROUND + 0.8, 0.3);

  // =============== CAMİ BAHÇESİ (42,-42) ===============
  island(42, -42, 15, '#86cf6c', 'cami');
  place(P.mosque(), 42, GROUND, -49.5); addBox(38, GROUND, -53.5, 46, GROUND + 9, -45.5);
  addCyl(47.2, -52.5, 0.75, GROUND, GROUND + 18);
  place(P.fountain(), 42, GROUND, -38); addCyl(42, -38, 1.8, GROUND, GROUND + 2.8);
  for (const [x, z] of [[33, -40], [51, -47], [35, -50.5]]) { place(P.tree(0, 0, 0, 1.2, '#43a047'), x, GROUND, z); addCyl(x, z, 0.5, GROUND, GROUND + 2.6); foliage(x, z, 1.2); }
  // Çınar ağacı + dallar: gizli yıldız yuvada
  place(P.tree(0, 0, 0, 2.2, '#2e7d32'), 52, GROUND, -35); addCyl(52, -35, 0.8, GROUND, GROUND + 4.4);
  const branches = [[49.6, -35, 1.4], [51, -32.6, 2.6], [53.8, -33.2, 3.8], [54.2, -36.2, 5.0]];
  for (const [x, z, y] of branches) {
    P.mesh(new THREE.BoxGeometry(1.6, 0.35, 1.6), '#795548', x, GROUND + y - 0.17, z, scene);
    addBox(x - 0.8, GROUND + y - 0.35, z - 0.8, x + 0.8, GROUND + y, z + 0.8);
  }
  const nest = P.mesh(new THREE.TorusGeometry(0.7, 0.25, 6, 14), '#8d6e63', 52.2, GROUND + 6.1, -37.4, scene); nest.rotation.x = Math.PI / 2;
  addBox(51.3, GROUND + 5.6, -38.3, 53.1, GROUND + 6.1, -36.5);
  addStar('cami-gizli', 'cami', 52.2, GROUND + 7, -37.4);
  addKeyChest('cami', '#43a047', 34, GROUND, -53, 35.5, -37.5, 0.5);
  addStone('cami', 1, 35, -44.5);
  addStone('cami', 2, 48.5, -40.5);
  W.npcSlots.cami = [[44.5, -43.8], [38, -35], [47, -33], [39.5, -45]];
  coinsCircle(42, -38, 3.5, 8, GROUND + 2.3);
  coinsLine(36, -32, 48, -32, 5);
  // Güvercinler
  for (let i = 0; i < 6; i++) {
    const b = P.bird(); collapse(b.head); collapse(b.body, new Set([b.head])); place(b.group, 40 + Math.cos(i) * 3, GROUND, -33 + Math.sin(i * 2) * 1.5, i);
    b.group.scale.setScalar(0.8); W.birds.push({ ...b, ground: true, t: i });
  }

  // =============== SAHİL (42,0) ===============
  island(42, 0, 15, '#9bd770', 'sahil');
  place(P.tower(), 49, GROUND, 6); addCyl(49, 6, 1.95, GROUND, GROUND + 13);
  // Çay bahçesi
  for (const [x, z] of [[33, 6], [35.5, 9], [31.5, 9.5]]) {
    const tb = new THREE.Group();
    P.mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 14), '#fafafa', 0, 0.8, 0, tb);
    P.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), '#9e9e9e', 0, 0.4, 0, tb);
    for (let k = 0; k < 2; k++) {
      const gl = P.mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 8), toon('#b71c1c', { transparent: true, opacity: 0.85 }), -0.2 + k * 0.4, 0.94, 0, tb);
    }
    place(tb, x, GROUND, z); addCyl(x, z, 0.7, GROUND, GROUND + 0.85);
  }
  // Simit tezgahı
  const cart = new THREE.Group();
  P.mesh(new THREE.BoxGeometry(1.8, 1, 1), '#d32f2f', 0, 0.9, 0, cart);
  P.mesh(new THREE.BoxGeometry(1.9, 0.08, 1.1), '#fff', 0, 1.44, 0, cart);
  for (let k = 0; k < 4; k++) P.mesh(new THREE.TorusGeometry(0.17, 0.07, 6, 12), '#c58b3a', -0.6 + k * 0.4, 1.55, 0, cart).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) P.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), '#333', s * 0.7, 0.3, 0.55, cart).rotation.x = Math.PI / 2;
  place(cart, 37, GROUND, -6); addBox(36.1, GROUND, -6.5, 37.9, GROUND + 1.5, -5.5);
  // İskele
  P.mesh(new THREE.BoxGeometry(4.5, 0.3, 3), '#a1887f', 59.2, GROUND - 0.15, 0, scene);
  addBox(56.9, GROUND - 0.3, -1.5, 61.5, GROUND, 1.5);
  // Vapur: iskele ↔ Kız Kulesi
  const boat = P.boat(); collapse(boat); scene.add(boat);
  const path = t => {
    const T = 16, u = (t % T) / T;           // 3 sn bekle, 5 sn git, 3 sn bekle, 5 sn dön
    let k;
    if (u < 3 / 16) k = 0; else if (u < 8 / 16) k = ease((u - 3 / 16) / (5 / 16)); else if (u < 11 / 16) k = 1; else k = 1 - ease((u - 11 / 16) / (5 / 16));
    return { x: 64.5 + k * 15, y: 0.4, z: 0 };
  };
  const deck = { type: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, half: { x: 3, y: 0.5, z: 1.3 }, path, mesh: boat };
  const cabin = { type: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, half: { x: 1.6, y: 0.65, z: 1.1 }, path: t => { const p = path(t); return { x: p.x - 0.8, y: p.y + 1.15, z: p.z }; } };
  colliders.push(deck, cabin); W.movers.push(deck, cabin);
  addStar('sahil-gizli', 'sahil', -0.8, 2.6, 0, deck);
  // Kız Kulesi adacığı
  island(86, 0, 4, '#a5d6a7', 'sahil');
  const kk = new THREE.Group();
  P.mesh(new THREE.BoxGeometry(3, 2.2, 3), '#eceff1', 0, 1.1, 0, kk);
  P.mesh(new THREE.CylinderGeometry(0.7, 0.8, 3, 10), '#eceff1', 0.6, 3.2, 0.6, kk);
  P.mesh(new THREE.ConeGeometry(0.9, 1.4, 10), '#78909c', 0.6, 5.4, 0.6, kk);
  place(kk, 87.5, GROUND, -1.5); addBox(86, GROUND, -3, 89, GROUND + 2.2, 0); addCyl(88.1, -0.9, 0.85, GROUND, GROUND + 4.7);
  addKeyChest('sahil', '#1e88e5', 85, GROUND, 2, 35, 0, Math.PI / 2);
  addStone('sahil', 1, 40, 9);
  addStone('sahil', 2, 46, -8.5);
  W.npcSlots.sahil = [[38.8, -4.5], [34, 7.5], [53, 2], [44, 11]];
  coinsLine(45, 0, 55, 0, 5);
  coinsCircle(86, 0, 2.6, 6, GROUND + 0.8, 0.5);
  // Martılar
  for (let i = 0; i < 5; i++) {
    const b = P.bird(); collapse(b.head); collapse(b.body, new Set([b.head])); b.group.scale.setScalar(1.4); scene.add(b.group);
    W.birds.push({ ...b, fly: true, t: i * 1.3, cx: 52 + (i % 2) * 15, cz: (i - 2) * 4, r: 6 + i, h: 7 + i });
  }

  // Altınlar: tek örneklenmiş ağ (68 çizim yerine 1)
  const coinIM = new THREE.InstancedMesh(coinGeo, coinMat, W.coins.length);
  W.coins.forEach((c, i) => { c.i = i; });
  scene.add(coinIM);
  const cq = new THREE.Quaternion(), ce = new THREE.Euler(), cs = new THREE.Vector3(), cp = new THREE.Vector3(), cm = new THREE.Matrix4();
  W.updateCoins = (time) => {
    for (const c of W.coins) {
      ce.set(Math.PI / 2, 0, time * 3 + c.i);
      cq.setFromEuler(ce);
      cs.setScalar(c.taken ? 0 : 1);
      cp.set(c.x, c.y, c.z);
      coinIM.setMatrixAt(c.i, cm.compose(cp, cq, cs));
    }
    coinIM.instanceMatrix.needsUpdate = true;
  };
  W.updateCoins(0);
  coinIM.computeBoundingSphere();

  W.camRay = colliders.concat(W.camOnly);

  // Hareket etmeyen her şeyi malzemeye göre birleştir: ~1100 nesne → birkaç düzine çizim.
  const dynamic = new Set([
    coinIM,
    ...W.stars.map(s => s.mesh), ...W.keys.map(k => k.mesh),
    ...W.chests.map(c => c.mesh), ...W.gates.map(g => g.door.parent), ...W.spinners.map(s => s.obj),
    ...W.flags, ...W.birds.map(b => b.group), ...W.pads.map(p => p.mesh), ...W.photoFrames, boat,
  ]);
  mergeStatic(scene, dynamic);

  // Su (adalara göre sığ renk ve köpük) ve ada süsleri; birleştirmeden sonra eklenir (InstancedMesh birleşmez)
  W.waterFx = createWater(scene, { size: 500, level: 0, islands: W.islands.map(i => ({ x: i.x, z: i.z, r: i.r })) });
  W.islands.forEach((isl, k) => {
    // Bina, ağaç, taş, köprü gibi her çarpıştırıcının çevresi süssüz kalır; NPC yerleri ve doğuş noktası da
    const avoid = [];
    for (const c of colliders) {
      if (c.island || c.path) continue;
      const cx = c.type === 'cyl' ? c.x : (c.min.x + c.max.x) / 2, cz = c.type === 'cyl' ? c.z : (c.min.z + c.max.z) / 2;
      const cr = c.type === 'cyl' ? c.r : Math.hypot(c.max.x - c.min.x, c.max.z - c.min.z) / 2;
      if (Math.hypot(cx - isl.x, cz - isl.z) < isl.r + cr + 2 && cr < 20) avoid.push({ x: cx, z: cz, r: cr + 0.4 });
    }
    for (const slots of Object.values(W.npcSlots)) for (const [nx, nz] of slots) avoid.push({ x: nx, z: nz, r: 1.2 });
    avoid.push({ x: W.spawn.x, z: W.spawn.z, r: 2 });
    decorateIsland(scene, { x: isl.x, z: isl.z, r: isl.r, ground: GROUND, seed: k + 1, avoid, density: strong ? 1 : 0.55 });
  });

  // Bölge bulucu
  W.regionAt = (x, z) => {
    let best = null, bd = Infinity;
    for (const r of REGIONS) { const d = Math.hypot(x - r.x, z - r.z) - r.r; if (d < bd) { bd = d; best = r; } }
    return bd < 6 ? best : null;
  };
  // Açık kapılardan ulaşılabilen bölgeler (suya düşen ayı kilitli adaya çıkmasın)
  W.reachable = () => {
    const ok = new Set(['mahalle']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of W.gates) {
        if (!g.open) continue;
        if (ok.has(g.from) && !ok.has(g.to)) { ok.add(g.to); grew = true; }
        if (ok.has(g.to) && !ok.has(g.from)) { ok.add(g.from); grew = true; }
      }
    }
    return ok;
  };
  W.nearestBeach = (x, z) => {
    const ok = W.reachable();
    let best = null, bd = Infinity;
    for (const i of W.islands) {
      if (i.region && !ok.has(i.region)) continue;
      const d = Math.hypot(x - i.x, z - i.z) - i.r;
      if (d < bd) { bd = d; best = i; }
    }
    const a = Math.atan2(z - best.z, x - best.x), rr = Math.max(best.r - 1.5, 0.5);
    return { x: best.x + Math.cos(a) * rr, y: GROUND + 0.05, z: best.z + Math.sin(a) * rr };
  };

  return W;
}

function mergeStatic(scene, dynamic) {
  scene.updateMatrixWorld(true);
  const groups = new Map(), victims = [], renk = new Map();
  // Düz renkli opak toon malzemeler tek ağda birleşir; renk köşe rengi olarak taşınır (çizim çağrısı azalır)
  const VC = 'vc';
  let vcMat = null;
  const duz = m => m.isMeshToonMaterial && !m.transparent && !m.map && !m.vertexColors && m.emissive.getHex() === 0 && m.side === THREE.FrontSide;
  const isDynamic = o => { for (let p = o; p; p = p.parent) if (dynamic.has(p)) return true; return false; };
  scene.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || isDynamic(o)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    let key = o.material;
    const hazir = o.material.vertexColors && o.material.isMeshToonMaterial && g.attributes.color;   // collapse ile renklenmiş parça
    if (duz(o.material) || hazir) {
      key = VC; renk.set(g, hazir ? null : o.material.color);
      vcMat ||= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: o.material.gradientMap });
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [key, geos] of groups) {
    const mat = key === VC ? vcMat : key;
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const col = key === VC ? new Float32Array(n * 3) : null;
    let k = 0;
    for (const g of geos) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, k * 3);
      nor.set(g.attributes.normal.array, k * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, k * 2);
      const r = col && renk.get(g);
      if (col && !r) col.set(g.attributes.color.array, k * 3);
      else if (col) for (let i = k; i < k + c; i++) { col[i * 3] = r.r; col[i * 3 + 1] = r.g; col[i * 3 + 2] = r.b; }
      k += c;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.matrixAutoUpdate = false;
    const ol = mat.userData && mat.userData.outline;
    m.castShadow = !mat.transparent && !ol; m.receiveShadow = !ol;
    scene.add(m);
  }
}

function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
