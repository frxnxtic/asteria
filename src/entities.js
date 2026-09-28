import * as THREE from "../vendor/three.module.js";

// Сущности M2: Дэн (NPC), лисёнок Искра, Мгла (враги), лунные травы, костёр и котелок.
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, metalness: 0, ...opts });

/* ═══════════ Дэн — странник-хранитель ═══════════ */
export function buildDen() {
  const g = new THREE.Group();
  const coat = mat(0x3a5a4a), pants = mat(0x33283f), skin = mat(0xffd9b8);
  const hair = mat(0x5a4632), scarf = mat(0xc9744a);

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, .5, 6), pants);
  legs.position.y = .25;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .55, 8), coat);
  body.position.y = .77;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), skin);
  head.position.y = 1.2;
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * .6), hair);
  hairM.position.y = 1.21;
  const sc = new THREE.Mesh(new THREE.TorusGeometry(.13, .045, 6, 12), scarf);
  sc.rotation.x = Math.PI / 2;
  sc.position.y = .99;
  // фонарь в руке
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, .4, 6), coat);
  arm.position.set(.24, .9, .08);
  arm.rotation.z = -.5;
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: null, color: 0xffd9a0, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  lanternGlow.scale.setScalar(.9);
  lanternGlow.position.set(.34, 1.06, .12);
  const lampBox = new THREE.Mesh(new THREE.OctahedronGeometry(.07),
    mat(0xffe9a0, { emissive: 0xffd27f, emissiveIntensity: 1.6 }));
  lampBox.position.copy(lanternGlow.position);

  g.add(legs, body, head, hairM, sc, arm, lampBox, lanternGlow);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, glow: lanternGlow, lamp: lampBox };
}

/* ═══════════ Искра — звёздный лисёнок ═══════════ */
export function buildFox() {
  const g = new THREE.Group();
  const fur = mat(0x9aa2c8), furDark = mat(0x6b739e), white = mat(0xf2eeff);
  const starMat = mat(0xffe9a0, { emissive: 0xffd27f, emissiveIntensity: 1.4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), fur);
  body.scale.set(1.35, .9, .95);
  body.position.y = .17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), fur);
  head.position.set(.2, .24, 0);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(.045, .1, 6), white);
  snout.rotation.z = -Math.PI / 2;
  snout.position.set(.3, .22, 0);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(.032, .09, 4), furDark);
  earL.position.set(.17, .34, .05);
  const earR = earL.clone(); earR.position.z = -.05;
  const tail = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(.055 - i * .012, 8, 6), i === 2 ? white : furDark);
    seg.position.set(-.2 - i * .07, .2 + Math.sin(i * .5) * .03, 0);
    tail.push(seg);
  }
  const legs = [];
  for (const [x, z] of [[.1, .07], [.1, -.07], [-.1, .07], [-.1, -.07]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.022, .026, .1, 5), furDark);
    leg.position.set(x, .05, z);
    legs.push(leg);
  }
  const starMark = new THREE.Mesh(new THREE.OctahedronGeometry(.02), starMat);
  starMark.position.set(.2, .31, .08);

  g.add(body, head, snout, earL, earR, starMark, ...tail, ...legs);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, tail, legs, head, starMark };
}

export class Fox {
  constructor(scene, glowTexture) {
    const { group, tail, legs, head, starMark } = buildFox();
    this.obj = group; this.tail = tail; this.legs = legs; this.head = head; this.starMark = starMark;
    this.obj.visible = false;
    this.speed = 0;
    this.hopT = 0;
    scene.add(group);
  }
  show(pos) {
    this.obj.visible = true;
    this.obj.position.copy(pos).add(new THREE.Vector3(1, 0, 1));
  }
  update(dt, elapsed, target) {
    if (!this.obj.visible) return;
    const p = this.obj.position;
    const dir = new THREE.Vector3().subVectors(target, p);
    dir.y = 0;
    const dist = dir.length();
    const want = dist > 2.2 ? Math.min((dist - 2) * 1.5, 5.2) : 0;
    this.speed += (want - this.speed) * Math.min(1, 6 * dt);
    if (dist > 2 && this.speed > .1) {
      dir.normalize();
      p.addScaledVector(dir, this.speed * dt);
      this.obj.rotation.y = Math.atan2(dir.x, dir.z);
    }
    // бег: подпрыгивание и хвост
    this.hopT += dt * (3 + this.speed * 2.4);
    const hop = Math.abs(Math.sin(this.hopT)) * .07 * Math.min(this.speed / 4, 1);
    p.y = hop;
    this.tail.forEach((seg, i) => {
      seg.position.y = .2 + Math.sin(this.hopT * 1.4 + i) * .035 + i * .008;
    });
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.hopT + (i % 2) * Math.PI) * .7 * Math.min(this.speed / 4, 1);
    });
    this.starMark.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 3) * .5;
    this.head.rotation.z = Math.sin(elapsed * 1.2) * .06;
  }
}

