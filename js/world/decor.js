// Ada süsleri: çimen öbeği, çiçek, çalı, kenar kayası, kum kabuğu.
// Her tür tek InstancedMesh (tek çizim). Seed'li LCG ile deterministik.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const SAND_Y = 0.6;   // kum yüzeyi
const SHELL_Y = 0.62; // kabuk merkezi

const pal = (list) => list.map((h) => new THREE.Color(h));
const GRASS = pal(['#5cb84a', '#8ee06a']);
const FLOWER = pal(['#e53935', '#fdd835', '#ffffff', '#8e24aa', '#1e88e5']);
const BUSH = pal(['#2e7d32', '#8bc34a']);
const ROCK = pal(['#9a9489', '#b8b0a0', '#7d7a72', '#c9bfa8', '#a39e92']);
const SHELL = pal(['#fff3e0', '#ffe0b2', '#f8d7c4', '#e8f6ff', '#ffd6e7', '#fff9c4']);

// Tek malzeme: renk = instanceColor x vertex rengi
const MAT = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });

let PROTO = null;

// Seed'li LCG, 0..1 arası sayı
function makeRng(seed) {
  let s = Math.imul((seed | 0) + 1, 0x9e3779b1) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Geometrileri non-indexed olarak birleştirir; parça başına vertex rengi (yoksa beyaz).
function merge(parts) {
  const list = parts.map(([g, c]) => [g.index ? g.toNonIndexed() : g, c]);
  const n = list.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const colr = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of list) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) {
      const k = (o + i) * 3;
      colr[k] = c ? c[0] : 1;
      colr[k + 1] = c ? c[1] : 1;
      colr[k + 2] = c ? c[2] : 1;
    }
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return out;
}

// Tabanı y=0'a oturtur, yüksekliği döndürür.
function base0(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(0, -b.min.y, 0);
  return b.max.y - b.min.y;
}

const withH = (geo) => ({ geo, H: base0(geo) });

function protos() {
  if (PROTO) return PROTO;
  // Çimen öbeği: 3 sivri koni (metre cinsinden, tabanı y=0)
  const cone = (rad, h, x, z, tilt) => {
    const g = new THREE.ConeGeometry(rad, h, 5, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ(tilt);
    g.translate(x, 0, z);
    return [g, null];
  };
  // Çiçek: sap (taç renginin koyu tonu) + taç (beyaz, instanceColor'ı taşır)
  const stem = new THREE.CylinderGeometry(0.018, 0.022, 0.26, 4, 1, true);
  stem.translate(0, 0.13, 0);
  const crown = new THREE.IcosahedronGeometry(0.075, 0);
  crown.translate(0, 0.28, 0);
  // Çalı: 3 küre (IcosahedronGeometry(1,1) ölçekli)
  const blob = (rad, x, y, z) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(rad, rad, rad);
    g.translate(x, y, z);
    return [g, null];
  };
  // Kenar kayası: yassı dodecahedron
  const rock = new THREE.DodecahedronGeometry(0.3, 0);
  rock.scale(1, 0.7, 1);
  // Kum kabuğu: yassı küre, merkezi orijinde
  const shell = new THREE.SphereGeometry(0.07, 6, 4);
  shell.scale(1, 0.4, 1);

  PROTO = {
    tuft: withH(merge([
      cone(0.06, 0.35, 0, 0, 0),
      cone(0.05, 0.26, 0.07, 0.03, -0.25),
      cone(0.05, 0.3, -0.06, 0.05, 0.22),
    ])),
    flower: withH(merge([[stem, [0.5, 0.5, 0.5]], [crown, null]])),
    bush: withH(merge([
      blob(0.28, 0, 0.26, 0),
      blob(0.2, 0.22, 0.18, 0.08),
      blob(0.21, -0.2, 0.19, -0.1),
    ])),
    rock: withH(merge([[rock, null]])),
    shell: { geo: merge([[shell, null]]), H: 1 },
  };
  return PROTO;
}

