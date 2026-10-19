import * as THREE from 'three';

// Gökyüzü kubbesi + kabarık bulutlar. Toplam 13 çizim çağrısı (1 gök + 12 bulut).

// Sabit tohumlu rastgele sayı üreteci: bulut yerleşimi her açılışta aynı olur
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position; // küre kamerada ortalı: yerel konum = bakış yönü
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w; // her zaman en uzak derinlikte (camera.far'dan bağımsız)
  }
`;

const SKY_FRAG = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    // Ufuktan tepeye yumuşak geçiş; ufkun altı ufuk rengi kalır
    float t = smoothstep(0.0, 0.7, d.y);
    vec3 col = mix(uHorizon, uTop, t);
    // Güneş: geniş sarımsı parıltı + sıkı hale + küçük disk
    float s = max(dot(d, uSunDir), 0.0);
    float glow = pow(s, 6.0) * 0.22 + pow(s, 40.0) * 0.38;
    col += vec3(1.0, 0.82, 0.45) * glow;
    float disk = smoothstep(0.9988, 0.9994, s);
    col = mix(col, vec3(1.0, 0.97, 0.8), disk);
    // Hafif titreşim: telefonlarda renk bantlanmasını azaltır
    col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Tek bulut geometrisi: 6-9 ikosahedron parçası elle birleştirilir (position + normal)
function buildCloudGeometry(base, rand) {
  const src = base.attributes.position.array;
  const vcount = src.length / 3;
  const n = 6 + Math.floor(rand() * 4); // 6-9 parça
  const pos = new Float32Array(n * vcount * 3);
  const nor = new Float32Array(n * vcount * 3);
  let o = 0;
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0 : (k / (n - 1)) * 2 - 1; // -1..1: soldan sağa
    const fall = 1 - Math.abs(u) * 0.5; // ortası büyük, uçları küçük
    const r = (1.2 + rand() * 0.7) * fall + 0.35;
    const cx = u * 3.0 + (rand() - 0.5) * 0.7;
    const cy = (fall - 0.5) * 1.0 + (rand() - 0.5) * 0.3;
    const cz = (rand() - 0.5) * 1.8;
    const sx = r * (1.0 + rand() * 0.25);
    const sy = r * 0.8;
    const sz = r * (0.9 + rand() * 0.25);
    for (let i = 0; i < vcount; i++) {
      const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
      // Alt tarafı yassılaştır (çizgi film bulutu)
      const yf = Math.max(y, -0.5);
      pos[o] = cx + x * sx;
      pos[o + 1] = cy + yf * sy;
      pos[o + 2] = cz + z * sz;
      // Eşit olmayan ölçek için normal: n / s
      let nx = x / sx, ny = y / sy, nz = z / sz;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
      o += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export function createSky(scene, {
  top = '#3d9be9',
  horizon = '#bfe6fb',
  sunDir = new THREE.Vector3(0.4, 0.8, 0.3),
} = {}) {
  const topCol = new THREE.Color(top);
  const horizonCol = new THREE.Color(horizon);
  const sun = new THREE.Vector3().copy(sunDir).normalize();

  // Arka plan gökyüzü küresiyle çizilir; sis rengi ufukla aynı olur
  scene.background = null;
  if (scene.fog) scene.fog.color.copy(horizonCol);
  else scene.fog = new THREE.Fog(horizonCol.clone(), 60, 160);

  // --- Gök kubbesi ---
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: topCol },
      uHorizon: { value: horizonCol },
      uSunDir: { value: sun },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false; // kamerayla birlikte taşınıyor
  scene.add(dome);

  // --- Bulutlar ---
  const rand = mulberry32(20261017);
  let base = new THREE.IcosahedronGeometry(1, 1);
  if (base.index) base = base.toNonIndexed();

  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: new THREE.Color('#dfefff'),
    emissiveIntensity: 0.35,
    flatShading: true,
    fog: false,
  });

  const COUNT = 12;
  const clouds = [];
  for (let i = 0; i < COUNT; i++) {
    const mesh = new THREE.Mesh(buildCloudGeometry(base, rand), cloudMat);
    const a = (i / COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const r = 60 + rand() * 50; // 60-110
    mesh.position.set(20 + Math.cos(a) * r, 25 + rand() * 20, -20 + Math.sin(a) * r);
    mesh.rotation.y = (rand() - 0.5) * 0.8;
    mesh.scale.setScalar(2.8 + rand() * 1.6);
    scene.add(mesh);
    clouds.push({ mesh, speed: 0.3 + rand() * 0.5 }); // 0.3-0.8 m/s
  }
  base.dispose();

  const camPos = new THREE.Vector3();
  let last = null;

  return {
    update(time, camera) {
      // time: toplam geçen saniye; dt farkından hesaplanır
      let dt = last === null ? 0 : time - last;
      last = time;
      if (!(dt > 0)) dt = 0;
      else if (dt > 0.1) dt = 0.1;

      if (camera) {
        camera.getWorldPosition(camPos);
        dome.position.copy(camPos);
      }
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > 130) c.mesh.position.x = -90;
      }
    },
  };
}
