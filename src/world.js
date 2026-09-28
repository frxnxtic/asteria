import * as THREE from "../vendor/three.module.js";

// Ночная Гавань: небо-купол, звёзды, луна, площадь, дома, мост через ручей,
// фонари (интерактив), светлячки (коллекция), кристаллы, плавучие островки.
const DAY_LEN = 480; // полный цикл день/ночь, сек
const WORLD_R = 55;

/* ── процедурные текстуры ── */
function canvasTex(size, painter, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  painter(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function grassTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#3f5f4e"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const shades = ["#4a6f5a", "#365345", "#547a60", "#2f4a3e", "#5d8468"];
      g.fillStyle = shades[(Math.random() * shades.length) | 0];
      g.fillRect(x, y, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
    // цветочки-блёстки
    for (let i = 0; i < 60; i++) {
      g.fillStyle = Math.random() < .5 ? "#c9b8ff" : "#f5e3a0";
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 26);
}
function cobbleTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#4c4666"; g.fillRect(0, 0, s, s);
    const n = 8, cell = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shades = ["#5a5476", "#635c80", "#524c6e", "#6b6488"];
      g.fillStyle = shades[(Math.random() * shades.length) | 0];
      const x = i * cell + 2, y = j * cell + 2, w = cell - 4, h = cell - 4;
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, w, h, 5) : g.rect(x, y, w, h);
      g.fill();
    }
  }, 5);
}
function glowTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(255,235,180,1)");
  gr.addColorStop(.35, "rgba(255,215,140,.55)");
  gr.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── ключевые кадры суток ── */
const KF = [
  //  t      skyTop   skyBot   fog      sunColor sunI  hemi  nightF
  [0.00, "#46447e", "#e8946a", "#6a5578", "#ffb37a", 0.50, 0.50, 0.30],
  [0.10, "#7db4e8", "#ffe9c9", "#a8b8c8", "#fff2d9", 1.00, 0.80, 0.00],
  [0.30, "#6fa8e8", "#d8e8ec", "#b8c8d4", "#fff6e0", 1.05, 0.90, 0.00],
  [0.45, "#5a6ab8", "#ffc98a", "#8a7a98", "#ffd9a0", 0.80, 0.70, 0.20],
  [0.55, "#2e2258", "#b06a6e", "#4a3a62", "#ff9a6a", 0.45, 0.50, 0.60],
  [0.65, "#171040", "#3a2470", "#241a48", "#8a9ad8", 0.32, 0.36, 1.00],
  [0.80, "#0e0828", "#241452", "#1a1238", "#7a8ad0", 0.28, 0.30, 1.00],
  [0.92, "#1a1445", "#4a3a70", "#2e2450", "#9aa8d8", 0.30, 0.34, 0.85],
];
function sampleKF(t) {
  t = ((t % 1) + 1) % 1;
  let a = KF[KF.length - 1], b = KF[0], ta = 0, tb = 1;
  for (let i = 0; i < KF.length; i++) {
    if (KF[i][0] <= t) { a = KF[i]; ta = KF[i][0]; }
  }
  for (let i = KF.length - 1; i >= 0; i--) {
    if (KF[i][0] >= t || (t > KF[KF.length - 1][0] && i === KF.length - 1)) { b = KF[i]; tb = KF[i][0]; if (t >= KF[i][0]) break; }
  }
  if (tb <= ta) tb = ta + 1; // wrap
  const f = THREE.MathUtils.clamp((t - ta) / (tb - ta), 0, 1);
  const mix = (i) => THREE.MathUtils.lerp(a[i], b[i], f);
  return {
    skyTop: new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), f),
    skyBot: new THREE.Color(a[2]).lerp(new THREE.Color(b[2]), f),
    fog: new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), f),
    sunColor: new THREE.Color(a[4]).lerp(new THREE.Color(b[4]), f),
    sunI: mix(5), hemiI: mix(6), nightF: mix(7),
  };
}

