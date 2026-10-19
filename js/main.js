// Ayıcık Mahallede — çekirdek: başlık ekranı, oyun döngüsü, etkileşimler, ödüller.
import * as THREE from 'three';
import { store, loadBaseContent } from './core/store.js';
import { speak, stopSpeak, unlockAudio, npcVoice, isSpeaking } from './core/speech.js';
import { sfx } from './core/sfx.js';
import { normalizeContent } from './core/content.js';
import { createInput } from './engine/input.js';
import { createBody, stepBody, updateMovers, rayHit, TUNING } from './engine/physics.js';
import { createBear, collapse, toon } from './world/bear.js';
import { openWardrobe } from './ui/gardrop.js';
import { buildWorld, REGIONS, GROUND } from './world/world.js';
import { emojiSprite, npcModel, emojiTexture, cat, bird } from './world/props.js';
import { createParticles } from './world/particles.js';

const $ = id => document.getElementById(id);
const SAYI = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on'];
const OVGU = ['Aferin', 'Harikasın', 'Süpersin', 'Çok güzel', 'Bravo'];
const KOSTUMLER = [
  { altin: 15, ad: 'kep', emoji: '🧢', soz: 'Yeni şapka kazandın!' },
  { altin: 40, ad: 'cicek', emoji: '🌸', soz: 'Çiçekli taç kazandın!' },
  { altin: 70, ad: 'fes', emoji: '🎩', soz: 'Kırmızı fes kazandın!' },
  { altin: 110, ad: 'tac', emoji: '👑', soz: 'Altın taç kazandın!' },
  { altin: 160, ad: 'kask', emoji: '⛑️', soz: 'Yeşil kask kazandın!' },
];
// Bölge girişinde söylenen hedef cümlesi
const BOLGE_GIRIS = {
  mahalle: 'Mahalle! Ünlemli arkadaşlarla konuş, onlara yardım et, yıldız topla.',
  okul: 'Okul bahçesi! Öğretmenle konuş, bulmacaları çöz, arkadaşlarına yardım edip yıldız topla.',
  cami: 'Cami bahçesi! Dede ile konuş, güvercinlere ve kediye yardım et, yıldız topla.',
  sahil: 'Sahil! Simitçi ve çaycı ile konuş, vapura bak, yıldız topla.',
};
// Toplama görevlerinde eşya adı (icerik'te hedef.ad yoksa emojiden)
const ESYA_AD = { '🍎': 'elma', '🌷': 'çiçek', '✏️': 'kalem', '⚽': 'top', '🌾': 'buğday', '🐟': 'balık', '🥯': 'simit', '🍵': 'çay bardağı' };
const esyaAd = g => g?.hedef?.ad || ESYA_AD[g?.hedef?.ikon] || '';
const sayiSoz = n => cap(SAYI[n] || String(n));
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------------- Kurulum ----------------
const canvas = $('sahne');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Karakterler gölge düşürür; dış hat (outline) ağları düşürmez
const castShadows = obj => obj.traverse(o => { if (o.isMesh && !o.userData.outline) { o.castShadow = true; o.receiveShadow = true; } });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 75 : 58;            // dik ekranda daha geniş görüş
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
// Telefon döndürme, adres çubuğu ve tam ekran geçişlerinde de boyutu yakala
window.visualViewport?.addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
try { new ResizeObserver(resize).observe(document.documentElement); } catch (_) {}

const input = createInput();
let W = null;                 // dünya
let fx = null;                // parçacık efektleri
let content = null;
let player = null, body = null;
let npcs = [];                // {def, model, x, z, gorev, state}
let collectibles = [];        // görev eşyaları
let carriedKey = null;
let busy = false;             // bulmaca açık (ayı durur)
let talkingNpc = null;        // konuşan NPC (ayı yürüyebilir, yeni etkileşim yok)
let awarding = false;         // ödül konuşması sürüyor
let lastProgress = 0;         // son ilerleme anı (yol gösterici ok için)
let inGame = false;
let camYaw = 0, camPitch = 0.38, camDist = 7.5, lastManualCam = -10;
let currentRegion = null;
let time = 0;
const announced = new Map();  // sesli uyarı bekleme süreleri

const prof = () => store.activeProfile();
const childName = () => prof()?.ad || '';
const progress = () => store.progress();

// ---------------- Başlık ekranı ----------------
const RENKLER = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ec407a', '#6d4c41'];

function renderProfiles() {
  const box = $('profiller'); box.innerHTML = '';
  const list = store.profiles();
  const active = prof();
  for (const p of list) {
    const b = document.createElement('button');
    b.className = 'profil' + (active?.id === p.id ? ' secili' : '');
    b.style.borderColor = active?.id === p.id ? '' : p.renk;
    if (p.foto) b.style.backgroundImage = `url(${p.foto})`; else b.textContent = '🐻';
    b.innerHTML += `<small>${escapeHtml(p.ad)}</small>`;
    b.onclick = () => { unlockAll(); store.setActive(p.id); renderProfiles(); sfx.play('pop'); speak(p.ad); };
    box.appendChild(b);
  }
  $('ilk-kurulum').hidden = list.length > 0;
  $('oyna').hidden = list.length === 0;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function setupFirstRun() {
  let renk = RENKLER[0];
  const box = $('ilk-renkler');
  RENKLER.forEach(c => {
    const b = document.createElement('button'); b.style.background = c; if (c === renk) b.classList.add('secili');
    b.onclick = () => { renk = c; box.querySelectorAll('button').forEach(x => x.classList.toggle('secili', x === b)); };
    box.appendChild(b);
  });
  $('ilk-kaydet').onclick = () => {
    const ad = $('ilk-ad').value.trim();
    if (!ad) { $('ilk-ad').focus(); return; }
    const p = store.addProfile({ ad, renk, foto: null });
    store.setActive(p?.id ?? store.profiles().at(-1)?.id);
    renderProfiles();
  };
}

function setupGear() {
  const g = $('ayar'); let timer = null;
  const start = e => {
    e.preventDefault(); g.classList.add('doluyor');
    timer = setTimeout(() => { g.classList.remove('doluyor'); openPanel(); }, 2000);
  };
  const cancel = () => { clearTimeout(timer); g.classList.remove('doluyor'); };
  g.addEventListener('pointerdown', start);
  g.addEventListener('pointerup', cancel); g.addEventListener('pointerleave', cancel); g.addEventListener('pointercancel', cancel);
}

async function openPanel() {
  try {
    const { openParentPanel } = await import('./parent/panel.js');
    await openParentPanel({ speak, sfx, onChange: refreshContent });
  } catch (err) { console.error('Ebeveyn paneli açılamadı', err); }
  renderProfiles();
}

function refreshContent() {
  content = normalizeContent(store.content());
  renderProfiles();
  if (W) loadPhotos();
}

let audioUnlocked = false;
function unlockAll() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try { sfx.unlock(); } catch (_) {}
  unlockAudio();
}

