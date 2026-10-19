// Okyanus: dalgalı toon su, kıyıya göre renk, köpük bandı ve parıltılar.
import * as THREE from 'three';

const MAX_ISLANDS = 8;

const VERT = /* glsl */`
#include <fog_pars_vertex>
uniform float uTime;
varying vec3 vWorld;
varying float vWave;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // üç sinüsle hafif dalga (toplam genlik en çok 0.08)
  float a = sin(wp.x * 0.13 + uTime * 0.9);
  float b = sin(wp.z * 0.17 - uTime * 0.7);
  float c = sin((wp.x + wp.z) * 0.29 + uTime * 1.3);
  float h = (a + b + c) / 3.0;
  wp.y += h * 0.08;
  vWave = h;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uIslands[${MAX_ISLANDS}];
uniform int uCount;
uniform vec3 uShallow;
uniform vec3 uDeep;
varying vec3 vWorld;
varying float vWave;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // en yakın adaya kıyı uzaklığı (kum şeridi r+1.8'e kadar)
  float d = 1000.0;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    if (i >= uCount) break;
    vec3 isl = uIslands[i];
    d = min(d, length(vWorld.xz - isl.xy) - (isl.z + 1.8));
  }

  // kıyı çizgisi yavaşça dalgalansın
  float dn = d + 0.18 * sin(uTime * 0.9 + vWorld.x * 0.45 + vWorld.z * 0.37);

  // toon renk: kıyıdan 4 m boyunca açık turkuazdan derin maviye, 5 basamak
  float q = floor(clamp(dn / 4.0, 0.0, 1.0) * 4.999) / 4.0;
  vec3 col = mix(uShallow, uDeep, q);

  // dalga tepelerinde hafif parlama
  col += vec3(0.05) * step(0.45, vWave);

  // köpük: kıyıda ince çizgi + kıyıdan açılıp kapanan bant (0..0.9 m)
  float pulse = 0.5 + 0.5 * sin(uTime * 1.4 + (vWorld.x + vWorld.z) * 0.6);
  float edge = 0.35 + 0.55 * pulse;
  float line1 = step(dn, 0.2);
  float line2 = step(edge - 0.26, dn) * step(dn, edge);
  float foam = max(line1, line2) * step(dn, 0.9);
  col = mix(col, vec3(1.0), foam);

  // seyrek beyaz parıltılar: zamanla kayan hücre ızgarası
  vec2 sp = vWorld.xz * 0.6 + vec2(uTime * 0.12, uTime * 0.07);
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float h = hash21(cell);
  vec2 off = (vec2(hash21(cell + 7.1), hash21(cell + 19.3)) - 0.5) * 0.5;
  float tw = 0.5 + 0.5 * sin(uTime * 2.5 + h * 60.0);
  float rad = 0.05 + 0.09 * tw;
  float spark = step(0.93, h) * step(0.3, tw) * (1.0 - smoothstep(rad - 0.02, rad, length(f - off)));
  float fade = 1.0 - smoothstep(60.0, 140.0, length(cameraPosition - vWorld));
  col = mix(col, vec3(1.0), spark * fade * (1.0 - foam));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createWater(scene, { size = 500, level = 0, islands = [] } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 120, 120);
  geo.rotateX(-Math.PI / 2); // yatay yap, normal yukarı baksın

  // ada dizisi: (x, z, r); kullanılmayanlar çok uzakta
  const isl = [];
  for (let i = 0; i < MAX_ISLANDS; i++) isl.push(new THREE.Vector3(1e5, 1e5, 0));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uIslands: { value: isl },
      uCount: { value: 0 },
      uShallow: { value: new THREE.Color('#5fe1e6') },
      uDeep: { value: new THREE.Color('#2f8fd8') },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    fog: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.frustumCulled = false; // dalga kaydırması sınırları aşmasın
  scene.add(mesh);

  // ada listesini uniform'a yaz (en çok 8)
  function setIslands(list) {
    const arr = mat.uniforms.uIslands.value;
    const n = Math.min(list.length, MAX_ISLANDS);
    for (let i = 0; i < MAX_ISLANDS; i++) {
      if (i < n) arr[i].set(list[i].x, list[i].z, list[i].r);
      else arr[i].set(1e5, 1e5, 0);
    }
    mat.uniforms.uCount.value = n;
  }
  setIslands(islands);

  function update(time) {
    mat.uniforms.uTime.value = time;
  }

  return { mesh, update, setIslands };
}
