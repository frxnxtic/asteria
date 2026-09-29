// Погода: дождь с зарницами, звук, дождевые грибы и танец светлячков.
import * as THREE from "../vendor/three.module.js";

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

export class Weather {
  constructor(scene, world, audio, player, save, persist, glowTex) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.player = player; this.save = save; this.persist = persist;

    // цикл погоды
    this.rainF = 0;          // 0..1 интенсивность
    this.rainTarget = 0;
    this.nextChangeAt = 60 + Math.random() * 90; // по elapsed
    this.rainEndsAt = 0;
    this.nextFlashAt = 0;

    // капли: LineSegments в боксе вокруг игрока
    const N = 520;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - .5) * 34, z = (Math.random() - .5) * 34;
      const y = Math.random() * 15;
      this.drops.push({ x, y, z, sp: 15 + Math.random() * 7 });
      pos.set([x, y, z, x + .05, y + .55, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xa8c8e8, transparent: true, opacity: 0,
    });
    this.rainMesh = new THREE.LineSegments(geo, this.rainMat);
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);

    // вспышка зарницы
    this.flashEl = document.createElement("div");
    this.flashEl.style.cssText =
      "position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .12s;" +
      "background:radial-gradient(120% 100% at 50% 0%, rgba(200,215,255,.75), rgba(200,215,255,0) 70%)";
    document.body.appendChild(this.flashEl);

    // звук дождя
    this._rainNoise = null;

    // дождевые грибы
    this.mushrooms = [];
    this._shroomSpot = () => {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 40;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    };

    // танец светлячков
    this.swarm = null;
    this.nextSwarmAt = 100 + Math.random() * 100;
  }

  _ensureRainSound() {
    if (this._rainNoise || !this.audio.ctx) return;
    const ctx = this.audio.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // розовый-ish шум
      const w = Math.random() * 2 - 1;
      last = (last + .03 * w) / 1.03;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.audio.master);
    src.start();
    this._rainNoise = g;
  }

  update(dt, elapsed, playerPos, story) {
    // переключение погоды
    if (this.rainTarget === 0 && elapsed > this.nextChangeAt) {
      this.rainTarget = 1;
      this.rainEndsAt = elapsed + 50 + Math.random() * 45;
      toastW("Капли по крышам Гавани… дождь 🌧");
      this._ensureRainSound();
    }
    if (this.rainTarget === 1 && elapsed > this.rainEndsAt) {
      this.rainTarget = 0;
      this.nextChangeAt = elapsed + 110 + Math.random() * 130;
      toastW("Дождь стихает. Небо снова звенит ✨");
    }
    this.rainF += (this.rainTarget - this.rainF) * Math.min(1, dt * .5);
    if (this._rainNoise) this._rainNoise.gain.value = this.rainF * .12;

    // капли
    this.rainMat.opacity = this.rainF * .5;
    if (this.rainF > 0.02) {
      this.rainMesh.position.set(playerPos.x, 0, playerPos.z);
      const pa = this.rainMesh.geometry.attributes.position;
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        d.y -= d.sp * dt;
        if (d.y < 0) d.y = 14 + Math.random() * 2;
        const o = i * 6;
        pa.array[o + 1] = d.y;
        pa.array[o + 4] = d.y + .55;
      }
      pa.needsUpdate = true;
    }

    // зарницы
    if (this.rainF > .6 && elapsed > this.nextFlashAt) {
      this.nextFlashAt = elapsed + 6 + Math.random() * 9;
      this.flashEl.style.opacity = String(.35 + Math.random() * .4);
      setTimeout(() => { this.flashEl.style.opacity = "0"; }, 110);
      setTimeout(() => { this.flashEl.style.opacity = String(.2 + Math.random() * .25); }, 190);
      setTimeout(() => { this.flashEl.style.opacity = "0"; }, 300);
    }

    // туман плотнее в дождь (мягко, поверх мира)
    if (this.world._baseFog === undefined) this.world._baseFog = null;
    // светлячки ярче в дождь
    this.world.fireflies && (this.world.firefliesBonus = this.rainF);

    // дождевые грибы: спавн в дождь, до 3 одновременно
    if (this.rainF > .5 && this.mushrooms.length < 3 && Math.random() < dt * .12) {
      this._spawnShroom(elapsed);
    }
    for (let i = this.mushrooms.length - 1; i >= 0; i--) {
      const m = this.mushrooms[i];
      m.cap.rotation.z = Math.sin(elapsed * 2 + m.seed) * .1;
      m.cap.material.emissiveIntensity = 1.4 + Math.sin(elapsed * 3.4 + m.seed) * .6;
      if (playerPos) {
        const d = Math.hypot(playerPos.x - m.x, playerPos.z - m.z);
        if (d < 1.3) {
          // собран: +1 зелье (лимит 3)
          const st = story;
          if (st && st.potions < 3) {
            st.potions++;
            st.save.potions = st.potions;
            st.refreshPotion();
            st.persist();
            this.world.burst(new THREE.Vector3(m.x, .6, m.z), 0x9bd4ff, 8);
            this.audio.herb();
            toastW("Дождевой гриб: зелье росы в сумке! 🧪");
          } else {
            toastW("Зелья полны — гриб останется лесу 🍄");
          }
          this.scene.remove(m.group);
          this.mushrooms.splice(i, 1);
        }
      }
    }

    // танец светлячков: рой на 20 секунд
    if (!this.swarm && elapsed > this.nextSwarmAt) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 25;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const N = 40;
      const pos = new Float32Array(N * 3);
      const pts = [];
      for (let i = 0; i < N; i++) {
        const p = { x: x + (Math.random() - .5) * 5, y: .8 + Math.random() * 2.2, z: z + (Math.random() - .5) * 5, s: Math.random() * 9 };
        pts.push(p);
        pos.set([p.x, p.y, p.z], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({
        color: 0xffe9a0, size: .8, map: this.world.glowTex, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Points(g, pm);
      this.scene.add(mesh);
      this.swarm = { mesh, pts, until: elapsed + 22, x, z, base: pos.slice() };
      toastW("Танец светлячков начинается… ✨");
      this.audio.lantern();
    }
    if (this.swarm) {
      const s = this.swarm;
      const pa = s.mesh.geometry.attributes.position;
      for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        const t = elapsed + p.s;
        pa.setXYZ(i,
          p.x + Math.sin(t * 1.3) * 1.6,
          p.y + Math.sin(t * 2.1) * .5,
          p.z + Math.cos(t * 1.1) * 1.6
        );
      }
      pa.needsUpdate = true;
      // сбор: близко к центру роя — светлячки пачкой
      if (playerPos) {
        const d = Math.hypot(playerPos.x - s.x, playerPos.z - s.z);
        if (d < 3.2) {
          const got = 6;
          this.world.firefliesCollected += got;
          this.world.onCollect && this.world.onCollect(this.world.firefliesCollected);
          this.world.burst(new THREE.Vector3(s.x, 1.5, s.z), 0xffe9a0, 16);
          this.audio.collect();
          toastW(`Танец светлячков: +${got} ✨`);
          this.scene.remove(s.mesh);
          this.swarm = null;
          this.nextSwarmAt = elapsed + 160 + Math.random() * 120;
        }
      }
      if (this.swarm && elapsed > s.until) {
        this.scene.remove(s.mesh);
        this.swarm = null;
        this.nextSwarmAt = elapsed + 160 + Math.random() * 120;
      }
    }
  }

  _spawnShroom(elapsed) {
    const { x, z } = this._shroomSpot();
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, .5, 6), mat(0xd8e8f2));
    stem.position.y = .25;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0x7ab8e8, { emissive: 0x4a9ae0, emissiveIntensity: 1.5 }));
    cap.position.y = .5;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0x9bd4ff, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.3);
    halo.position.y = .6;
    g.add(stem, cap, halo);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.mushrooms.push({ group: g, cap, x, z, seed: Math.random() * 9 });
  }
}

let tT = null;
function toastW(msg, ms = 3000) {
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(tT);
    tT = setTimeout(() => el.classList.remove("show"), ms);
  }
}
