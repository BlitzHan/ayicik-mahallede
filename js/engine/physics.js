// Basit kinematik karakter kontrolcüsü.
// Çarpıştırıcılar: kutu {type:'box', min:{x,y,z}, max:{x,y,z}} ya da dik silindir {type:'cyl', x, z, r, y0, y1}.
// İsteğe bağlı: move(dt) ile hareket eden platformlar (vel alanı), bounce (zıplatan mantar), solid=false (yalnız zemin).

const STEP = 0.45;        // bu kadar yükseklik basamak sayılır, duvar değil

// Değerler SBA 13.0.8 metadata'sından okunan sabitlere göre (rea analizi, 05-rea-analiz.md):
// hız 9, zıplama kuvveti 10.355, yerçekimi 25, coyote 0.15, tampon 0.15. Hız 4-5 yaş için düşürüldü.
export const TUNING = {
  speed: 7.2,             // m/s (SBA: 9)
  accel: 30, decel: 26, airAccel: 14,
  gravity: -25,           // SBA: 25
  jumpV: 10.36,           // SBA: 10.355 → ~2.14 m
  doubleJumpV: 9.6,
  coyote: 0.15,           // kenardan düştükten sonra zıplama hoşgörüsü
  buffer: 0.15,           // yere değmeden önce basılan zıplama
  fallMax: -22,
  radius: 0.42, height: 1.3,
};

export function createBody(x, y, z) {
  return {
    pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 },
    grounded: false, groundCollider: null, coyote: 0, buffer: 0, jumps: 0,
    landed: false, jumped: false, bounced: false, facing: 0,
  };
}

function overlapsXZ(c, x, z, r) {
  if (c.type === 'cyl') {
    const dx = x - c.x, dz = z - c.z;
    return dx * dx + dz * dz < (c.r + r) * (c.r + r);
  }
  return x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z;
}
// Ayak noktası zemin üstünde mi (yarıçapın yarısı kadar hoşgörü — kenarda durabilsin)
function supportsXZ(c, x, z, r) {
  const rr = r * 0.6;
  if (c.type === 'cyl') {
    const dx = x - c.x, dz = z - c.z;
    return dx * dx + dz * dz < (c.r + rr) * (c.r + rr);
  }
  return x + rr > c.min.x && x - rr < c.max.x && z + rr > c.min.z && z - rr < c.max.z;
}
const top = c => c.type === 'cyl' ? c.y1 : c.max.y;
const bottom = c => c.type === 'cyl' ? c.y0 : c.min.y;

// Yatay itme: çarpıştırıcının içinden en kısa yoldan dışarı.
function pushOut(c, p, r) {
  if (c.type === 'cyl') {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 0.0001;
    const need = c.r + r;
    if (d < need) { p.x = c.x + dx / d * need; p.z = c.z + dz / d * need; return true; }
    return false;
  }
  // kutuya en yakın nokta
  const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
  const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
  let dx = p.x - cx, dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d > 0.0001) {
    if (d < r) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; return true; }
    return false;
  }
  // merkez kutunun içinde: en kısa eksenden çık
  const ex = [p.x - c.min.x + r, c.max.x - p.x + r, p.z - c.min.z + r, c.max.z - p.z + r];
  const i = ex.indexOf(Math.min(...ex));
  if (i === 0) p.x = c.min.x - r; else if (i === 1) p.x = c.max.x + r;
  else if (i === 2) p.z = c.min.z - r; else p.z = c.max.z + r;
  return true;
}

export function groundHeightAt(colliders, x, z, maxY, r = 0.2) {
  let best = -Infinity, bestC = null;
  for (const c of colliders) {
    const t = top(c);
    if (t <= maxY && t > best && supportsXZ(c, x, z, r)) { best = t; bestC = c; }
  }
  return { y: best, collider: bestC };
}