// ---------------- Oyuna giriş ----------------
async function startGame() {
  unlockAll();
  if (!prof()) return;
  $('baslik').hidden = true;
  $('hud').hidden = false; $('kontroller').hidden = false;
  document.body.classList.add('oyunda');
  // Beklemeden dene: bazı tarayıcılarda bu sözler hiç sonuçlanmıyor.
  try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch (_) {}

  if (!W) {
    W = buildWorld(scene);
    fx = createParticles(scene);
    player = createBear({ renk: prof().renk || '#e53935' });
    castShadows(player.group);
    scene.add(player.group); scene.add(player.shadow);
  }
  player.setScarf(prof().renk || '#e53935');
  player.setCostume(progress().kostum || null); player.setShirt(store.getShirt(progress().gomlek)); castShadows(player.group);
  body = createBody(W.spawn.x, W.spawn.y, W.spawn.z);
  body.facing = Math.PI; player.group.rotation.y = Math.PI;   // kuzeye, kameradan uzağa
  camYaw = 0;
  carriedKey = null;
  currentRegion = null;
  input.reset();
  setupNpcs();
  applyProgress();
  updateFriends();
  loadPhotos();
  updateHud();
  inGame = true;
  import('./puzzles/index.js').catch(() => {});
  try { renderer.compile(scene, camera); } catch (_) {}
  prebuildFriends();
  await speak(`Hoş geldin ${childName()}!`, { key: [`hosgeldin:${prof().id}`, 'hosgeldin'], alt: 'Hoş geldin!' });
  if (!progress().ogretici) tutorial();
}

// İlk oyunda gösterimli anlatım: el animasyonu joystick'i, sonra zıplama düğmesini gösterir.
async function tutorial() {
  const hand = document.createElement('div');
  hand.className = 'ogretici-el joy'; hand.textContent = '👆';
  document.body.appendChild(hand);
  const startPos = { ...body.pos };
  speak('Parmağını burada kaydır. Ayıcık yürüsün!');
  await waitUntil(() => !inGame || Math.hypot(body.pos.x - startPos.x, body.pos.z - startPos.z) > 3, 20000);
  if (!inGame) { hand.remove(); return; }
  hand.className = 'ogretici-el zipla';
  let jumped = false; const watch = setInterval(() => { if (body?.jumped || !body?.grounded) jumped = true; }, 30);
  speak('Şimdi sarı düğmeye bas. Hop, zıpla!');
  await waitUntil(() => !inGame || jumped, 20000);
  clearInterval(watch); hand.remove();
  if (!inGame) return;
  sfx.play('yes');
  store.saveProgress({ ogretici: true });
  await speak('Süper! Altınları topla, dostlarınla konuş!');
}
function waitUntil(fn, max) {
  return new Promise(res => { const t0 = performance.now(); const id = setInterval(() => { if (fn() || performance.now() - t0 > max) { clearInterval(id); res(); } }, 100); });
}

function backToTitle() {
  inGame = false; busy = false;
  stopSpeak();
  sfx.music('baslik');
  $('baslik').hidden = false; $('hud').hidden = true; $('kontroller').hidden = true;
  document.body.classList.remove('oyunda');
  renderProfiles();
}

// İlerlemeyi dünyaya uygula: alınmış yıldızlar, açık sandıklar, kapılar
function applyProgress() {
  const pr = progress();
  for (const s of W.stars) { s.taken = !!pr.yildiz?.[s.id]; s.mesh.visible = !s.taken; }
  for (const c of W.chests) {
    const done = !!pr.yildiz?.[`${c.region}-sandik`];
    c.open = done; c.lid.rotation.x = done ? -1.9 : 0; c.hazine.visible = done;
  }
  refreshStones();
  for (const k of W.keys) {
    const done = !!pr.yildiz?.[`${k.region}-sandik`];
    k.taken = done; k.mesh.visible = !done;
  }
  for (const c of W.coins) c.taken = false;
  updateGates(true);
}

// Yıldız sayısı (ve istenirse en yakın kapalı köprünün gereği) söylenir
async function yildizSoyle(kapiyla) {
  unlockAll();
  const n = starCount();
  await speak(`${sayiSoz(n)} yıldızın var.`);
  if (!kapiyla) return;
  let g = null, bd = Infinity;
  for (const x of W.gates) { if (x.open) continue; const d = Math.hypot(body.pos.x - x.x, body.pos.z - x.z); if (d < bd) { bd = d; g = x; } }
  if (g) await speak(`Köprü için ${SAYI[g.need] || g.need} yıldız lazım.`);
}
// "Ne yapmalıyım?": şimdiki hedef + yıldız sayısı
async function yardimSoyle() {
  unlockAll();
  if (!inGame || busy) return;
  lastProgress = time;
  const t = guideTarget();
  if (t) await speak(guideInfo(t).text);
  await yildizSoyle(false);
}

