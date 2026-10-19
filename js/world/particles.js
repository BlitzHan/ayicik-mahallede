// Parçacık sistemi: tek THREE.Points ve havuzlanmış buffer'lar.
import * as THREE from 'three';

const G = -9.8; // yerçekimi

// Tür tanımları. Renkler sRGB hex; shader'a doğrudan gider.
const DEFS = [
  { name: 'dust', count: 10, life: 0.5, gravity: -0.5, size: 0.3, sizeEnd: 1.6, fade: 0, jitter: 0.25,
    spread: 1.2, up: [0.4, 0.8], colors: ['#a67c52', '#c8a97e', '#8b6a45'] },
  { name: 'sparkle', count: 12, life: 0.6, gravity: G, size: 0.28, sizeEnd: 0.1, fade: 0, jitter: 0.1,
    spread: 2.4, up: [2.5, 4.5], colors: ['#fff7b0', '#ffffff', '#ffe14d'] },
  { name: 'confetti', count: 60, life: 1.4, gravity: G, size: 0.3, sizeEnd: 1, fade: 0.7, jitter: 0.1,
    spread: 2.2, up: [4, 7], colors: ['#ff4444', '#ffd21f', '#2f8cff', '#34d05c', '#ff6fc1'] },
  { name: 'splash', count: 18, life: 0.8, gravity: G, size: 0.22, sizeEnd: 1, fade: 0.6, jitter: 0.1,
    spread: 2.0, up: [3, 5], colors: ['#8fe0ff', '#b5ecff', '#5fc6f7'] },
  { name: 'heart', count: 6, life: 1.0, gravity: -0.4, size: 0.4, sizeEnd: 1.1, fade: 0.4, jitter: 0.15,
    spread: 0.5, up: [0.8, 1.2], colors: ['#ff5c8a', '#ff8fb1', '#ff3d7a'] },
];

const BY_NAME = {};
function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
DEFS.forEach((d, i) => {
  d.index = i;
  d.rgb = d.colors.map(hexRgb);
  BY_NAME[d.name] = d;
});

const rnd = (a, b) => a + Math.random() * (b - a);

export function createParticles(scene, max = 500) {
  const N = Math.max(1, Math.floor(max));

  // Havuz buffer'ları. Ölü parçacıkların alpha'sı 0.
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const sizeArr = new Float32Array(N);
  const alphaArr = new Float32Array(N);

  // Simülasyon durumu
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N); // kalan ömür, <= 0 ise ölü
  const maxLife = new Float32Array(N);
  const baseSize = new Float32Array(N);
  const kind = new Uint8Array(N); // DEFS indeksi
  let cursor = 0;
  let lastAlive = 0;

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(sizeArr, 1).setUsage(THREE.DynamicDrawUsage);
  const alphaAttr = new THREE.BufferAttribute(alphaArr, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);
  geometry.setAttribute('size', sizeAttr);
  geometry.setAttribute('alpha', alphaAttr);

  const material = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(64.0, size * (300.0 / -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // Yumuşak yuvarlak nokta, doku yok
        float d = length(gl_PointCoord - vec2(0.5));
        float soft = 1.0 - smoothstep(0.3, 0.5, d);
        gl_FragColor = vec4(vColor, vAlpha * soft);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  // Boş yuva bul. Hepsi doluysa sıradaki yuvayı ez.
  function takeSlot() {
    for (let k = 0; k < N; k++) {
      const i = (cursor + k) % N;
      if (life[i] <= 0) {
        cursor = (i + 1) % N;
        return i;
      }
    }
    const i = cursor;
    cursor = (cursor + 1) % N;
    return i;
  }

  // Tür için parçacık patlat
  function burst(type, x = 0, y = 0, z = 0, count) {
    const d = BY_NAME[type];
    if (!d) return;
    const n = Math.min(N, Math.max(0, Math.floor(Number.isFinite(count) ? count : d.count)));
    for (let j = 0; j < n; j++) {
      const i = takeSlot();
      const i3 = i * 3;
      // Yatay yön rastgele, dikey hız türe göre
      const a = Math.random() * Math.PI * 2;
      const sp = d.spread * rnd(0.4, 1);
      vel[i3] = Math.cos(a) * sp;
      vel[i3 + 1] = rnd(d.up[0], d.up[1]);
      vel[i3 + 2] = Math.sin(a) * sp;

      posArr[i3] = x + rnd(-d.jitter, d.jitter);
      posArr[i3 + 1] = y + Math.random() * d.jitter * 0.5;
      posArr[i3 + 2] = z + rnd(-d.jitter, d.jitter);

      const c = d.rgb[(Math.random() * d.rgb.length) | 0];
      colArr[i3] = c[0];
      colArr[i3 + 1] = c[1];
      colArr[i3 + 2] = c[2];

      life[i] = maxLife[i] = d.life;
      baseSize[i] = d.size * rnd(0.8, 1.2);
      sizeArr[i] = baseSize[i];
      alphaArr[i] = 1;
      kind[i] = d.index;
    }
    if (n > 0) points.visible = true;
  }

  // Hız, yerçekimi, ömür ve alpha/size güncelle
  function update(dt) {
    if (!(dt > 0)) return;
    let alive = 0;

    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        life[i] = 0;
        alphaArr[i] = 0;
        sizeArr[i] = 0;
        continue;
      }

      const d = DEFS[kind[i]];
      const i3 = i * 3;
      vel[i3 + 1] += d.gravity * dt;
      posArr[i3] += vel[i3] * dt;
      posArr[i3 + 1] += vel[i3 + 1] * dt;
      posArr[i3 + 2] += vel[i3 + 2] * dt;

      // t: ömrün ne kadarı geçti (0 - 1)
      const t = 1 - life[i] / maxLife[i];
      alphaArr[i] = t < d.fade ? 1 : (1 - t) / (1 - d.fade);
      sizeArr[i] = baseSize[i] * (1 + (d.sizeEnd - 1) * t);
      alive++;
    }

    points.visible = alive > 0;
    // Son karede ölenlerin alpha'sı da yüklensin diye önceki kare de kontrol edilir
    if (alive > 0 || lastAlive > 0) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
    lastAlive = alive;
  }

  return { burst, update };
}
