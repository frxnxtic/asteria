import * as THREE from "../vendor/three.module.js";

// Юляся — стилизованный low-poly персонаж из примитивов + процедурная анимация.
const WALK_SPEED = 4.4;     // м/с при полном отклонении стика
const RUN_FACTOR = 1.0;     // скорость уже «беговая» (как в Genshin)
const GRAVITY = -18;
const JUMP_V = 7.2;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, metalness: 0, ...opts });
}

export function buildYulyasy() {
  const g = new THREE.Group();
  const refs = {};

  const skin = mat(0xffd9b8);
  const dressMat = mat(0x4a3f8a);
  const cloakMat = mat(0x241a4d, { roughness: 1 });
  const hairMat = mat(0x2a2140);
  const starMat = mat(0xffe9a0, { emissive: 0xffd27f, emissiveIntensity: 1.2 });
  const bootMat = mat(0x3a2a4a);

  // ноги
  refs.legL = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .34, 6), bootMat);
  refs.legR = refs.legL.clone();
  refs.legL.position.set(-.09, .17, 0);
  refs.legR.position.set(.09, .17, 0);

  // платье-конус
  refs.dress = new THREE.Mesh(new THREE.ConeGeometry(.30, .62, 8), dressMat);
  refs.dress.position.y = .62;
  const bodice = new THREE.Mesh(new THREE.CylinderGeometry(.14, .20, .30, 8), dressMat);
  bodice.position.y = 1.02;

  // голова
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(.155, 12, 10), skin);
  face.position.y = .04;
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * .62), hairMat);
  hairBack.position.set(0, .05, -.015);
  const braid = new THREE.Mesh(new THREE.CylinderGeometry(.035, .02, .5, 6), hairMat);
  braid.position.set(0, -.16, -.13);
  // чёлка-звёздочка
  const hairStar = new THREE.Mesh(new THREE.OctahedronGeometry(.028), starMat);
  hairStar.position.set(.09, .13, .06);
  head.add(face, hairBack, braid, hairStar);
  head.position.y = 1.36;

  // руки
  refs.armL = new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, .40, 6), skin);
  refs.armR = refs.armL.clone();
  refs.armL.position.set(-.21, 1.05, 0);
  refs.armR.position.set(.21, 1.05, 0);

  // плащ-небо
  const cloakShape = new THREE.CylinderGeometry(.16, .34, .78, 8, 1, true, Math.PI * .72, Math.PI * 1.56);
  refs.cloak = new THREE.Mesh(cloakShape, new THREE.MeshStandardMaterial({
    color: 0x241a4d, flatShading: true, roughness: 1, side: THREE.DoubleSide
  }));
  refs.cloak.position.y = .95;
  // блёстки на плаще
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(.014), starMat);
    const a = Math.PI * .8 + Math.random() * Math.PI * 1.2;
    const r = .18 + Math.random() * .13;
    s.position.set(Math.cos(a) * r, .7 + Math.random() * .45, Math.sin(a) * r);
    refs.cloak.add ? null : null;
    g.add(s);
  }

  // посох со звездой
  const staff = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.02, .026, .95, 6), mat(0x6b4a2f));
  rod.position.y = .18;
  const bigStar = new THREE.Mesh(new THREE.OctahedronGeometry(.075), starMat);
  bigStar.position.y = .70;
  staff.add(rod, bigStar);
  refs.staff = staff;
  refs.staffStar = bigStar;
  staff.position.set(.24, .0, .06);

  g.add(refs.legL, refs.legR, refs.dress, bodice, head, refs.armL, refs.armR, refs.cloak, staff);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, refs };
}

export class Player {
  constructor(scene) {
    const { group, refs } = buildYulyasy();
    this.obj = group; this.refs = refs;
    this.vel = new THREE.Vector3();
    this.yaw = 0;             // куда смотрит модель
    this.speed2d = 0;         // для анимации и звука шагов
    this.onGround = true;
    this.walkPhase = 0;
    scene.add(group);
  }