// ---------------- Yol gösterici ok ----------------
// Çocuk bir süre ilerleyemezse ayının önünde en yakın hedefi gösteren sarı ok belirir.
let guide = null;
function makeGuide() {
  const g = new THREE.Group();
  const m = toon('#ffd600', { emissive: '#7a5c00' });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 12), m); tip.rotation.x = Math.PI / 2; tip.position.z = 0.35; g.add(tip);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10), m); shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.2; g.add(shaft);
  g.visible = false; scene.add(g);
  return g;
}
function guideTarget() {
  const p = body.pos, ok = W.reachable();
  const near = list => { let b = null, bd = Infinity; for (const t of list) { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd) { bd = d; b = t; } } return b; };
  if (carriedKey) { const c = W.chests.find(c => c.region === carriedKey.region && !c.open); if (c) return c; }
  const done = npcs.filter(n => n.active?.done); if (done.length) return near(done);
  if (collectibles.length) return near(collectibles);
  const pr = progress();
  const lists = [
    npcs.filter(n => ok.has(n.region) && npcHasWork(n)),
    W.stones.filter(s => ok.has(s.region) && !pr.yildiz?.[s.id]),
    W.keys.filter(k => ok.has(k.region) && !k.taken),
  ];
  for (const l of lists) if (l.length) return near(l);
  // Erişilebilir yerde iş kalmadı: kapalı köprüye yönlendir
  return near(W.gates.filter(g => !g.open && (ok.has(g.from) || ok.has(g.to)))) || null;
}
// Okun gösterdiği hedef için sesli ipucu: {key, text}
function guideInfo(t) {
  if (!t) return { key: '', text: '' };
  if (t.lid) { const a = regionById(t.region).anahtarAd; return { key: 'sandik', text: `${cap(a)} anahtarı ${a} sandığa götür!` }; }
  if (t.def) {
    if (t.active?.done) return { key: 'bekler' + t.def.id, text: `${t.def.ad} seni bekliyor! Topladıklarını ona götür.` };
    return { key: 'npc', text: `${t.def.ad} sana bir şey soracak. Oka doğru git!` };
  }
  if (t.sprite) {
    const a = t.npc.active, left = a ? a.need - a.got : 1, e = esyaAd(a?.gorev);
    return { key: 'topla' + left, text: e ? `${sayiSoz(left)} ${e} daha bul!` : `${sayiSoz(left)} tane daha bul!` };
  }
  if (t.cube) return { key: 'tas', text: 'Bulmaca taşı seni bekliyor. Oka doğru git!' };
  if (t.door) return { key: 'kapi', text: `Yeni köprüye git! Orada ${SAYI[t.need] || t.need} yıldız lazım.` };
  return { key: 'anahtar', text: 'Bir anahtar var. Oka doğru git, bul!' };
}
let guideKey = '', guideSpoke = -99;
function updateGuide() {
  if (!guide) guide = makeGuide();
  const idle = time - lastProgress > 12 && !busy && !talkingNpc && !awarding;
  const t = idle ? guideTarget() : null;
  const dx = t ? t.x - body.pos.x : 0, dz = t ? t.z - body.pos.z : 0, d = Math.hypot(dx, dz);
  guide.visible = !!t && d > 3.5;
  if (!guide.visible) { guideKey = ''; return; }
  // Sesli ipucu: ok belirince bir kez, çocuk durgunsa ~20 sn'de bir tekrar
  const gi = guideInfo(t);
  if (!isSpeaking() && (gi.key !== guideKey || time - guideSpoke > 20)) {
    guideKey = gi.key; guideSpoke = time; speak(gi.text);
  }
  guide.position.set(body.pos.x + dx / d * 1.5, body.pos.y + 0.35 + Math.abs(Math.sin(time * 4)) * 0.15, body.pos.z + dz / d * 1.5);
  guide.rotation.y = Math.atan2(dx, dz);
}

// Yıldızı alınmış bulmaca taşı ✅ gösterir (yine oynanabilir, altın verir)
function refreshStones() {
  const pr = progress();
  for (const s of W.stones) {
    const want = pr.yildiz?.[s.id] ? '✅' : '🧩';
    if (s.icon.userData.e !== want) { s.icon.material.map = emojiTexture(want); s.icon.material.needsUpdate = true; s.icon.userData.e = want; }
  }
}

function starCount() { return Object.keys(progress().yildiz || {}).length; }

let kopruAcildi = false;   // yıldızdan sonra "Köprü açıldı!" denecek mi
function updateGates(silent = false) {
  const n = starCount();
  for (const g of W.gates) {
    g.sign.material.map.dispose?.();
    const fresh = makeSignTexture(`⭐ ${Math.min(n, g.need)}/${g.need}`);
    g.sign.material.map = fresh; g.sign.material.needsUpdate = true;
    if (!g.open && n >= g.need) {
      g.open = true;
      g.collider.min.y = -50; g.collider.max.y = -49;
      g.opening = silent ? 1 : 0.0001;
      if (silent) g.door.position.y = -3.2;
      g.sign.visible = false;
      if (!silent) { sfx.play('open'); kopruAcildi = true; }
    }
    if (g.open && silent) { g.door.position.y = -3.2; g.sign.visible = false; }
  }
}
function makeSignTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.roundRect(0, 0, 256, 96, 48); x.fill();
  x.font = 'bold 56px ui-rounded, system-ui, sans-serif'; x.fillStyle = '#4a3311'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function loadPhotos() {
  const photos = [];
  if (prof()?.foto) photos.push(prof().foto);
  for (const f of content?.fotolar || []) if (f?.dataURL) photos.push(f.dataURL);
  W.photoFrames.forEach((fr, i) => {
    const src = photos[i];
    if (!src) { fr.material.map = emojiTexture(['❤️', '🏡', '🌷', '⭐'][i], 128, '#fff8e1'); fr.material.needsUpdate = true; return; }
    new THREE.TextureLoader().load(src, t => { t.colorSpace = THREE.SRGBColorSpace; fr.material.map = t; fr.material.needsUpdate = true; });
  });
}

