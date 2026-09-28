// Ввод: виртуальный джойстик (левая половина), свайп камеры (правая половина),
// кнопки действий, клавиатура/мышь для десктопа.
const JOY_RADIUS = 52;

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.move = { x: 0, y: 0 };      // вектор джойстика, y вперёд
    this.mag = 0;                     // 0..1
    this.camDelta = { x: 0, y: 0 };  // дельта вращения камеры за кадр
    this.jumpQueued = false;
    this.interactQueued = false;
    this.attackQueued = false;
    this.blinkQueued = false;
    this.potionQueued = false;
    this.dialogTap = false;
    this.keys = {};
    this._joyId = null; this._joyOrigin = { x: 0, y: 0 };
    this._camId = null; this._camLast = { x: 0, y: 0 };
    this._joyBase = document.getElementById("joyBase");
    this._joyKnob = document.getElementById("joyKnob");

    this._btn("jumpBtn", () => { this.jumpQueued = true; });
    this._btn("interactBtn", () => { this.interactQueued = true; });
    this._btn("attackBtn", () => { this.attackQueued = true; });
    this._btn("blinkBtn", () => { this.blinkQueued = true; });
    this._btn("potionBtn", () => { this.potionQueued = true; });
    this._bind();
  }

  // затемнение кнопки на время кулдауна (fraction 0..1, где 1 = готово)
  setCooldown(id, fraction) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("cooldown", fraction < 1);
  }

  _btn(id, cb) {
    const el = document.getElementById(id);
    const down = e => { e.preventDefault(); el.classList.add("pressed"); cb(); };
    const up = e => { e.preventDefault(); el.classList.remove("pressed"); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
  }

  _bind() {
    const d = this.dom;
    d.addEventListener("touchstart", e => this._touchStart(e), { passive: false });
    d.addEventListener("touchmove", e => this._touchMove(e), { passive: false });
    d.addEventListener("touchend", e => this._touchEnd(e), { passive: false });
    d.addEventListener("touchcancel", e => this._touchEnd(e), { passive: false });

    window.addEventListener("keydown", e => {
      this.keys[e.code] = true;
      if (e.code === "Space") { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === "KeyE") this.interactQueued = true;
      if (e.code === "KeyJ" || e.code === "KeyF") this.attackQueued = true;
      if (e.code === "KeyB" || e.code === "ShiftLeft") this.blinkQueued = true;
      if (e.code === "KeyQ") this.potionQueued = true;
    });
    window.addEventListener("keyup", e => { this.keys[e.code] = false; });

    // мышь как «камера» на десктопе
    d.addEventListener("mousedown", e => {
      this._camId = "mouse"; this._camLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mousemove", e => {
      if (this._camId !== "mouse") return;
      this.camDelta.x += e.clientX - this._camLast.x;
      this.camDelta.y += e.clientY - this._camLast.y;
      this._camLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", () => { this._camId = null; });
  }

  _touchStart(e) {
    for (const t of e.changedTouches) {
      const left = t.clientX < window.innerWidth * 0.45;
      const onUI = t.target.closest && t.target.closest(".act-btn, #soundBtn");
      if (onUI) continue;
      e.preventDefault();
      if (left && this._joyId === null) {
        this._joyId = t.identifier;
        this._joyOrigin = { x: t.clientX, y: t.clientY };
        const b = this._joyBase;
        b.style.display = "block";
        b.style.left = (t.clientX - 64) + "px";
        b.style.top = (t.clientY - 64) + "px";
      } else if (this._camId === null) {
        this._camId = t.identifier;
        this._camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _touchMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyId) {
        e.preventDefault();
        let dx = t.clientX - this._joyOrigin.x;
        let dy = t.clientY - this._joyOrigin.y;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, JOY_RADIUS);
        const nx = dx / len, ny = dy / len;
        this.move.x = nx * (clamped / JOY_RADIUS);
        this.move.y = ny * (clamped / JOY_RADIUS);
        this.mag = clamped / JOY_RADIUS;
        this._joyKnob.style.transform =
          `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;
      } else if (t.identifier === this._camId) {
        e.preventDefault();
        this.camDelta.x += t.clientX - this._camLast.x;
        this.camDelta.y += t.clientY - this._camLast.y;
        this._camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyId) {
        this._joyId = null; this.move.x = 0; this.move.y = 0; this.mag = 0;
        this._joyBase.style.display = "none";
        this._joyKnob.style.transform = "translate(-50%,-50%)";
      }
      if (t.identifier === this._camId) this._camId = null;
    }
  }

  // вызывается каждый кадр перед использованием; собирает клавиатуру в move
  update() {
    if (this._locked) { this.move.x = 0; this.move.y = 0; this.mag = 0; return; }
    let kx = 0, ky = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) ky -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) ky += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) kx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) kx += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      this.move.x = kx / l; this.move.y = ky / l; this.mag = 1;
    } else if (this._joyId === null) {
      this.move.x = 0; this.move.y = 0; this.mag = 0;
    }
  }

  consumeJump() { const v = this.jumpQueued; this.jumpQueued = false; return v; }
  consumeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; }
  consumeAttack() { const v = this.attackQueued; this.attackQueued = false; return v; }
  consumeBlink() { const v = this.blinkQueued; this.blinkQueued = false; return v; }
  consumePotion() { const v = this.potionQueued; this.potionQueued = false; return v; }
  // движение блокируется во время диалога
  setLocked(lock) {
    this._locked = lock;
    if (lock) { this.move.x = 0; this.move.y = 0; this.mag = 0; }
  }
  get locked() { return !!this._locked; }
  takeCamDelta() {
    const d = { x: this.camDelta.x, y: this.camDelta.y };
    this.camDelta.x = 0; this.camDelta.y = 0;
    return d;
  }
}
