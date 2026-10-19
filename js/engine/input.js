// Dokunmatik + klavye girişi.
// Sol yarı: yüzen joystick. Sağ taraf: zıpla düğmesi, bağlama göre "konuş" düğmesi.
// Sağ yarıda boş alanda sürükleme kamerayı döndürür, çift dokunuş kamerayı arkaya alır.

export function createInput() {
  const state = {
    move: { x: 0, y: 0 },        // -1..1, y ileri
    jumpPressed: false,          // bu karede basıldı
    jumpHeld: false,
    actionPressed: false,
    camDrag: 0,                  // bu karedeki yatay sürükleme (px)
    camDragY: 0,
    recenter: false,
  };

  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joystick-top');
  const area = document.getElementById('joystick-alan');
  const jumpBtn = document.getElementById('ziplama');
  const actBtn = document.getElementById('eylem');
  const RADIUS = 55;

  let joyId = null, joyCx = 0, joyCy = 0;
  const homeX = () => joy.offsetLeft, homeY = () => joy.offsetTop;

  function setKnob(dx, dy) { knob.style.transform = `translate(${dx}px, ${dy}px)`; }

  area.addEventListener('pointerdown', e => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    area.setPointerCapture(e.pointerId);
    joyCx = e.clientX; joyCy = e.clientY;
    joy.style.left = joyCx + 'px'; joy.style.top = joyCy + 'px';
    joy.classList.add('aktif');
    e.preventDefault();
  });
  area.addEventListener('pointermove', e => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    setKnob(dx, dy);
    // Küçük ölü bölge; çocuk parmağı titrer.
    const m = Math.min(1, d / RADIUS);
    const k = m < 0.15 ? 0 : (m - 0.15) / 0.85 / (m || 1);
    state.move.x = dx / RADIUS * k;
    state.move.y = -dy / RADIUS * k;
  });
  const joyEnd = e => {
    if (e.pointerId !== joyId) return;
    joyId = null; state.move.x = state.move.y = 0; setKnob(0, 0);
    joy.classList.remove('aktif');
    joy.style.left = ''; joy.style.top = '';
  };
  area.addEventListener('pointerup', joyEnd);
  area.addEventListener('pointercancel', joyEnd);

  function bindButton(btn, onDown, onUp) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); btn.classList.add('basili'); onDown(); });
    const up = e => { btn.classList.remove('basili'); onUp?.(); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
  bindButton(jumpBtn, () => { state.jumpPressed = true; state.jumpHeld = true; }, () => { state.jumpHeld = false; });
  bindButton(actBtn, () => { state.actionPressed = true; });

  // Kamera: kanvas üzerinde sağ taraf sürükleme.
  const canvas = document.getElementById('sahne');
  let camId = null, lastX = 0, lastY = 0, lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    if (camId !== null) return;
    camId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap < 300) state.recenter = true;
    lastTap = now;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== camId) return;
    state.camDrag += e.clientX - lastX; state.camDragY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });
  const camEnd = e => { if (e.pointerId === camId) camId = null; };
  canvas.addEventListener('pointerup', camEnd);
  canvas.addEventListener('pointercancel', camEnd);

  // Klavye (bilgisayarda deneme için).
  const keys = new Set();
  addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { state.jumpPressed = true; state.jumpHeld = true; e.preventDefault(); }
    if (e.code === 'KeyE' || e.code === 'Enter') state.actionPressed = true;
  });
  addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'Space') state.jumpHeld = false;
  });
  addEventListener('blur', () => { keys.clear(); state.jumpHeld = false; });

  function poll() {
    if (keys.size) {
      const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      if (joyId === null) {
        const l = Math.hypot(kx, ky) || 1;
        state.move.x = kx / l; state.move.y = ky / l;
      }
      if (keys.has('KeyQ')) state.camDrag -= 6;
      if (keys.has('KeyR')) state.camDrag += 6;
    } else if (joyId === null) {
      state.move.x = state.move.y = 0;
    }
    return state;
  }

  function endFrame() {
    state.jumpPressed = false; state.actionPressed = false;
    state.camDrag = 0; state.camDragY = 0; state.recenter = false;
  }

  function showAction(icon) {
    if (icon) { actBtn.textContent = icon; actBtn.hidden = false; }
    else actBtn.hidden = true;
  }

  function reset() {
    state.move.x = state.move.y = 0; state.jumpHeld = false;
    joyId = null; setKnob(0, 0); joy.classList.remove('aktif');
    keys.clear();
  }

  return { state, poll, endFrame, showAction, reset };
}