// ---------------- NPC'ler ----------------
function setupNpcs() {
  for (const n of npcs) { scene.remove(n.model.group); scene.remove(n.model.shadow); }
  npcs = [];
  for (const r of REGIONS) {
    const slots = W.npcSlots[r.id] || [];
    const defs = content.npcler.filter(n => n.alan === r.alan).slice(0, slots.length);
    defs.forEach((def, i) => {
      const [x, z] = slots[i];
      const model = npcModel(def);
      model.group.position.set(x, GROUND, z);
      model.group.rotation.y = Math.atan2(r.x - x, r.z - z);
      model.shadow.position.set(x, GROUND + 0.02, z);
      castShadows(model.group);
      scene.add(model.group); scene.add(model.shadow);
      const marker = emojiSprite('💬', 0.8); marker.position.set(0, 2.3, 0); model.group.add(marker);
      const gorevler = content.gorevler.filter(g => g.npc === def.id);
      const ana = gorevler.find(g => g.ana) || null;
      npcs.push({ def, model, x, z, region: r.id, marker, gorevler, ana, line: 0, active: null, talking: false });
    });
    // Bölgenin ana görevi yoksa ilk görevi ana say
    const regionNpcs = npcs.filter(n => n.region === r.id);
    if (!regionNpcs.some(n => n.ana)) {
      const withG = regionNpcs.find(n => n.gorevler.length);
      if (withG) withG.ana = withG.gorevler[0];
    }
  }
  refreshMarkers();
}

function npcHasWork(n) {
  const pr = progress();
  if (n.active) return true;
  return !!pickTask(n);       // ana görev ya da bitmemiş başka bir görev
}
function refreshMarkers() {
  for (const n of npcs) {
    const want = n.active?.done ? '⭐' : npcHasWork(n) ? '❗' : '💬';
    if (n.marker.userData.e !== want) {
      n.marker.material.map = emojiTexture(want); n.marker.material.needsUpdate = true; n.marker.userData.e = want;
    }
  }
}

async function talkTo(n) {
  talkingNpc = n; n.talking = true;   // oyun akmaya devam eder; yalnız yeni etkileşim engellenir
  n.model.group.rotation.y = Math.atan2(body.pos.x - n.x, body.pos.z - n.z);
  sfx.play('talk');
  const pr = progress();
  const key = i => `npc:${n.def.id}:${i}`;
  const voice = npcVoice(n.def.id);   // NPC'nin ses profili
  try {
    if (n.active?.done) {
      // Görev teslim
      const g = n.active.gorev;
      n.active = null;
      await speak(g.odul || 'Teşekkür ederim!', { voice });
      await completeTask(n, g);
    } else if (n.active) {
      const left = n.active.need - n.active.got;
      await speak(`${cap(SAYI[left] || String(left))} tane daha bulmalısın. Hadi!`, { voice });
    } else {
      const g = pickTask(n);
      if (g) {
        // İlk konuşmada selam
        if (n.def.konusmalar?.length && n.line === 0) { await speak(n.def.konusmalar[0], { key: key(0), voice }); n.line = 1; }
        await speak(g.anlatim || 'Bana yardım eder misin?', { key: `gorev:${g.id}`, voice });
        await startTask(n, g);
      } else {
        const lines = n.def.konusmalar?.length ? n.def.konusmalar : ['Merhaba!'];
        const i = n.line % lines.length; n.line++;
        await speak(lines[i], { key: key(i), voice });
      }
    }
  } finally {
    n.talking = false; talkingNpc = null; refreshMarkers();
  }
}

function pickTask(n) {
  const pr = progress();
  if (n.ana && !pr.yildiz?.[`${n.region}-gorev`]) return n.ana;
  const done = pr.gorevler || {};
  return n.gorevler.find(g => g !== n.ana && !done[g.id]) || null;
}

async function startTask(n, g) {
  if (g.tur === 'topla') {
    const need = g.hedef.adet;
    n.active = { gorev: g, need, got: 0, done: false };
    spawnCollectibles(n, g.hedef.ikon, need);
    const e = esyaAd(g);
    await speak(e ? `Etrafta ${SAYI[need] || need} ${e} var. Hepsini bul!` : `Etrafta ${SAYI[need] || need} tane var. Hepsini bul!`);
    return;
  }
  // Bulmaca görevi
  const def = (g.hedef?.bulmaca && content.bulmacalar.find(b => b.id === g.hedef.bulmaca)) || pickPuzzle(regionById(n.region).alan);
  if (!def) { await completeTask(n, g); return; }
  const res = await runPuzzle(def);
  const voice = npcVoice(n.def.id);
  if (res.solved) { await speak(g.odul || 'Teşekkür ederim!', { voice }); await completeTask(n, g); }
  else await speak('Sonra yine gel, birlikte çözeriz.', { voice });
}

async function completeTask(n, g) {
  const pr = progress();
  store.saveProgress({ gorevler: { ...(pr.gorevler || {}), [g.id]: true } });
  const id = g === n.ana ? `${n.region}-gorev` : `${n.region}-gorev-${g.id}`;
  if (!pr.yildiz?.[id]) await awardStar(id, n.model.group.position);
  else await giveCoins(5, n.model.group.position);
}

// Zemin boş mu: ev, ağaç, taş gibi bir nesnenin içine eşya düşmesin
function freeSpot(x, z) {
  for (const c of W.colliders) {
    if (c.island || c.solid === false) continue;
    const top = c.type === 'cyl' ? c.y1 : c.max.y;
    if (top <= GROUND + 0.05) continue;
    const inside = c.type === 'cyl' ? Math.hypot(x - c.x, z - c.z) < c.r + 0.9
      : x > c.min.x - 0.9 && x < c.max.x + 0.9 && z > c.min.z - 0.9 && z < c.max.z + 0.9;
    if (inside) return false;
  }
  return Math.hypot(x - body.pos.x, z - body.pos.z) > 1.5;
}