/* ═══════════ Мгла — враги ═══════════ */
export function buildMist(r, elite) {
  const g = new THREE.Group();
  const dark = mat(0x1b1430, { roughness: 1 });
  const eye = mat(0xb98bff, { emissive: 0x9b5bee, emissiveIntensity: 2 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), dark);
  body.scale.y = .72;
  body.position.y = r * .62;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(r * .13, 6, 5), eye);
  eyeL.position.set(r * .28, r * .82, r * .5);
  const eyeR = eyeL.clone(); eyeR.position.x = -r * .28;
  // рваные «крылья» мглы
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Mesh(new THREE.ConeGeometry(r * .3, r * .9, 4), dark);
    wisp.position.set((i - 1) * r * .5, r * 1.1, -r * .3);
    wisp.rotation.z = (i - 1) * .5;
    g.add(wisp);
  }
  g.add(body, eyeL, eyeR);
  return { group: g, body, eyeL, eyeR };
}

/* ═══════════ Лунная трава ═══════════ */
export function buildHerb() {
  const g = new THREE.Group();
  const leaf = mat(0x3f5a6b);
  const bloom = mat(0xc9e8ff, { emissive: 0x9bd4ff, emissiveIntensity: 1.3 });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x9bd4ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(.85);
  glow.position.y = .45;
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.ConeGeometry(.04, .42, 4), leaf);
    st.position.set((Math.random() - .5) * .16, .21, (Math.random() - .5) * .16);
    st.rotation.z = (Math.random() - .5) * .5;
    g.add(st);
  }
  const flower = new THREE.Mesh(new THREE.OctahedronGeometry(.09), bloom);
  flower.position.y = .44;
  g.add(flower, glow);
  return { group: g, flower, glow };
}

/* ═══════════ Костёр Дэна с котелком ═══════════ */
export function buildCamp(scene, glowTexture, colliders) {
  const camp = new THREE.Group();
  const x = -8, z = 3;
  camp.position.set(x, 0, z);

  // камни очага
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(.14 + Math.random() * .06), mat(0x55506b));
    st.position.set(Math.cos(a) * .62, .08, Math.sin(a) * .62);
    st.rotation.set(Math.random(), Math.random(), 0);
    camp.add(st);
  }
  // дрова и огонь
  for (const r of [.4, -.5]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .7, 5), mat(0x5a4030));
    log.rotation.z = Math.PI / 2 + r * .2;
    log.position.y = .07;
    camp.add(log);
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffb054, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flame.scale.setScalar(1.5);
  flame.position.y = .5;
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(.16, .42, 5),
    mat(0xffd27f, { emissive: 0xff9a3f, emissiveIntensity: 2 }));
  flameCore.position.y = .3;
  camp.add(flame, flameCore);

  // котелок
  const cauldron = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * .55), mat(0x2e2840));
  cauldron.rotation.x = Math.PI;
  cauldron.position.set(1.1, .32, .3);
  cauldron.scale.y = .8;
  const broth = new THREE.Mesh(new THREE.CircleGeometry(.26, 12),
    mat(0x9bd4ff, { emissive: 0x6fb8ef, emissiveIntensity: .9 }));
  broth.rotation.x = -Math.PI / 2;
  broth.position.set(1.1, .36, .3);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, .1, 8), mat(0x2e2840));
  legs.position.set(1.1, .08, .3);
  camp.add(cauldron, broth, legs);

  // тюк с травами
  const bundle = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .5, 6), mat(0x8a6a3c));
  bundle.rotation.z = Math.PI / 2.4;
  bundle.position.set(-.9, .18, .7);
  camp.add(bundle);

  scene.add(camp);
  colliders.push({ x: x + 1.1, z: z + .3, r: .42 }); // котелок
  colliders.push({ x: x - .9, z: z + .7, r: .3 });   // тюк
  return { group: camp, x, z, flame, flameCore, broth };
}