export function decorateIsland(scene, { x, z, r, ground = 1, seed = 1, avoid = [], density = 1 } = {}) {
  if (!(r > 0)) return { count: 0 };
  const P = protos();
  const rnd = makeRng(seed);
  let count = 0;

  const blocked = (px, pz) => avoid.some((a) => Math.hypot(px - a.x, pz - a.z) < a.r);

  // Ada merkezli halkada alan-eşit rastgele nokta
  const disc = (r0, r1) => {
    const a = rnd() * TAU;
    const d = Math.sqrt(r0 * r0 + rnd() * (r1 * r1 - r0 * r0));
    return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, d };
  };

  // n nokta; avoid içindeyse en fazla 12 kez yeniden dener
  const spots = (n, sample) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 12; t++) {
        const p = sample();
        if (!blocked(p.x, p.z)) { out.push(p); break; }
      }
    }
    return out;
  };

  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // Tek InstancedMesh: konum, ölçek, yönelim ve instanceColor
  const place = (name, proto, items) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(proto.geo, MAT, items.length);
    im.name = name;
    im.castShadow = false;
    im.receiveShadow = true;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const m = new THREE.Matrix4();
    items.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      q.setFromEuler(new THREE.Euler(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'));
      s.set(it.sx, it.sy, it.sz);
      im.setMatrixAt(i, m.compose(p, q, s));
      im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    scene.add(im);
    count += items.length;
  };

  // Çimen öbekleri (boy 0.15-0.35)
  place('cimen', P.tuft, spots(Math.round(r * 90 * density), () => disc(0, r * 0.95)).map((p) => {
    const s = (0.15 + rnd() * 0.2) / P.tuft.H;
    return {
      x: p.x, y: ground - 0.02, z: p.z,
      sx: s, sy: s, sz: s,
      ry: rnd() * TAU,
      c: new THREE.Color().lerpColors(GRASS[0], GRASS[1], rnd()),
    };
  }));

  // Küçük çiçekler
  place('cicek', P.flower, spots(Math.round(r * 12 * density), () => disc(0, r * 0.95)).map((p) => {
    const s = 0.8 + rnd() * 0.4;
    return { x: p.x, y: ground, z: p.z, sx: s, sy: s, sz: s, c: pick(FLOWER) };
  }));

  // Çalılar: kenara yakın halka (boy 0.4-0.6)
  place('cali', P.bush, spots(Math.round(r * 0.6), () => disc(r * 0.75, r * 0.95)).map((p) => {
    const s = (0.4 + rnd() * 0.2) / P.bush.H;
    const sx = s * (0.9 + rnd() * 0.3);
    const sz = s * (0.9 + rnd() * 0.3);
    return {
      x: p.x, y: ground, z: p.z,
      sx, sy: s, sz,
      ry: rnd() * TAU,
      c: new THREE.Color().lerpColors(BUSH[0], BUSH[1], rnd()),
    };
  }));

  // Kenar kayaları: kum şeridinin iç kenarında (boy 0.25-0.6)
  place('kaya', P.rock, spots(Math.round(r * 1.6), () => {
    const a = rnd() * TAU;
    const d = r - 0.3 + rnd() * 0.7;
    return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, d };
  }).map((p) => {
    const s = (0.25 + rnd() * 0.35) / P.rock.H;
    const w = s * (1.2 + rnd() * 0.4);
    return {
      x: p.x, y: (p.d < r ? ground : SAND_Y) - 0.05, z: p.z,
      sx: w, sy: s, sz: w,
      rx: (rnd() - 0.5) * 0.3,
      ry: rnd() * TAU,
      rz: (rnd() - 0.5) * 0.3,
      c: pick(ROCK),
    };
  }));

  // Kum üstünde kabuk / çakıl
  place('kabuk', P.shell, spots(Math.round(r * 3), () => disc(r + 0.15, r + 1.5)).map((p) => {
    const s = 0.8 + rnd() * 0.6;
    return { x: p.x, y: SHELL_Y, z: p.z, sx: s, sy: s, sz: s, ry: rnd() * TAU, c: pick(SHELL) };
  }));

  return { count };
}