function spawnCollectibles(n, ikon, count) {
  const r = regionById(n.region);
  for (let i = 0; i < count; i++) {
    // NPC çevresinde, ada içinde rastgele noktalar
    let x, z, tries = 0;
    do {
      const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 6;
      x = n.x + Math.cos(a) * d; z = n.z + Math.sin(a) * d; tries++;
    } while ((Math.hypot(x - r.x, z - r.z) > r.r - 2 || !freeSpot(x, z)) && tries < 60);
    if (tries >= 60) { x = n.x + 2; z = n.z + 2; }
    const s = emojiSprite(ikon, 1.1);
    s.position.set(x, GROUND + 0.9, z);
    scene.add(s);
    collectibles.push({ sprite: s, npc: n, x, z, phase: Math.random() * 6 });
  }
}

// ---------------- Bulmacalar ----------------
function regionById(id) { return REGIONS.find(r => r.id === id); }

function pickPuzzle(alan) {
  const pool = content.bulmacalar.filter(b => b.alan === alan);
  if (!pool.length) return null;
  const solved = progress().cozulen || {};
  const fresh = pool.filter(b => !solved[b.id]);
  return pick(fresh.length ? fresh : pool);
}

async function runPuzzle(def) {
  busy = true; input.reset();
  let res = { solved: false };
  try {
    const { openPuzzle } = await import('./puzzles/index.js');
    res = await openPuzzle(def, { speak, sfx, childName: childName() }) || res;
  } catch (err) { console.error('Bulmaca açılamadı', err); }
  if (res.solved) {
    const pr = progress();
    store.saveProgress({ cozulen: { ...(pr.cozulen || {}), [def.id]: true } });
  }
  busy = false; input.reset();
  return res;
}

async function useStone(st) {
  const def = pickPuzzle(regionById(st.region).alan);
  if (!def) { speak('Burada henüz bulmaca yok.'); return; }
  sfx.play('whoosh');
  const res = await runPuzzle(def);
  if (!res.solved) return;
  const pr = progress();
  if (!pr.yildiz?.[st.id]) await awardStar(st.id, st.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
  else await giveCoins(3, st.group.position);
}

// ---------------- Ödüller ----------------
let lastMsg = null;
async function awardStar(id, at) {
  const pr = progress();
  if (pr.yildiz?.[id]) return;
  store.saveProgress({ yildiz: { ...(pr.yildiz || {}), [id]: true } });
  const s = W.stars.find(x => x.id === id);
  if (s) { s.taken = true; s.mesh.visible = false; }
  awarding = true; lastProgress = time;
  try {
    sfx.play('star');
    fx?.burst('confetti', body.pos.x, body.pos.y + 1.5, body.pos.z);
    const el = document.createElement('div'); el.className = 'yildiz-patlama'; el.textContent = '⭐';
    document.body.appendChild(el); setTimeout(() => el.remove(), 2300);
    updateHud(true);
    updateGates();            // köprü sayacı hemen güncellensin
    refreshStones(); refreshMarkers();
    const name = childName(), ov = pick(OVGU);
    await speak(`${ov} ${name}! Bir yıldız kazandın!`, { key: `aferin-${1 + Math.floor(Math.random() * 3)}`, alt: `${ov}! Bir yıldız kazandın!` });
    // Aile mesajı
    const msgs = (content.aileMesajlari || []).filter(m => m && m.metin);
    if (msgs.length) {
      let m = pick(msgs);
      if (msgs.length > 1 && m === lastMsg) m = msgs.find(x => x !== lastMsg);
      lastMsg = m;
      await speak(`${m.kimden ? m.kimden + ' diyor ki: ' : ''}${m.metin}`, { key: `mesaj:${m.id}` });
    }
    // Sonraki adım
    await speak(kopruAcildi ? 'Köprü açıldı! Hadi gidelim!' : 'Yeni bir görev için ünlemli arkadaşları bul!');
    kopruAcildi = false;
  } finally {
    awarding = false;         // hata olsa bile etkileşim kilidi açılır
    updateGates();
    updateFriends(true);
  }
}

async function giveCoins(n, at) {
  for (let i = 0; i < n; i++) { setTimeout(() => sfx.play('coin'), i * 120); }
  addCoins(n);
}

function addCoins(n) {
  const pr = progress();
  const altin = (pr.altin || 0) + n;
  store.saveProgress({ altin });
  updateHud(false, true);
  // Kostüm kazanımı
  const owned = new Set(pr.kostumler || []);
  const k = KOSTUMLER.find(k => altin >= k.altin && !owned.has(k.ad));
  if (k) {
    owned.add(k.ad);
    store.saveProgress({ kostumler: [...owned], kostum: k.ad });
    player.setCostume(k.ad); castShadows(player.group);
    sfx.play('star');
    const el = document.createElement('div'); el.className = 'yildiz-patlama'; el.textContent = k.emoji;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2300);
    speak(k.soz);
  }
}

