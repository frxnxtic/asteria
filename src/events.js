import * as THREE from "../vendor/three.module.js";

// Глобальные события M3: сундуки-секреты с блёстками, алтарь улучшений,
// событие «Падающая звезда».
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

export class Events {
  constructor(scene, world, audio, glowTex, save, persist, player) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.save = save; this.persist = persist; this.player = player;
    this.sparkles = save.sparkles ?? 0;
    this.maxHpBonus = save.maxHpBonus ?? 0;

    this._buildChests();
    this._buildAltar();
    this._starState = null; // активная падающая звезда
    this._nextStarAt = 150 + Math.random() * 90; // через 2.5–4 минуты игры
    this.onSparkles = null;
  }

  /* ── сундуки ── */
  _buildChests() {
    const spots = [
      { x: -18, z: -50, hint: "под корнями великана" },
      { x: 20, z: -56, hint: "за тыквенным холмом" },
      { x: -24, z: -70, hint: "в тени двух сестёр-елей" },
      { x: 26, z: -74, hint: "у самой кромки леса" },
      { x: -12, z: -34, hint: "у кристальной гривы" },
    ];
    this.chests = spots.map((s, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .55),
        mat(0x6b4a2f, { roughness: 1 }));
      body.position.y = .25;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(.82, .22, .57),
        mat(0x7a5236, { emissive: 0xffd27f, emissiveIntensity: .35 }));
      lid.position.y = .58;
      const lock = new THREE.Mesh(new THREE.OctahedronGeometry(.09),
        mat(0xffe9a0, { emissive: 0xffd27f, emissiveIntensity: 1.5 }));
      lock.position.set(0, .5, .3);
      g.add(body, lid, lock);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(g);
      this.world.colliders.push({ x: s.x, z: s.z, r: .5 });
      const opened = (this.save.chests ?? []).includes(i);
      if (opened) { lid.rotation.x = -1.9; lid.position.z = -.35; }
      return { ...s, i, group: g, lid, lock, opened };
    });
  }

  openChest(c) {
    if (c.opened) return false;
    c.opened = true;
    c.lid.rotation.x = -1.9;
    c.lid.position.z = -.35;
    const got = 2 + (Math.random() < .5 ? 1 : 0);
    this.addSparkles(got);
    this.world.burst(c.group.position.clone().add(new THREE.Vector3(0, .8, 0)), 0xf5c86b, 14);
    this.audio.questDone();
    this.save.chests = this.chests.filter(x => x.opened).map(x => x.i);
    this.persist();
    toast(`Сундук тайника: +${got} блёстки 💎`);
    return true;
  }

  /* ── блёстки ── */
  addSparkles(n) {
    this.sparkles += n;
    this.save.sparkles = this.sparkles;
    this.onSparkles && this.onSparkles(this.sparkles);
    this.persist();
  }

  /* ── алтарь созвездия (святилище): 💎→+1 макс HP ── */
  _buildAltar() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .65, .35, 6), mat(0x55506b));
    base.position.y = .17;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(.28),
      mat(0xc9b8ff, { emissive: 0x8b6bff, emissiveIntensity: 1.2 }));
    orb.position.y = .75;
    g.add(base, orb);
    g.position.set(this.world.sanctuary.x + 4.5, 0, this.world.sanctuary.z + 4.5);
    this.scene.add(g);
    this.world.colliders.push({ x: g.position.x, z: g.position.z, r: .45 });
    this.altar = { group: g, orb, x: g.position.x, z: g.position.z };
  }

  useAltar() {
    if (this.maxHpBonus >= 2) { toast("Алтарь отдал всё: звёзды уже в тебе ✨"); return; }
    if (this.sparkles < 6) { toast(`Нужно 6 блёсток 💎 (есть ${this.sparkles})`); return; }
    this.sparkles -= 6;
    this.save.sparkles = this.sparkles;
    this.maxHpBonus++;
    this.save.maxHpBonus = this.maxHpBonus;
    this.onSparkles && this.onSparkles(this.sparkles);
    this.world.burst(this.altar.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xc9b8ff, 16);
    this.audio.questDone();
    this.persist();
    this.onAltarUp && this.onAltarUp(this.maxHpBonus);
    toast("Сердце героини ярче: +1 макс HP ✦", 3200);
  }

  /* ── падающая звезда ── */
  update(dt, elapsed, playerPos) {
    this._lastElapsed = elapsed;
    this.altar.orb.rotation.y += dt;
    this.altar.orb.material.emissiveIntensity = 1 + Math.sin(elapsed * 2.2) * .4;

    if (!this._starState && elapsed > this._nextStarAt) {
      this._spawnStar(elapsed);
    }
    const st = this._starState;
    if (st) {
      st.ttl -= dt;
      st.beam.material.opacity = .5 + Math.sin(elapsed * 5) * .2;
      st.beam.scale.x = st.beam.scale.z = 1 + Math.sin(elapsed * 3) * .12;
      if (playerPos) {
        const d = Math.hypot(playerPos.x - st.x, playerPos.z - st.z);
        if (d < 2.6) {
          // собрана!
          this.addSparkles(2 + (Math.random() < .5 ? 2 : 0));
          this.world.burst(new THREE.Vector3(st.x, 1.5, st.z), 0xffe9a0, 18);
          this.audio.questDone();
          toast("Желание загадано: падающая звезда твоя ✨", 3200);
          this._removeStar();
        }
      }
      if (st && st.ttl <= 0) {
        this._removeStar();
        toast("Звезда погасла… другая обязательно упадёт 💫");
      }
    }
  }

  _spawnStar(elapsed) {
    const a = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * .8 - 12;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.5, 1.1, 26, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: .6,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.set(x, 13, z);
    this.scene.add(beam);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20),
      new THREE.MeshBasicMaterial({
        color: 0xf5c86b, transparent: true, opacity: .5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(x, .05, z);
    this.scene.add(halo);
    this._starState = { x, z, beam, halo, ttl: 75 };
    this.audio.lantern();
    toast("🌟 Падающая звезда! Успей к сиянию за 75 секунд");
  }

  _removeStar() {
    const st = this._starState;
    if (!st) return;
    this.scene.remove(st.beam, st.halo);
    this._starState = null;
    this._nextStarAt = (this._lastElapsed || 0) + 180 + Math.random() * 120;
  }
}

let tT = null;
function toast(msg, ms = 2800) {
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(tT);
    tT = setTimeout(() => el.classList.remove("show"), ms);
  }
}