  update(dt, input, camYaw, colliders) {
    // движение относительно камеры
    let mx = input.move.x, my = input.move.y;
    let wishX = 0, wishZ = 0;
    if (input.mag > 0.06) {
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // джойстик: y<0 — вперёд от камеры
      wishX = (mx * cos + my * sin);
      wishZ = (-mx * sin + my * cos);
      const m = Math.min(input.mag * 1.15, 1);
      wishX *= m; wishZ *= m;
    }

    const targetSpeed = Math.hypot(wishX, wishZ) * WALK_SPEED * RUN_FACTOR;
    // сглаживание скорости
    const cur = new THREE.Vector2(this.vel.x, this.vel.z);
    const tgt = new THREE.Vector2(wishX * WALK_SPEED, wishZ * WALK_SPEED);
    cur.lerp(tgt, 1 - Math.exp(-10 * dt));
    this.vel.x = cur.x; this.vel.z = cur.y;
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);

    // прыжок
    if (input.consumeJump() && this.onGround) {
      this.vel.y = JUMP_V; this.onGround = false;
    }
    this.vel.y += GRAVITY * dt;
    this.obj.position.x += this.vel.x * dt;
    this.obj.position.z += this.vel.z * dt;
    this.obj.position.y += this.vel.y * dt;
    if (this.obj.position.y <= 0) { this.obj.position.y = 0; this.vel.y = 0; this.onGround = true; }

    // границы мира
    const R = 55, d = Math.hypot(this.obj.position.x, this.obj.position.z);
    if (d > R) { this.obj.position.x *= R / d; this.obj.position.z *= R / d; }

    // круглые коллайдеры
    for (const c of colliders) {
      const dx = this.obj.position.x - c.x, dz = this.obj.position.z - c.z;
      const dist = Math.hypot(dx, dz), min = c.r + 0.32;
      if (dist < min && dist > 0.0001) {
        this.obj.position.x = c.x + dx / dist * min;
        this.obj.position.z = c.z + dz / dist * min;
      }
    }

    // ручей: вода — полоса z ∈ (-34.4, -27.2); мост при |x| ≤ 1.5
    const p = this.obj.position;
    if (p.z < -27.2 && p.z > -34.4) {
      if (Math.abs(p.x) <= 1.5) {
        p.x = THREE.MathUtils.clamp(p.x, -1.2, 1.2); // перила моста
      } else {
        p.z = p.z > -30.8 ? -27.2 : -34.4; // выталкиваем на ближний берег
      }
    }

    // поворот модели к направлению движения
    if (this.speed2d > 0.3) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, 12 * dt);
    }
    this.obj.rotation.y = this.yaw;

    // ── процедурная анимация ──
    const r = this.refs;
    const run01 = Math.min(this.speed2d / WALK_SPEED, 1);
    this.walkPhase += dt * (4 + run01 * 8);
    const swing = Math.sin(this.walkPhase) * 0.55 * run01;

    r.legL.rotation.x = swing;
    r.legR.rotation.x = -swing;
    r.armL.rotation.x = -swing * 0.8;
    r.armR.rotation.x = swing * 0.8;
    r.legL.position.z = Math.sin(this.walkPhase) * 0.12 * run01;
    r.legR.position.z = -Math.sin(this.walkPhase) * 0.12 * run01;

    // дыхание/подпрыгивание
    const t = performance.now() / 1000;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.05 * run01;
    const idle = Math.sin(t * 2.2) * 0.012;
    this.obj.position.y += 0; // физика уже выставила y
    r.dress.rotation.x = run01 * 0.12;
    r.dress.position.y = .62 + bob * 0.5 + idle * 0.5;
    r.cloak.rotation.x = -0.06 - run01 * 0.35 + Math.sin(t * 3.1) * 0.03;

    // поза в прыжке
    if (!this.onGround) {
      r.legL.rotation.x = 0.5; r.legR.rotation.x = -0.3;
      r.armL.rotation.x = -1.9; r.armR.rotation.x = -1.7;
    }

    // посох в правой руке покачивается, звезда мерцает
    r.staff.rotation.z = -0.15 + swing * 0.25;
    r.staffStar.material.emissiveIntensity = 1.2 + Math.sin(t * 2.6) * 0.5;
    r.staffStar.rotation.y = t * 1.4;

    // тень-блоб
    if (this.blob) {
      this.blob.position.set(this.obj.position.x, 0.02, this.obj.position.z);
      const s = 1 - Math.min(this.obj.position.y / 6, 0.55);
      this.blob.scale.setScalar(s);
      this.blob.material.opacity = 0.30 * s;
    }
  }

  get position() { return this.obj.position; }
}