function updateHud(starPop = false, coinPop = false) {
  const pr = progress();
  $('altin').textContent = pr.altin || 0;
  $('yildiz').textContent = starCount();
  if (starPop) bump('yildiz-sayac');
  if (coinPop) bump('altin-sayac');
}
// Köy dostları: her yıldız mahalleye yeni bir küçük dost getirir, ev çevresinde dolaşır.
let friends = [];
const DOST_RENK = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#ff7043', '#26c6da', '#ec407a'];
const DOST_KURK = ['#c98a5a', '#d9a066', '#8d6e63', '#f5f5f5', '#a0622d'];
const MAX_DOST = 20;
const friendPool = [];
function buildFriend(i) {
  if (friendPool[i]) return friendPool[i];
  const m = i % 5 === 3 ? cat() : i % 5 === 4 ? bird() : createBear({ kurk: DOST_KURK[i % DOST_KURK.length], renk: DOST_RENK[i % DOST_RENK.length], olcek: 0.55 });
  collapse(m.head); collapse(m.body, new Set([m.head]));
  m.group.visible = m.shadow.visible = false;
  castShadows(m.group);
  scene.add(m.group); scene.add(m.shadow);
  return (friendPool[i] = { m, r: 2.6 + (i % 4) * 0.6, a: i * 1.3, sp: (0.25 + (i % 3) * 0.08) * (i % 2 ? 1 : -1), hop: i * 0.7 });
}
// Oyun başlayınca kalan dostları her 250 ms'de bir hazırla (anlık takılma olmasın)
function prebuildFriends() {
  let i = 0;
  const next = () => {
    while (i < MAX_DOST && friendPool[i]) i++;
    if (i >= MAX_DOST || !inGame) return;
    buildFriend(i++);
    (window.requestIdleCallback || (f => setTimeout(f, 250)))(next, { timeout: 600 });
  };
  setTimeout(next, 1500);
}
function updateFriends(celebrate = false) {
  const want = Math.min(starCount(), MAX_DOST);
  while (friends.length < want) {
    const f = buildFriend(friends.length);
    f.m.group.visible = f.m.shadow.visible = true;
    if (celebrate) f.m.group.position.set(2, GROUND + 3, 3);
    friends.push(f);
  }
}
function animateFriends(dt) {
  for (const f of friends) {
    f.a += f.sp * dt;
    const x = 2 + Math.cos(f.a) * f.r, z = 3 + Math.sin(f.a) * f.r;
    const y = GROUND + Math.abs(Math.sin(time * 5 + f.hop)) * 0.15;
    const g = f.m.group;
    g.position.x = x; g.position.z = z; g.position.y += (y - g.position.y) * Math.min(1, dt * 6);
    g.rotation.y = Math.atan2(-Math.sin(f.a) * f.sp, Math.cos(f.a) * f.sp);
    f.m.shadow.position.set(x, GROUND + 0.02, z); f.m.shadow.scale.setScalar(0.6);
    f.m.animate({ speed: 0.6, grounded: true, talking: false }, dt);
  }
}

function bump(id) { const e = $(id); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }

function sayOnce(key, text, cooldown = 6) {
  if (announced.has(key) && time - announced.get(key) < cooldown) return;
  if (isSpeaking()) return;          // konuşma sürerken kesme; sonraki karede yeniden dener
  announced.set(key, time);
  speak(text);
}
const BIR_KEZ = 1e9;

// ---------------- Döngü ----------------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();

function nearestInteractable() {
  const p = body.pos; let best = null, bd = Infinity;
  const consider = (d, item) => { if (d < bd) { bd = d; best = item; } };
  for (const n of npcs) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < 2.6) consider(d, { kind: 'npc', n, icon: '💬' }); }
  for (const s of W.stones) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < 2.4) consider(d, { kind: 'stone', s, icon: '🧩' }); }
  if (W.wardrobe) { const d = Math.hypot(p.x - W.wardrobe.x, p.z - W.wardrobe.z); if (d < 2.4) consider(d, { kind: 'wardrobe', icon: '👕' }); }
  return Math.abs(p.y - GROUND) < 1.5 ? best : null;
}

async function interact(it) {
  input.showAction(null); lastProgress = time;
  if (it.kind === 'npc') await talkTo(it.n);
  else if (it.kind === 'stone') await useStone(it.s);
  else if (it.kind === 'wardrobe') {
    // Dolap: şapka ve fotoğraftan gömlek seçimi; ayı kameraya döner
    const owned = new Set(progress().kostumler || []), cd = camDist;
    busy = true; input.reset(); camDist = 3.8;
    body.facing = Math.atan2(camera.position.x - body.pos.x, camera.position.z - body.pos.z);
    try {
      await openWardrobe({ player, store, sfx, speak, camera, progress, saveProgress: p => store.saveProgress(p),
        kostumler: KOSTUMLER.filter(k => owned.has(k.ad)).map(k => ({ ad: k.ad, ikon: k.emoji })),
        onChange: () => castShadows(player.group) });
    } finally { camDist = cd; busy = false; input.reset(); }
  }
}

function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 1 / 20));
}

function tick(dt, draw = true) {
  time += dt;
  if (!inGame || !W) { if (draw) renderer.render(scene, camera); return; }

  const inp = input.poll();
  updateMovers(W.colliders, time);

  // Kamera girişi
  if (inp.camDrag) { camYaw -= inp.camDrag * 0.008; lastManualCam = time; }
  if (inp.camDragY) camPitch = Math.max(0.12, Math.min(0.85, camPitch + inp.camDragY * 0.004));
  if (inp.recenter) { camYaw = body.facing + Math.PI; lastManualCam = time - 5; }

  if (!busy) {
    stepBody(body, inp, camYaw, W.colliders, dt);
  } else {
    stepBody(body, { move: { x: 0, y: 0 }, jumpPressed: false, jumpHeld: false }, camYaw, W.colliders, dt);
  }
  if (body.jumped) sfx.play('jump');
  if (body.landed) { sfx.play('land'); fx.burst('dust', body.pos.x, body.pos.y + 0.05, body.pos.z); }
  if (body.bounced) sfx.play('bounce');

  // Su: yumuşakça kıyıya
  if (body.pos.y < -0.8) {
    sfx.play('splash'); fx.burst('splash', body.pos.x, 0.1, body.pos.z);
    const b = W.nearestBeach(body.pos.x, body.pos.z);
    body.pos.x = b.x; body.pos.y = b.y + 2; body.pos.z = b.z;
    body.vel.x = body.vel.y = body.vel.z = 0;
  }

  const p = body.pos;
  const speed = Math.hypot(body.vel.x, body.vel.z) / TUNING.speed;
  player.group.position.set(p.x, p.y, p.z);
  const target = body.facing;
  let dr = target - player.group.rotation.y;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  player.group.rotation.y += dr * Math.min(1, dt * 14);
  player.animate({ speed, grounded: body.grounded, vy: body.vel.y, landed: body.landed, jumped: body.jumped }, dt);
  if (body.grounded && speed > 0.3 && Math.sin(time * 16) > 0.95) sfx.play('step');

  // Gölge zemine
  const gy = groundY(p.x, p.z, p.y + 0.1);
  player.shadow.position.set(p.x, gy + 0.03, p.z);
  W.updateSun(p.x, p.y, p.z);
  const hgt = Math.max(0, p.y - gy);
  player.shadow.scale.setScalar(Math.max(0.4, 1 - hgt * 0.12));
  player.shadow.visible = gy > -50;

  // Otomatik kamera hizalama (hareket varken, el ile çevrilmediyse)
  if (time - lastManualCam > 3 && speed > 0.2 && Math.abs(inp.move.y) > 0.2) {
    let dy = body.facing + Math.PI - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * Math.min(1, dt * 0.8 * speed);
  }
  // Kamera konumu + duvar kontrolü
  const head = tmpV.set(p.x, p.y + 1.4, p.z);
  const dirX = Math.sin(camYaw) * Math.cos(camPitch), dirY = Math.sin(camPitch), dirZ = Math.cos(camYaw) * Math.cos(camPitch);
  const hit = rayHit(W.camRay, head.x, head.y, head.z, dirX, dirY, dirZ, camDist);
  const d = Math.max(1.8, hit - 0.3);
  camera.position.set(head.x + dirX * d, Math.max(0.6, head.y + dirY * d), head.z + dirZ * d);
  camera.lookAt(head.x, head.y + 0.2, head.z);

  if (!busy) gameplay(dt);
  animateWorld(dt);
  W.sky.update(time, camera);
  W.waterFx.update(time);
  fx.update(dt);
  if (draw) renderer.render(scene, camera);
  input.endFrame();
}

