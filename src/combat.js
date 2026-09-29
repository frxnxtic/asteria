import * as THREE from "../vendor/three.module.js";
import { buildMist } from "./entities.js";

// Боевая система M2: звёздные снаряды, Блик-телепорт, HP героини, волны Мглы.
const ATTACK_CD = .42;
const BLINK_CD = 2.2;
const BLINK_DIST = 4.6;
const BLINK_IFRAMES = .45;
const MAX_HP = 5;

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

export class Combat {
  constructor(scene, world, audio, glowTexture) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.glowTex = glowTexture;

    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.attackCd = 0;
    this.blinkCd = 0;
    this.iframes = 0;
    this.hurtCooldown = 0;
    this.dead = false;

    this.projectiles = [];
    this.projPool = [];
    for (let i = 0; i < 16; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, color: 0xffe9a0, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      spr.visible = false;
      scene.add(spr);
      this.projPool.push(spr);
    }

    this.enemies = [];
    this.waveActive = false;
    this.waveQueue = [];
    // кольца-волны босса
    this.rings = [];
    this.onBossDefeated = null;
    this.onBossIntro = null;
    this.spawnPoints = [
      new THREE.Vector3(0, 0, -18), new THREE.Vector3(16, 0, -6),
      new THREE.Vector3(-16, 0, -6), new THREE.Vector3(8, 0, 14), new THREE.Vector3(-8, 0, 14),
    ];
    this.onHpChange = null;
    this.onWaveCleared = null;
    this.onEnemyKilled = null;
    this.hurtFx = document.getElementById("hurtFx");
  }

  /* ── UI ── */
  refreshHp() {
    const bar = document.getElementById("hpBar");
    bar.innerHTML = "";
    for (let i = 0; i < this.maxHp; i++) {
      const s = document.createElement("span");
      s.className = "hp" + (i < this.hp ? "" : " off");
      s.textContent = "✦";
      bar.appendChild(s);
    }
    this.onHpChange && this.onHpChange(this.hp);
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.refreshHp();
  }

  /* ── атака ── */
  tryAttack(fromPos, aimDir) {
    if (this.attackCd > 0 || this.dead) return false;
    this.attackCd = ATTACK_CD;
    const spr = this.projPool.find(p => !p.visible);
    if (!spr) return true;
    spr.visible = true;
    spr.scale.setScalar(.6);
    spr.material.opacity = 1;
    spr.position.copy(fromPos).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(aimDir, .6);
    this.projectiles.push({
      spr, dir: aimDir.clone().normalize(), speed: 15, life: 1.15,
    });
    this.audio.shoot();
    return true;
  }

  /* ── Блик ── */
  tryBlink(player) {
    if (this.blinkCd > 0 || this.dead) return false;
    this.blinkCd = BLINK_CD;
    this.iframes = BLINK_IFRAMES;
    const from = player.obj.position.clone();
    const dir = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const to = from.clone().addScaledVector(dir, BLINK_DIST);
    // мир и коллайдеры
    const R = 95, d = Math.hypot(to.x, to.z);
    if (d > R) to.multiplyScalar(R / d);
    for (const c of this.world.colliders) {
      const dx = to.x - c.x, dz = to.z - c.z;
      const dist = Math.hypot(dx, dz), min = c.r + .35;
      if (dist < min && dist > .001) {
        to.x = c.x + dx / dist * min;
        to.z = c.z + dz / dist * min;
      }
    }
    // ручей: Блик не пускает в воду вне моста
    if (to.z < -27.2 && to.z > -34.4 && Math.abs(to.x) > 1.5) to.copy(from).addScaledVector(dir, 2);
    player.obj.position.copy(to);
    // след из искр (цвет — под плащ героини)
    const trail = player.cloakTrail ?? 0xc9b8ff;
    for (let i = 0; i <= 5; i++) {
      const p = from.clone().lerp(to, i / 5);
      this.world.burst(p, trail, 1);
    }
    this.audio.blink();
    return true;
  }

  /* ── враги ── */
  spawnEnemy(pos, kind = "crawler") {
    const cfg = {
      crawler: { r: .38, hp: 3, speed: 2.3 },
      elite: { r: .55, hp: 7, speed: 1.7 },
      boss: { r: 1.1, hp: 40, speed: 1.85 },
      tish: { r: 1.3, hp: 60, speed: 2.0 },
    }[kind];
    const { group, body, eyeL, eyeR } = buildMist(cfg.r, kind !== "crawler");
    if (kind === "boss" || kind === "tish") {
      // корона шипов (Тишь — выше и холоднее)
      const crownC = kind === "tish" ? 0x1a2440 : 0x2e2050;
      const crownE = kind === "tish" ? 0x5a8ae0 : 0x9b5bee;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(.14, .8, 4),
          mat(crownC, { emissive: crownE, emissiveIntensity: 1.2 })
        );
        spike.position.set(Math.cos(a) * cfg.r * .75, cfg.r * 1.5, Math.sin(a) * cfg.r * .75);
        spike.rotation.z = Math.cos(a) * .4;
        group.add(spike);
      }
      const third = new THREE.Mesh(new THREE.SphereGeometry(.12, 6, 5),
        mat(0xffd27f, { emissive: 0xff9a3f, emissiveIntensity: 2 }));
      third.position.set(0, cfg.r * 1.05, cfg.r * .8);
      group.add(third);
    }
    group.position.copy(pos);
    this.scene.add(group);
    this.enemies.push({
      obj: group, body, eyes: [eyeL, eyeR],
      r: cfg.r, hp: cfg.hp, maxHp: cfg.hp,
      speed: cfg.speed + (kind === "crawler" ? Math.random() * .5 : 0),
      elite: kind === "elite", boss: kind === "boss" || kind === "tish", tish: kind === "tish",
      seed: Math.random() * 10, hitFlash: 0, touchCd: 0,
      // босс: фазы и атаки
      phase: 1, dashT: 0, dashDir: null, minionT: 5, ringT: 3,
    });
  }

  // союзный залп (Дэн в финальном бою)
  allyShot(from, targetEnemy) {
    if (!targetEnemy) return;
    const spr = this.projPool.find(p => !p.visible);
    if (!spr) return;
    spr.visible = true;
    spr.scale.setScalar(.5);
    spr.material.opacity = 1;
    spr.material.color.setHex(0xffd9a0);
    spr.position.copy(from);
    const dir = new THREE.Vector3().subVectors(
      targetEnemy.obj.position.clone().add(new THREE.Vector3(0, targetEnemy.r, 0)), from
    ).normalize();
    this.projectiles.push({ spr, dir, speed: 18, life: 1.4, ally: true });
  }

  startWave(spawns) {
    // spawns: [{delay, pos, elite}]
    this.waveQueue = spawns.map(s => ({ ...s, t: s.delay }));
    this.waveActive = true;
  }

  startBoss(pos) {
    this.spawnEnemy(pos, "boss");
    this.onBossIntro && this.onBossIntro();
  }

  startTish(pos) {
    this.spawnEnemy(pos, "tish");
    this.onBossIntro && this.onBossIntro();
  }

  aliveInWave() { return this.enemies.length + this.waveQueue.length; }

  damageEnemy(e, n) {
    e.hp -= n;
    e.hitFlash = .18;
    this.audio.hitEnemy();
    if (e.hp <= 0) {
      this.world.burst(e.obj.position.clone().add(new THREE.Vector3(0, .5 + e.r, 0)), 0x9b5bee, e.boss ? 26 : 12);
      // трофеи
      const drop = e.boss ? 10 : e.elite ? 4 : 1 + (Math.random() < .5 ? 1 : 0);
      this.world.firefliesCollected += drop;
      this.world.onCollect && this.world.onCollect(this.world.firefliesCollected);
      this.scene.remove(e.obj);
      this.enemies.splice(this.enemies.indexOf(e), 1);
      this.audio.enemyDie();
      if (e.boss) {
        // свита исчезает вместе с хозяином
        for (const other of [...this.enemies]) {
          if (other === e) continue;
          this.world.burst(other.obj.position.clone().add(new THREE.Vector3(0, .5, 0)), 0x9b5bee, 8);
          this.scene.remove(other.obj);
          this.enemies.splice(this.enemies.indexOf(other), 1);
        }
        // очистить кольца
        for (const ring of this.rings) this.scene.remove(ring.mesh);
        this.rings.length = 0;
        this.onBossDefeated && this.onBossDefeated(e);
      } else {
        this.onEnemyKilled && this.onEnemyKilled(e);
      }
    }
  }

  hurtPlayer(n, fromPos) {
    if (this.iframes > 0 || this.dead) return;
    this.hp -= n;
    this.iframes = .9;
    this.hurtCooldown = .15;
    this.refreshHp();
    this.audio.hurt();
    this.hurtFx.classList.add("on");
    setTimeout(() => this.hurtFx.classList.remove("on"), 220);
    if (this.hp <= 0) {
      this.dead = true;
      this.onDeath && this.onDeath();
    }
    return true;
  }

  respawn(pos) {
    this.hp = this.maxHp;
    this.dead = false;
    this.iframes = 1.5;
    this.refreshHp();
  }

  /* ── апдейт ── */
  update(dt, elapsed, playerPos, input, player) {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.blinkCd = Math.max(0, this.blinkCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    input.setCooldown("attackBtn", 1 - this.attackCd / ATTACK_CD);
    input.setCooldown("blinkBtn", 1 - this.blinkCd / BLINK_CD);

    // снаряды
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.spr.position.addScaledVector(pr.dir, pr.speed * dt);
      let hit = false;
      for (const e of this.enemies) {
        const dx = pr.spr.position.x - e.obj.position.x;
        const dz = pr.spr.position.z - e.obj.position.z;
        const dy = pr.spr.position.y - (e.obj.position.y + e.r);
        if (dx * dx + dz * dz + dy * dy < (e.r + .45) ** 2) {
          this.damageEnemy(e, 1);
          hit = true;
          break;
        }
      }
      if (hit || pr.life <= 0) {
        if (hit) this.world.burst(pr.spr.position.clone(), 0xffe9a0, 3);
        pr.spr.visible = false;
        this.projectiles.splice(i, 1);
      }
    }

    // спавн из очереди волны
    if (this.waveActive) {
      for (let i = this.waveQueue.length - 1; i >= 0; i--) {
        const s = this.waveQueue[i];
        s.t -= dt;
        if (s.t <= 0) {
          this.spawnEnemy(s.pos, !!s.elite);
          this.world.burst(s.pos.clone().add(new THREE.Vector3(0, .6, 0)), 0x9b5bee, 8);
          this.waveQueue.splice(i, 1);
        }
      }
      if (!this.waveQueue.length && !this.enemies.length) {
        this.waveActive = false;
        this.onWaveCleared && this.onWaveCleared();
      }
    }

    // враги: ИИ, анимация, контактный урон
    for (const e of this.enemies) {
      const dir = new THREE.Vector3().subVectors(playerPos, e.obj.position);
      dir.y = 0;
      const dist = dir.length();
      dir.normalize();

      if (e.boss) {
        this._updateBoss(e, dt, elapsed, playerPos, dir, dist);
      } else {
        e.obj.position.addScaledVector(dir, e.speed * dt);
        e.obj.rotation.y = Math.atan2(dir.x, dir.z);
      }
      // не заходят в дома/деревья
      for (const c of this.world.colliders) {
        const dx = e.obj.position.x - c.x, dz = e.obj.position.z - c.z;
        const dd = Math.hypot(dx, dz), min = c.r + e.r * .6;
        if (dd < min && dd > .001) {
          e.obj.position.x = c.x + dx / dd * min;
          e.obj.position.z = c.z + dz / dd * min;
        }
      }
      // дыхание мглы
      const br = 1 + Math.sin(elapsed * 3 + e.seed) * .08;
      e.body.scale.set(br, .72 * (2 - br), br);
      e.eyes.forEach(ey => ey.material.emissiveIntensity = 1.6 + Math.sin(elapsed * 7 + e.seed) * .7);
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.body.material.color.setHex(0x6b4a8a);
      } else {
        e.body.material.color.setHex(0x1b1430);
      }
      // касание — урон героине
      e.touchCd = Math.max(0, e.touchCd - dt);
      const touchRange = e.r + .55;
      if (dist < touchRange && e.touchCd <= 0 && !this.dead) {
        e.touchCd = e.boss ? 1.4 : 1.1;
        this.hurtPlayer(e.boss ? 2 : 1, e.obj.position);
        // мягкий отброс героини
        const away = new THREE.Vector3().subVectors(playerPos, e.obj.position).setY(0).normalize();
        player.obj.position.addScaledVector(away, e.boss ? 1.6 : .8);
      }
    }

    // кольца-волны: расширяются, бьют по радиусу
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += 4.6 * dt;
      ring.mesh.scale.setScalar(ring.r);
      ring.mesh.material.opacity = Math.max(0, .85 - ring.r / 16);
      const dPlayer = Math.hypot(playerPos.x - ring.x, playerPos.z - ring.z);
      if (!ring.hitDone && Math.abs(dPlayer - ring.r) < .6) {
        ring.hitDone = true;
        this.hurtPlayer(1, null);
      }
      if (ring.r > 16) {
        this.scene.remove(ring.mesh);
        this.rings.splice(i, 1);
      }
    }
  }

  /* ── босс: Пожиратель Света / Тишь ── */
  _updateBoss(e, dt, elapsed, playerPos, dir, dist) {
    const hpFrac = e.hp / e.maxHp;
    e.phase = hpFrac > .65 ? 1 : hpFrac > .3 ? 2 : 3;
    // контактный урон и погоня обрабатываются в общем цикле; здесь спец-атаки
    if (e.dashT > 0) {
      // фаза рывка
      e.dashT -= dt;
      e.obj.position.addScaledVector(e.dashDir, 13 * dt);
      if (e.dashT <= 0) e.dashDir = null;
      return;
    }
    // обычное движение (медленнее при телеграфе)
    const slow = e.chargeT > 0 ? 0 : 1;
    e.obj.position.addScaledVector(dir, e.speed * slow * dt);
    e.obj.rotation.y = Math.atan2(dir.x, dir.z);
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      if (e.chargeT <= 0) { e.dashT = .55; e.dashDir = dir.clone(); }
      return;
    }
    if (e.phase >= 2) {
      // рывок каждые ~4.5с
      e.dashCd = (e.dashCd ?? 4) - dt;
      if (e.dashCd <= 0 && dist > 3) {
        e.dashCd = e.tish ? 3.6 : 4.5;
        e.chargeT = .7; // телеграф: замирает и сжимается
        this.world.burst(e.obj.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0x6b4a8a, 6);
      }
      // миньоны (Тишь призывает элиту)
      e.minionT -= dt;
      if (e.minionT <= 0) {
        e.minionT = e.tish ? 9 : 8;
        const minions = this.enemies.filter(x => !x.boss).length;
        if (minions < (e.tish ? 2 : 2)) {
          const a = Math.random() * Math.PI * 2;
          const p = e.obj.position.clone().add(new THREE.Vector3(Math.cos(a) * 2, 0, Math.sin(a) * 2));
          this.spawnEnemy(p, e.tish ? "elite" : "crawler");
          this.world.burst(p.clone().add(new THREE.Vector3(0, .6, 0)), 0x9b5bee, 8);
        }
      }
    }
    if (e.phase >= 3) {
      // кольца-волны (Тишь — двойные)
      e.ringT -= dt;
      if (e.ringT <= 0) {
        e.ringT = e.tish ? 3.4 : 4.2;
        const spawnRing = () => {
          const mesh = new THREE.Mesh(
            new THREE.TorusGeometry(1, .07, 6, 48),
            new THREE.MeshBasicMaterial({
              color: e.tish ? 0x5a8ae0 : 0xb98bff, transparent: true, opacity: .85,
              blending: THREE.AdditiveBlending, depthWrite: false,
            })
          );
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(e.obj.position.x, .3, e.obj.position.z);
          this.scene.add(mesh);
          this.rings.push({ mesh, r: 1, x: e.obj.position.x, z: e.obj.position.z, hitDone: false });
        };
        spawnRing();
        if (e.tish) setTimeout(spawnRing, 450);
        this.audio.blink();
      }
    }
  }
}