export function stepBody(b, input, camYaw, colliders, dt) {
  const T = TUNING;
  b.landed = b.jumped = b.bounced = false;

  // Hareket eden zemin bizi taşır.
  if (b.grounded && b.groundCollider?.delta) {
    b.pos.x += b.groundCollider.delta.x;
    b.pos.y += b.groundCollider.delta.y;
    b.pos.z += b.groundCollider.delta.z;
  }

  // Kamera yönüne göre hedef hız.
  const mx = input.move.x, my = input.move.y;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  // ileri = kameradan uzağa (-z kamerada)
  const wx = mx * cos - my * sin;
  const wz = -mx * sin - my * cos;
  const mag = Math.min(1, Math.hypot(mx, my));
  const tx = wx * T.speed, tz = wz * T.speed;
  const a = b.grounded ? (mag > 0.01 ? T.accel : T.decel) : T.airAccel;
  const ax = tx - b.vel.x, az = tz - b.vel.z;
  const al = Math.hypot(ax, az), maxA = a * dt;
  if (al > maxA) { b.vel.x += ax / al * maxA; b.vel.z += az / al * maxA; }
  else { b.vel.x = tx; b.vel.z = tz; }
  if (mag > 0.05) b.facing = Math.atan2(wx, wz);

  // Zıplama (hoşgörülü: coyote + buffer + çift zıplama).
  if (input.jumpPressed) b.buffer = T.buffer;
  b.buffer -= dt;
  b.coyote = b.grounded ? T.coyote : b.coyote - dt;
  if (b.buffer > 0) {
    if (b.coyote > 0) {
      b.vel.y = T.jumpV; b.jumps = 1; b.coyote = 0; b.buffer = 0; b.grounded = false; b.jumped = true;
    } else if (b.jumps < 2) {
      b.vel.y = T.doubleJumpV; b.jumps = 2; b.buffer = 0; b.jumped = true;
    }
  }
  // Kısa basış = alçak zıplama
  if (!input.jumpHeld && b.vel.y > 4 && !b.bouncing) b.vel.y -= 40 * dt;

  b.vel.y = Math.max(T.fallMax, b.vel.y + T.gravity * dt);

  const r = T.radius;
  const feet0 = b.pos.y;

  // Yatay hareket + itme
  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.solid === false) continue;
      const t = top(c), bt = bottom(c);
      if (t - b.pos.y <= STEP && b.vel.y <= 0.5) continue;      // üstüne çıkabilir
      if (t <= b.pos.y + 0.02) continue;                        // altımızda
      if (bt >= b.pos.y + T.height) continue;                   // üstümüzde
      if (overlapsXZ(c, b.pos.x, b.pos.z, r)) pushOut(c, b.pos, r);
    }
  }

  // Dikey
  const wasGrounded = b.grounded;
  b.pos.y += b.vel.y * dt;
  b.grounded = false; b.groundCollider = null;
  if (b.vel.y <= 0) {
    const g = groundHeightAt(colliders, b.pos.x, b.pos.z, Math.max(feet0, b.pos.y) + STEP, r);
    if (g.collider && b.pos.y <= g.y + 0.02) {
      if (g.collider.bounce) {
        b.pos.y = g.y; b.vel.y = g.collider.bounce; b.jumps = 1; b.bounced = true; b.bouncing = true;
      } else {
        // yere yapış (yokuş aşağı inişte zıplamasın)
        b.pos.y = g.y; b.vel.y = 0; b.grounded = true; b.groundCollider = g.collider; b.jumps = 0; b.bouncing = false;
        if (!wasGrounded) b.landed = true;
      }
    } else if (wasGrounded && g.collider && b.pos.y - g.y < 0.25) {
      b.pos.y = g.y; b.vel.y = 0; b.grounded = true; b.groundCollider = g.collider;
    }
  } else {
    // tavan
    for (const c of colliders) {
      if (c.solid === false) continue;
      const bt = bottom(c);
      if (bt > feet0 + T.height - 0.05 && bt < b.pos.y + T.height && overlapsXZ(c, b.pos.x, b.pos.z, r * 0.7)) {
        b.pos.y = bt - T.height; b.vel.y = 0; break;
      }
    }
  }
  return b;
}

// Hareketli platformlar: c.path(t) -> {x,y,z} merkez; boyutlar sabit.
export function updateMovers(colliders, time) {
  for (const c of colliders) {
    if (!c.path) continue;
    const p = c.path(time);
    const prev = c.center || p;
    c.delta = { x: p.x - prev.x, y: p.y - prev.y, z: p.z - prev.z };
    c.center = p;
    if (c.type === 'box') {
      c.min.x = p.x - c.half.x; c.max.x = p.x + c.half.x;
      c.min.y = p.y - c.half.y; c.max.y = p.y + c.half.y;
      c.min.z = p.z - c.half.z; c.max.z = p.z + c.half.z;
    } else { c.x = p.x; c.z = p.z; const h = (c.y1 - c.y0) / 2; c.y0 = p.y - h; c.y1 = p.y + h; }
    if (c.mesh) c.mesh.position.set(p.x, p.y, p.z);
  }
}

// Kamera için ışın-kutu kesişimi (kameranın duvara girmemesi)
export function rayHit(colliders, ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  for (const c of colliders) {
    if (c.camera === false) continue;
    let mn, mx;
    if (c.type === 'box') { mn = c.min; mx = c.max; }
    else { mn = { x: c.x - c.r * 0.8, y: c.y0, z: c.z - c.r * 0.8 }; mx = { x: c.x + c.r * 0.8, y: c.y1, z: c.z + c.r * 0.8 }; }
    let tmin = 0, tmax = best;
    let ok = true;
    for (const ax of ['x', 'y', 'z']) {
      const o = ax === 'x' ? ox : ax === 'y' ? oy : oz;
      const d = ax === 'x' ? dx : ax === 'y' ? dy : dz;
      if (Math.abs(d) < 1e-6) { if (o < mn[ax] || o > mx[ax]) { ok = false; break; } continue; }
      let t1 = (mn[ax] - o) / d, t2 = (mx[ax] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && tmin > 0.01 && tmin < best) best = tmin;
  }
  return best;
}