function groundY(x, z, maxY) {
  let best = -100;
  for (const c of W.colliders) {
    const t = c.type === 'cyl' ? c.y1 : c.max.y;
    if (t > maxY || t <= best) continue;
    if (c.type === 'cyl') { if (Math.hypot(x - c.x, z - c.z) < c.r) best = t; }
    else if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) best = t;
  }
  return best;
}

function gameplay(dt) {
  const p = body.pos;

  // Altınlar
  for (const c of W.coins) {
    if (c.taken) continue;
    if (Math.abs(p.x - c.x) < 1.1 && Math.abs(p.z - c.z) < 1.1 && Math.abs(p.y + 0.7 - c.y) < 1.3) {
      c.taken = true; sfx.play('coin'); addCoins(1); fx.burst('sparkle', c.x, c.y, c.z);
    }
  }
  // Yıldızlar (dünyadaki)
  for (const s of W.stars) {
    if (s.taken) continue;
    const wp = s.mesh.getWorldPosition(tmpV);
    if (Math.hypot(p.x - wp.x, p.z - wp.z) < 1.2 && Math.abs(p.y + 0.7 - wp.y) < 1.5) awardStar(s.id, wp.clone());
  }
  // Anahtarlar
  for (const k of W.keys) {
    if (k.taken) continue;
    if (Math.hypot(p.x - k.x, p.z - k.z) < 1.3 && Math.abs(p.y - k.y) < 1.8) {
      k.taken = true; carriedKey = k; sfx.play('pop'); lastProgress = time;
      const r = regionById(k.region);
      speak(`${cap(r.anahtarAd)} anahtar! ${cap(r.anahtarAd)} sandığı bulalım!`);
    }
  }
  if (carriedKey) {
    const m = carriedKey.mesh;
    m.position.lerp(tmpV.set(p.x - Math.sin(body.facing) * 0.6, p.y + 2.1, p.z - Math.cos(body.facing) * 0.6), 0.15);
  }
  // Sandıklar
  for (const c of W.chests) {
    if (c.open) continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < 2.2) {
      if (carriedKey && carriedKey.region === c.region) {
        c.open = true; c.hazine.visible = true; carriedKey.mesh.visible = false; carriedKey = null;
        fx?.burst('sparkle', c.x, GROUND + 1.2, c.z);
        sfx.play('open');
        c.opening = 0;
        awardStar(`${c.region}-sandik`, new THREE.Vector3(c.x, GROUND + 1.5, c.z));
      } else {
        const r = regionById(c.region);
        sayOnce('sandik-' + c.region, `Bu sandık kilitli. ${cap(r.anahtarAd)} anahtarı bul!`, 10);
      }
    }
  }
  // Görev eşyaları
  updateGuide();
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const it = collectibles[i];
    if (Math.hypot(p.x - it.x, p.z - it.z) < 1.2 && p.y < GROUND + 2.5) {
      scene.remove(it.sprite); collectibles.splice(i, 1);
      fx.burst('sparkle', it.x, GROUND + 0.9, it.z);
      const a = it.npc.active;
      if (!a) continue;
      a.got++; lastProgress = time;
      sfx.play('pop');
      if (a.got >= a.need) {
        a.done = true; refreshMarkers();
        speak(a.npc.def.adYonelme ? `Hepsini buldun! Şimdi ${a.npc.def.adYonelme} geri götür.` : 'Hepsini buldun! Şimdi geri götür.');
      } else speak(cap(SAYI[a.got] || String(a.got)) + '!');
    }
  }
  // Numaralı taşlar
  if (body.landed && body.groundCollider?.pad) {
    const n = body.groundCollider.pad;
    sfx.play('pop'); speak(cap(SAYI[n]) + '!');
    const pad = W.pads.find(x => x.n === n); if (pad) pad.bounce = 1;
  }
  // Kapılar
  for (const g of W.gates) {
    if (g.open) continue;
    if (Math.hypot(p.x - g.x, p.z - g.z) < 4) {
      const n = starCount();
      sayOnce('kapi-' + g.x + g.z, `Bu kapı için ${SAYI[g.need] || g.need} yıldız lazım. Şimdi ${SAYI[n] || n} yıldızın var.`, 12);
    }
  }
  // Yakınlık cümleleri (nesne başına oturumda bir kez)
  if (!busy && !talkingNpc && !awarding) {
    const pr2 = progress();
    for (const n of npcs) {
      if (n.marker.userData.e === '❗' && Math.hypot(p.x - n.x, p.z - n.z) < 3.8) sayOnce('yak-npc-' + n.def.id, `${n.def.ad}! Konuşmak için düğmeye bas.`, BIR_KEZ);
    }
    for (const s of W.stones) {
      if (!pr2.yildiz?.[s.id] && Math.hypot(p.x - s.x, p.z - s.z) < 3.8) sayOnce('yak-tas-' + s.id, 'Bulmaca taşı! Düğmeye bas, birlikte çözelim.', BIR_KEZ);
    }
    if (W.wardrobe && Math.hypot(p.x - W.wardrobe.x, p.z - W.wardrobe.z) < 3.8) sayOnce('yak-dolap', 'Kıyafet dolabı! Düğmeye bas, kıyafetini değiştir.', BIR_KEZ);
  }
  // Bölge değişimi
  const r = W.regionAt(p.x, p.z);
  if (r && r !== currentRegion) {
    currentRegion = r;
    sfx.music(r.music);
    const el = document.createElement('div'); el.className = 'bolge-adi'; el.textContent = r.emoji;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2700);
  }
  // Ada tanıtımı: başka konuşma sürüyorsa bitince söylenir
  if (currentRegion && !announced.has('bolge-' + currentRegion.id)) sayOnce('bolge-' + currentRegion.id, BOLGE_GIRIS[currentRegion.id] || currentRegion.ad + '!', BIR_KEZ);
  // Etkileşim düğmesi
  const it = (talkingNpc || awarding) ? null : nearestInteractable();
  input.showAction(it ? it.icon : null);
  if (it && input.state.actionPressed) interact(it);
}

