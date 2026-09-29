import * as THREE from "../vendor/three.module.js";

// Загадки Сумеречного леса: световые зеркала, плита созвездия, грибы-колокольчики.
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

export class Puzzles {
  constructor(scene, world, audio, glowTex, player, input) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.player = player; this.input = input;
    this.onSolved = null; // (name) => void
    this.solved = { mirrors: false, stars: false, bells: false };

    this._buildMirrors();
    this._buildStarSlab();
    this._buildBells();
  }

  /* ════════ Загадка 1: зеркала ════════ */
  _buildMirrors() {
    const g = new THREE.Group();
    // источник: кристалл на постаменте
    const src = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, .6, 6), mat(0x55506b));
    ped.position.y = .3;
    const crys = new THREE.Mesh(new THREE.OctahedronGeometry(.3),
      mat(0x9bd4ff, { emissive: 0x6fb8ef, emissiveIntensity: 1.6 }));
    crys.position.y = .95;
    src.add(ped, crys);
    src.position.set(-6, 0, -44);
    this.srcPos = src.position.clone().add(new THREE.Vector3(0, .95, 0));

    // два зеркала (поворотные призмы)
    const mkMirror = (x, z, name) => {
      const m = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, .5, 6), mat(0x4a3a5a));
      base.position.y = .25;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, .12),
        mat(0xc9dff2, { metalness: .6, roughness: .25, emissive: 0x3a5a78, emissiveIntensity: .25 }));
      plate.position.y = 1.35;
      m.add(base, plate);
      m.position.set(x, 0, z);
      this.world.colliders.push({ x, z, r: .32 });
      return { group: m, plate, name, angle: 0, x, z };
    };
    this.m1 = mkMirror(-1.5, -46, "m1");
    this.m2 = mkMirror(4.5, -50, "m2");

    // сегменты луча
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9bd4ff, transparent: true, opacity: .75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mkBeam = () => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1, 6), beamMat);
      b.visible = false;
      return b;
    };
    this.beamA = mkBeam(); // источник → зеркало 1 (всегда виден)
    this.beamB = mkBeam(); // зеркало 1 → зеркало 2
    this.beamC = mkBeam(); // зеркало 2 → обелиск

    g.add(src, this.m1.group, this.m2.group, this.beamA, this.beamB, this.beamC);
    this.scene.add(g);
    this._refreshBeams();
  }

  _aimBeam(beam, from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    beam.scale.set(1, len, 1);
    beam.position.copy(from).addScaledVector(dir, .5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    beam.visible = true;
  }

  _refreshBeams() {
    const m1p = this.m1.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const m2p = this.m2.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const obelisk = this.world.obeliskHeart.getWorldPosition(new THREE.Vector3());
    this._aimBeam(this.beamA, this.srcPos, m1p);
    // зеркало 1 повёрнуто (angle=1) → луч уходит к зеркалу 2
    if (this.m1.angle === 1) this._aimBeam(this.beamB, m1p, m2p);
    else this.beamB.visible = false;
    // оба повёрнуты → луч в обелиск
    if (this.m1.angle === 1 && this.m2.angle === 1) this._aimBeam(this.beamC, m2p, obelisk);
    else this.beamC.visible = false;
  }

  _rotateMirror(m) {
    if (this.solved.mirrors) return;
    m.angle = 1 - m.angle;
    m.group.rotation.y += Math.PI / 3;
    this.audio.blip();
    this.world.burst(m.group.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 0x9bd4ff, 6);
    this._refreshBeams();
    if (this.m1.angle === 1 && this.m2.angle === 1) {
      this.solved.mirrors = true;
      this.world.obeliskHeart.material.emissiveIntensity = .6;
      this.onSolved && this.onSolved("mirrors");
    }
  }

  restore() {
    if (this.solved.mirrors) {
      this.m1.angle = 1; this.m2.angle = 1;
      this.m1.group.rotation.y += Math.PI / 3;
      this.m2.group.rotation.y += Math.PI / 3;
      this._refreshBeams();
    }
  }

  near() {
    // ближайший интерактивный объект загадок: {kind, ref, x, z}
    const p = this.player.position;
    let best = null, bestD = 2.2;
    if (!this.solved.mirrors) {
      for (const m of [this.m1, this.m2]) {
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d < bestD) { bestD = d; best = { kind: "mirror", ref: m, x: m.x, z: m.z }; }
      }
    }
    if (!this.solved.stars) {
      const d = Math.hypot(p.x - this.slabPos.x, p.z - this.slabPos.z);
      if (d < bestD) { bestD = d; best = { kind: "slab", x: this.slabPos.x, z: this.slabPos.z }; }
    }
    if (!this.solved.bells) {
      for (const b of this.bells) {
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < bestD) { bestD = d; best = { kind: "bell", ref: b, x: b.x, z: b.z }; }
      }
    }
    return best;
  }

  interact(nearObj) {
    if (nearObj.kind === "mirror") this._rotateMirror(nearObj.ref);
    else if (nearObj.kind === "slab") this._openSlab();
    else if (nearObj.kind === "bell") this._ringBell(nearObj.ref);
  }

  /* ════════ Загадка 2: плита созвездия ════════ */
  _buildStarSlab() {
    // каменная плита со звёздным узором
    const slab = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, .4, 8), mat(0x55506b));
    base.position.y = .2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .1, 8),
      mat(0x3a3455, { emissive: 0x4a3f7a, emissiveIntensity: .5 }));
    top.position.y = .45;
    slab.add(base, top);
    this.slabPos = new THREE.Vector3(-8, 0, -54);
    slab.position.copy(this.slabPos);
    this.scene.add(slab);
    this.world.colliders.push({ x: this.slabPos.x, z: this.slabPos.z, r: 1.2 });
  }

  _openSlab() {
    if (this._slabOpen) return;
    this._slabOpen = true;
    this.input.setLocked(true);
    // DOM-головоломка: 8 звёзд лисы, соединить в порядке
    const stars = [
      { u: .22, v: .28, label: "ухо" }, { u: .72, v: .30, label: "ухо" },
      { u: .30, v: .50, label: "голова" }, { u: .14, v: .62, label: "нос" },
      { u: .55, v: .48, label: "спина" }, { u: .70, v: .58, label: "спина" },
      { u: .84, v: .44, label: "хвост" }, { u: .88, v: .66, label: "хвост" },
    ];
    // правильный порядок обхода (снизу вверх: нос→голова→ухо→...)
    const order = [3, 2, 0, 1, 2, 4, 5, 7, 6]; // нос→голова→лев.ухо→прав.ухо→голова→спина1→спина2→хвост2→хвост1
    const seq = [];

    const ov = document.createElement("div");
    ov.id = "slabOverlay";
    ov.style.cssText = `position:absolute;inset:0;z-index:40;background:rgba(10,5,25,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;`;
    ov.innerHTML = `
      <div style="color:#f5c86b;font-weight:800;font-size:18px;letter-spacing:.05em">Созвездие Лисы</div>
      <div style="color:#b7aed6;font-size:14px;text-align:center;max-width:420px">Коснись звёзд в порядке, каким видит их Искра.<br>Следующая звезда — тихо мерцает ✨</div>
      <div id="slabBoard" style="position:relative;width:min(420px,86vw);height:min(300px,50vh);border:2px solid rgba(201,184,255,.3);border-radius:18px;background:radial-gradient(circle at 50% 40%, #241548, #120a2e);overflow:hidden"></div>
      <div id="slabHint" style="color:#7d74a5;font-size:13px;min-height:18px"></div>`;
    document.body.appendChild(ov);
    const board = ov.querySelector("#slabBoard");

    const els = stars.map((s, i) => {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:${s.u * 100}%;top:${(1 - s.v) * 100}%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;display:grid;place-items:center;font-size:20px;color:#fff;cursor:pointer;transition:transform .15s`;
      el.textContent = "✦";
      board.appendChild(el);
      el.addEventListener("pointerdown", () => {
        const expected = order[seq.length];
        if (i === expected) {
          seq.push(i);
          el.style.color = "#f5c86b";
          el.style.transform = "scale(1.35)";
          el.style.textShadow = "0 0 12px #f5c86b";
          this.audio.blip();
          // линия
          if (seq.length > 1) {
            const a = stars[seq[seq.length - 2]], b = stars[i];
            const line = document.createElement("div");
            const x1 = a.u * 100, y1 = (1 - a.v) * 100, x2 = b.u * 100, y2 = (1 - b.v) * 100;
            const len = Math.hypot(x2 - x1, y2 - y1);
            const ang = Math.atan2(y2 - y1, x2 - x1);
            line.style.cssText = `position:absolute;left:${x1}%;top:${y1}%;width:${len}%;height:2px;background:linear-gradient(90deg,#d9c07a,#f5e3a0);transform-origin:0 0;transform:rotate(${ang}rad);opacity:.8`;
            board.appendChild(line);
          }
          if (seq.length >= order.length) {
            setTimeout(() => this._solveSlab(ov), 500);
          }
        } else {
          ov.querySelector("#slabHint").textContent = "Мерцание сбилось… начни снова 💫";
          this.audio.hurt();
          setTimeout(() => { seq.length = 0; board.querySelectorAll("div").forEach((d, idx) => { if (idx > 0 && d.style.color) { d.style.color = "#fff"; d.style.transform = ""; d.style.textShadow = ""; } }); }, 300);
        }
      });
      return el;
    });
    // мерцание подсказки: следующая звезда пульсирует
    this._slabTicker = setInterval(() => {
      if (seq.length >= order.length) return;
      const next = order[seq.length];
      els.forEach((el, i) => el.classList.toggle("hint", i === next));
      const hinted = els[next];
      hinted.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 700, iterations: 2 });
    }, 1400);
    els[order[0]].animate([{ opacity: .55 }, { opacity: 1 }], { duration: 700, iterations: 2 });
  }

  _solveSlab(ov) {
    clearInterval(this._slabTicker);
    ov.remove();
    this._slabOpen = false;
    this.input.setLocked(false);
    this.solved.stars = true;
    this.world.burst(this.slabPos.clone().add(new THREE.Vector3(0, 1, 0)), 0xf5c86b, 14);
    this.audio.questDone();
    this.onSolved && this.onSolved("stars");
  }

  /* ════════ Загадка 3: грибы-колокольчики ════════ */
  _buildBells() {
    // три гриба-колокольчика: красный, золотой, синий; порядок подсказан камнем
    const colors = [
      { hex: 0xe05a5a, name: "красный", note: 523.3 },
      { hex: 0xf5c86b, name: "золотой", note: 659.3 },
      { hex: 0x5a8ae0, name: "синий", note: 784 },
    ];
    const positions = [[9, -57], [11.5, -55], [9.5, -52.5]];
    this.bells = colors.map((c, i) => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, .7, 6), mat(0xd8cbb0));
      stem.position.y = .35;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.38, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(c.hex, { emissive: c.hex, emissiveIntensity: .8 }));
      cap.position.y = .68;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 5), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.2 }));
      dot.position.y = .9;
      g.add(stem, cap, dot);
      const [x, z] = positions[i];
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.world.colliders.push({ x, z, r: .3 });
      return { group: g, cap, dot, x, z, color: c, idx: i, hit: false };
    });
    // камень-подсказка: три полоски в правильном порядке
    const hintStone = new THREE.Group();
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, .4), mat(0x55506b));
    st.position.y = .75;
    hintStone.add(st);
    const order = [1, 0, 2]; // золотой → красный → синий
    order.forEach((ci, i) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .1),
        mat(colors[ci].hex, { emissive: colors[ci].hex, emissiveIntensity: .9 }));
      bar.position.set(-.3 + i * .3, .55 + i * .25, .24);
      hintStone.add(bar);
    });
    hintStone.position.set(7, 0, -56.5);
    hintStone.rotation.y = 2.4;
    this.scene.add(hintStone);
    this.world.colliders.push({ x: 7, z: -56.5, r: .7 });
    this._bellSeq = [];
  }

  _ringBell(b) {
    if (this.solved.bells) return;
    // нота
    const t0 = this.audio.ctx ? this.audio.ctx.currentTime : 0;
    if (this.audio.ctx) this.audio._note(b.color.note, t0, 1.6, { gain: .1, att: .006, bus: this.audio.sfxBus });
    b.dot.material.emissiveIntensity = 3;
    setTimeout(() => b.dot.material.emissiveIntensity = 1.2, 400);
    this.world.burst(new THREE.Vector3(b.x, 1, b.z), b.color.hex, 5);
    const order = [1, 0, 2];
    this._bellSeq.push(b.idx);
    const ok = this._bellSeq.every((v, i) => v === order[i]);
    if (!ok) {
      this._bellSeq = [];
      toastMsg("Колокольчики смолкли… посмотри на камень 🪨");
      return;
    }
    if (this._bellSeq.length >= order.length) {
      this.solved.bells = true;
      this.audio.questDone();
      toastMsg("Грибы поют! Святилище пробуждается ✨", 3200);
      this.onSolved && this.onSolved("bells");
    }
  }

  update(elapsed) {
    // лёгкое покачивание грибов
    if (this.bells) {
      for (const b of this.bells) {
        b.cap.rotation.z = Math.sin(elapsed * 1.4 + b.idx * 2) * .06;
      }
    }
  }
}

// маленький локальный тост (не тянуть зависимость от story.js)
let tT = null;
function toastMsg(msg, ms = 2400) {
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(tT);
    tT = setTimeout(() => el.classList.remove("show"), ms);
  }
}