export function createWorld(scene, renderer) {
  const colliders = [];
  const addCol = (x, z, r) => colliders.push({ x, z, r });
  const glow = glowTex();

  /* ── небо ── */
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x171040) },
    bottomColor: { value: new THREE.Color(0x3a2470) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 14),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vP;
        void main(){ float h = normalize(vP).y * .5 + .5; gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h,.0), .8)), 1.); }`,
    })
  );
  scene.add(sky);

  /* ── звёзды ── */
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(400);
    v.y = Math.abs(v.y) * .9 + 8;
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xfff6dd, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0,
    map: glow, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* ── солнце и луна ── */
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffe9b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunSprite.scale.setScalar(46);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf2ecff })
  );
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xc9b8ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  moonGlow.scale.setScalar(34);
  moon.add(moonGlow);
  scene.add(sunSprite, moon);

  /* ── свет ── */
  const hemi = new THREE.HemisphereLight(0xcdd6ff, 0x2e2440, 0.4);
  const sun = new THREE.DirectionalLight(0x8a9ad8, 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 160;
  scene.add(hemi, sun, sun.target);

  /* ── земля ── */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 48),
    new THREE.MeshStandardMaterial({ map: grassTex(), color: 0xb8c8b8, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(13.5, 40),
    new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 1 })
  );
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.015;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // дорожка к мосту
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 16),
    new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 1 })
  );
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.013, -20.5);
  path.receiveShadow = true;
  scene.add(path);

  /* ── ручей и мост ── */
  const stream = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 7),
    new THREE.MeshStandardMaterial({
      color: 0x3a6a9a, transparent: true, opacity: .85, roughness: .2,
      emissive: 0x244a78, emissiveIntensity: 0,
    })
  );
  stream.rotation.x = -Math.PI / 2; stream.position.set(0, -0.12, -31);
  scene.add(stream);
  // берега ручья обрабатываются логикой воды/моста в player.js (полоса z -34.4..-27.2)
  const bridge = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const f = i / 8;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(3, .14, .78),
      new THREE.MeshStandardMaterial({ color: 0x7a5236, flatShading: true, roughness: 1 })
    );
    plank.position.set(0, .05, -27.5 - i * .82);
    plank.castShadow = plank.receiveShadow = true;
    bridge.add(plank);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = i / 4;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(.05, .05, .7, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3c28, flatShading: true })
      );
      post.position.set(side * 1.45, .5, -27.6 - f * 6.8);
      bridge.add(post);
    }
  }
  scene.add(bridge);

  /* ── домики ── */
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a3a, emissive: 0xffd27f, emissiveIntensity: 1.2, roughness: .6,
  });
  function house(x, z, rot, w, h, d, roofC, wallC) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: wallC, flatShading: true, roughness: 1 })
    );
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * .78, h * .75, 4),
      new THREE.MeshStandardMaterial({ color: roofC, flatShading: true, roughness: 1 })
    );
    roof.position.y = h + h * .36;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(.4, .9, .4),
      new THREE.MeshStandardMaterial({ color: 0x6a5a70, flatShading: true })
    );
    chimney.position.set(w * .22, h + h * .5, d * .1);
    const win1 = new THREE.Mesh(new THREE.PlaneGeometry(.55, .65), windowMat);
    win1.position.set(-w * .22, h * .55, d / 2 + .02);
    const win2 = win1.clone(); win2.position.x = w * .22;
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(.7, 1.25),
      new THREE.MeshStandardMaterial({ color: 0x3a2a4a })
    );
    door.position.set(0, .63, d / 2 + .02);
    g.add(body, roof, chimney, win1, win2, door);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    addCol(x, z, Math.max(w, d) * .62);
    return g;
  }
  const houseCfg = [
    [-9, -14, 0.5, 4.2, 3.0, 3.6, 0xb5563f, 0xcbb094],
    [9.5, -13.5, -0.5, 3.6, 2.6, 3.2, 0x6b4a8a, 0xd8c2a4],
    [-14.5, -1, 1.2, 3.8, 2.8, 3.4, 0x8a4a5a, 0xcbb094],
    [14, 0.5, -1.2, 4.6, 3.2, 3.8, 0xb5563f, 0xe0cbb0],
    [-10.5, 12, 2.4, 4.0, 2.9, 3.5, 0x5a6a9a, 0xd8c2a4],
    [10, 12.5, -2.4, 3.4, 2.4, 3.0, 0x6b4a8a, 0xcbb094],
    [-4.5, 17, Math.PI, 3.2, 2.3, 2.8, 0xb5703f, 0xe0cbb0],
    [5, 17.5, Math.PI + .3, 3.8, 2.7, 3.2, 0x8a4a5a, 0xd8c2a4],
    [-20, -10, .9, 3.0, 2.2, 2.6, 0x6b4a8a, 0xcbb094],
    [20, -9, -.9, 3.2, 2.3, 2.8, 0xb5563f, 0xd8c2a4],
  ];
  houseCfg.forEach(c => house(...c));

  /* ── фонари (интерактив: 9 штук) ── */
  const lanterns = [];
  const lanternPos = [
    [5.5, -5.5], [-5.5, -6], [10.5, 5], [-10, 4.5], [0, -13.5],
    [2.2, -25], [-2.2, -25], [-16, 8], [16.5, 9],
  ];
  for (const [x, z] of lanternPos) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(.07, .09, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3428, flatShading: true })
    );
    post.position.y = 1.3; post.castShadow = true;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(.5, .07, .07),
      post.material
    );
    arm.position.set(.22, 2.55, 0);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x3a3050, emissive: 0xffd27f, emissiveIntensity: 0, roughness: .5,
    });
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(.17), lampMat);
    lamp.position.set(.45, 2.42, 0);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(.2, .16, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3428, flatShading: true })
    );
    cap.position.set(.45, 2.62, 0);
    const glowSpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glowSpr.scale.setScalar(2.4);
    glowSpr.position.copy(lamp.position);
    g.add(post, arm, lamp, cap, glowSpr);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z); // лампой к центру
    scene.add(g);
    addCol(x, z, .28);
    lanterns.push({ x, z, group: g, lamp, lampMat, glow: glowSpr, lit: false, seed: Math.random() * 10 });
  }

  /* ── деревья ── */
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e4a3c, flatShading: true, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, flatShading: true, roughness: 1 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd27f, emissiveIntensity: 1.4 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.35;
    const r = 24 + ((i * 7.3) % 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.8 + ((i * 13.7) % 10) / 12;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.14 * s, .2 * s, 1.4 * s, 6), trunkMat);
    trunk.position.y = .7 * s; trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05 * s, 0), crownMat);
    crown.position.y = 1.9 * s; crown.castShadow = true;
    crown.rotation.set(i, i * 2, 0);
    g.add(trunk, crown);
    if (i % 2 === 0) {
      for (let b = 0; b < 3; b++) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 5), bulbMat);
        const ba = b * 2.1 + i, br = .8 * s;
        bulb.position.set(Math.cos(ba) * br, 1.75 * s + ((b * 37) % 10) / 30, Math.sin(ba) * br);
        g.add(bulb);
      }
    }
    g.position.set(x, 0, z);
    scene.add(g);
    addCol(x, z, .5 * s);
  }

  /* ── кристаллы ── */
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x9b7bff, emissive: 0x7b5bee, emissiveIntensity: 1, flatShading: true, roughness: .3,
  });
  const crystals = [];
  const crystalPos = [[-4, -38], [-2, -40], [1, -39], [4, -37.5], [0, -42], [-8, -30], [9, -33], [-26, -18], [27, 16], [-30, 14]];
  for (const [x, z] of crystalPos) {
    const s = 0.7 + Math.random() * 1.6;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(s), crystalMat.clone());
    m.position.set(x, s * .8, z);
    m.rotation.set(Math.random() * .4, Math.random() * Math.PI, Math.random() * .4);
    m.scale.y = 1.6;
    scene.add(m);
    addCol(x, z, s * .5);
    crystals.push(m);
  }

  /* ── дальние горы ── */
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x241c48, flatShading: true, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + .2;
    const r = 95 + (i * 17.3) % 40;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(16 + (i * 7) % 14, 18 + (i * 11) % 26, 5), mountMat
    );
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.y = i;
    scene.add(m);
  }

  /* ── плавучие островки (декор «Пандоры») ── */
  const islands = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(3 + i, 5 + i * .8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2c60, flatShading: true, roughness: 1 })
    );
    rock.rotation.x = Math.PI;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(3 + i, 2.6 + i, .7, 6),
      new THREE.MeshStandardMaterial({ color: 0x40604e, flatShading: true, roughness: 1 })
    );
    top.position.y = 2.6;
    const tree = new THREE.Mesh(
      new THREE.ConeGeometry(.9, 2, 5),
      new THREE.MeshStandardMaterial({ color: 0x2e4a3c, flatShading: true })
    );
    tree.position.y = 4;
    const crys = new THREE.Mesh(new THREE.OctahedronGeometry(.35), crystalMat);
    crys.position.set(1.4, 3.4, 0);
    g.add(rock, top, tree, crys);
    const a = i * 1.7 + .6;
    g.position.set(Math.cos(a) * (30 + i * 9), 17 + i * 3.5, Math.sin(a) * (30 + i * 9) - 10);
    scene.add(g);
    islands.push({ g, seed: i * 2.3 });
  }

  /* ── светлячки (коллекция) ── */
  const FF_N = 22;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(FF_N * 3);
  const ffData = [];
  for (let i = 0; i < FF_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 26;
    const d = { cx: Math.cos(a) * r, cz: Math.sin(a) * r, y: .8 + Math.random() * 1.8, seed: Math.random() * 100, alive: true, respawnAt: 0 };
    ffData.push(d);
    ffPos.set([d.cx, d.y, d.cz], i * 3);
  }
  ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({
    color: 0xffe9a0, size: .55, map: glow, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  scene.add(fireflies);

  /* ── искры-частицы (эффекты) ── */
  const sparks = [];
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.visible = false;
    scene.add(s);
    sparks.push({ spr: s, vel: new THREE.Vector3(), life: 0 });
  }
  function burst(pos, color = 0xffd9a0, n = 8) {
    let used = 0;
    for (const sp of sparks) {
      if (sp.life > 0) continue;
      sp.spr.visible = true;
      sp.spr.material.color.setHex(color);
      sp.spr.position.copy(pos);
      sp.vel.set((Math.random() - .5) * 2.4, 1.6 + Math.random() * 2, (Math.random() - .5) * 2.4);
      sp.life = .9 + Math.random() * .5;
      sp.spr.material.opacity = 1;
      sp.spr.scale.setScalar(.35 + Math.random() * .25);
      if (++used >= n) break;
    }
  }

  /* ── состояние и апдейт ── */
  const world = {
    colliders, lanterns, dayT: 0.56, nightF: 1, firefliesCollected: 0,
    onCollect: null, onLantern: null,
    burst,
  };

  world.lightLantern = (i) => {
    const L = lanterns[i];
    if (!L || L.lit) return false;
    L.lit = true;
    L.lampMat.emissiveIntensity = 2.2;
    L.glow.material.opacity = .95;
    burst(L.lamp.getWorldPosition(new THREE.Vector3()), 0xffd9a0, 10);
    return true;
  };

  world.update = (dt, playerPos, elapsed) => {
    world.dayT = (world.dayT + dt / DAY_LEN) % 1;
    const k = sampleKF(world.dayT);
    world.nightF = k.nightF;

    // небо, туман, свет
    skyUniforms.topColor.value.copy(k.skyTop);
    skyUniforms.bottomColor.value.copy(k.skyBot);
    scene.fog = scene.fog || new THREE.FogExp2(0x241a48, 0.011);
    scene.fog.color.copy(k.fog);
    scene.fog.density = 0.009 + k.nightF * 0.004;
    hemi.intensity = k.hemiI;
    sun.intensity = Math.max(k.sunI, 0.26);
    sun.color.copy(k.sunColor);

    // солнце/луна по куполу
    const ang = world.dayT * Math.PI * 2 - Math.PI * .5;
    const sx = Math.cos(ang) * 180, sy = Math.sin(ang) * 150;
    sun.position.set(playerPos.x + sx, Math.max(sy, -20), playerPos.z + 60);
    sunSprite.position.set(sx * 2, sy * 2.2, -320);
    sunSprite.material.opacity = THREE.MathUtils.clamp(sy / 60, 0, 1) * (1 - k.nightF);
    const mx = -Math.cos(ang) * 200, my = -Math.sin(ang) * 160;
    moon.position.set(mx, Math.max(my, 5), -240);
    moon.visible = moonGlow.material.opacity = THREE.MathUtils.clamp(k.nightF * 1.2, 0, 1);
    moonGlow.visible = moon.visible;

    // звёзды
    starMat.opacity = k.nightF * .95;
    stars.rotation.y += dt * 0.004;
    stars.position.set(playerPos.x, 0, playerPos.z);

    // окна и кристаллы ярче ночью
    windowMat.emissiveIntensity = 0.25 + k.nightF * 1.6;
    for (const c of crystals) c.material.emissiveIntensity = .5 + k.nightF * 1.3;

    // вода блестит ночью
    stream.material.emissiveIntensity = .15 + k.nightF * .5;

    // фонари: мерцание
    for (const L of lanterns) {
      if (!L.lit) continue;
      const fl = .9 + Math.sin(elapsed * 6 + L.seed * 7) * .06 + Math.sin(elapsed * 13.7 + L.seed) * .04;
      L.glow.material.opacity = .85 * fl;
      L.lampMat.emissiveIntensity = 2.2 * fl;
    }

    // островки дышат
    for (const is of islands) {
      is.g.position.y += Math.sin(elapsed * .4 + is.seed) * .0035;
      is.g.rotation.y += dt * .02;
    }

    // светлячки: полёт + сбор
    const pa = ffGeo.attributes.position;
    for (let i = 0; i < FF_N; i++) {
      const d = ffData[i];
      if (!d.alive) {
        if (elapsed > d.respawnAt) {
          d.alive = true;
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 26;
          d.cx = Math.cos(a) * r; d.cz = Math.sin(a) * r;
        } else {
          pa.setY(i, -100);
          continue;
        }
      }
      const wob = elapsed * (0.6 + (i % 5) * .13) + d.seed;
      const x = d.cx + Math.sin(wob) * 1.3;
      const z = d.cz + Math.cos(wob * .8) * 1.3;
      const y = d.y + Math.sin(wob * 1.3) * .5;
      pa.setXYZ(i, x, y, z);
      if (playerPos) {
        const dx = x - playerPos.x, dz = z - playerPos.z, dy = y - (playerPos.y + 1);
        if (dx * dx + dz * dz + dy * dy < 1.7) {
          d.alive = false;
          d.respawnAt = elapsed + 35 + Math.random() * 30;
          world.firefliesCollected++;
          burst(new THREE.Vector3(x, y, z), 0xffe9a0, 5);
          world.onCollect && world.onCollect(world.firefliesCollected);
        }
      }
    }
    pa.needsUpdate = true;

    // искры
    for (const sp of sparks) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.vel.y -= 2.2 * dt;
      sp.spr.position.addScaledVector(sp.vel, dt);
      sp.spr.material.opacity = Math.max(sp.life, 0);
      if (sp.life <= 0) sp.spr.visible = false;
    }
  };

  return world;
}