const cap = s => s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s;

function animateWorld(dt) {
  W.updateCoins(time);
  for (const s of W.stars) if (!s.taken) { s.mesh.rotation.y += dt * 2; s.mesh.position.y = s.y + Math.sin(time * 2 + s.x) * 0.15; }
  for (const k of W.keys) if (!k.taken) { k.mesh.rotation.y += dt * 2; }
  for (const sp of W.spinners) {
    if (sp.cloud) { sp.obj.position.x += dt * sp.speed; if (sp.obj.position.x > 110) sp.obj.position.x = -70; continue; }
    sp.obj.rotation.y += dt * sp.speed;
    if (sp.bob) sp.obj.position.y = sp.base + Math.sin(time * 2) * 0.12;
  }
  for (const c of W.chests) if (c.open && c.lid.rotation.x > -1.9) c.lid.rotation.x = Math.max(-1.9, c.lid.rotation.x - dt * 4);
  for (const g of W.gates) {
    if (g.open && g.door.position.y > -3.2) g.door.position.y -= dt * 2;
    const c = g.door.userData.curtain; if (c) c.material.opacity = g.open ? 0 : 0.22 + Math.sin(time * 3 + g.x) * 0.08;
  }
  for (const pad of W.pads) if (pad.bounce) { pad.bounce = Math.max(0, pad.bounce - dt * 3); pad.mesh.position.y = 0.2 - Math.sin(pad.bounce * Math.PI) * 0.15; }
  for (const f of W.flags) { const pos = f.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(time * 4 + x * 3) * 0.08 * (x + 0.8)); } pos.needsUpdate = true; }
  for (const b of W.birds) {
    b.t += dt;
    if (b.fly) {
      const a = b.t * 0.5;
      b.group.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(b.t * 2) * 0.5, b.cz + Math.sin(a) * b.r);
      b.group.rotation.y = -a; b.group.rotation.z = Math.sin(b.t * 6) * 0.2;
    } else {
      b.group.position.y = GROUND + Math.max(0, Math.sin(b.t * 3)) * 0.05;
      if (Math.hypot(body.pos.x - b.group.position.x, body.pos.z - b.group.position.z) < 2.5) {
        b.group.position.y = GROUND + 1.5; b.t = 0;
      }
    }
    b.animate({ talking: false }, dt);
  }
  for (const n of npcs) {
    n.model.animate({ talking: n.talking, speed: 0, grounded: true }, dt);
    n.marker.position.y = 2.3 + Math.sin(time * 3 + n.x) * 0.08;
  }
  animateFriends(dt);
  for (const it of collectibles) it.sprite.position.y = GROUND + 0.9 + Math.sin(time * 3 + it.phase) * 0.2;
}

// ---------------- Başlat ----------------
async function boot() {
  try { await store.init(); } catch (err) { console.error('Kayıt açılamadı', err); }
  try { await loadBaseContent(); } catch (err) { console.warn('İçerik yüklenemedi', err); }
  content = normalizeContent(store.content());
  setupFirstRun();
  setupGear();
  renderProfiles();
  $('oyna').onclick = startGame;
  $('ev-dugme').onclick = backToTitle;
  $('yardim-dugme').addEventListener('pointerdown', e => { e.preventDefault(); yardimSoyle(); });
  $('yildiz-sayac').addEventListener('pointerdown', e => { e.preventDefault(); yildizSoyle(true); });
  addEventListener('pointerdown', () => { unlockAll(); if (!inGame) sfx.music('baslik'); }, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeak(); });
  // Arka planda dönen dünya: başlık ekranının arkasında
  camera.position.set(20, 25, 40); camera.lookAt(20, 0, -20);
  $('yukleniyor').classList.add('bitti');
  setTimeout(() => $('yukleniyor')?.remove(), 700);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  requestAnimationFrame(frame);
}
boot();

// Hata ayıklama için
window.__oyun = { get W() { return W; }, get body() { return body; }, store, get npcs() { return npcs; }, awardStar, renderer, scene, get fx() { return fx; },
  // Pencere arka plandayken test için oyunu elle ilerlet (saniye)
  step(sec = 1) { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30, false); renderer.render(scene, camera); },
};
