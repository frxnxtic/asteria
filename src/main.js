import * as THREE from "../vendor/three.module.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { createWorld } from "./world.js";
import { AudioEngine } from "./audio.js";
import { Combat } from "./combat.js";
import { Story, toast } from "./story.js";
import { Fox, buildDen, buildCamp, buildHerb } from "./entities.js";

/* ── сейвы ── */
const SAVE_KEY = "asteria_save_v1";
const save = {
  fireflies: 0, lanterns: [], pos: { x: 0, y: 0, z: 4 }, yaw: 0,
  dayT: 0.56, muted: false,
  storyStep: 0, questHerbs: 0, herbCarry: 0, potions: 0,
  blinkUnlocked: false, potionRecipe: false,
};
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) Object.assign(save, JSON.parse(raw));
} catch (e) { /* пустой сейв — ок */ }

function persist() {
  try {
    save.pos = { x: player.position.x, y: player.position.y, z: player.position.z };
    save.yaw = player.yaw;
    save.dayT = world.dayT;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) { /* нет доступа — играем без сейва */ }
}

/* ── сцена ── */
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

const world = createWorld(scene, renderer);
world.dayT = save.dayT;

const player = new Player(scene);
player.obj.position.set(save.pos.x, save.pos.y, save.pos.z);
player.yaw = save.yaw;
world.firefliesCollected = save.fireflies;
for (const idx of save.lanterns) world.lightLantern(idx);

// мягкая тень-блоб под Юлясей
const blob = new THREE.Mesh(
  new THREE.CircleGeometry(.42, 18),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .3, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);
player.blob = blob;

const input = new Input(canvas);
const audio = new AudioEngine();
audio.muted = save.muted;

/* ── M2: костёл Дэна, бой, глава ── */
const camp = buildCamp(scene, world.glowTex, world.colliders);
const den = buildDen();
den.group.position.set(camp.x - 1.2, 0, camp.z - .8);
den.group.rotation.y = 2.6;
scene.add(den.group);

const fox = new Fox(scene);

const combat = new Combat(scene, world, audio, world.glowTex);
combat.refreshHp();
combat.onDeath = () => {
  toast("Мгла поглотила тебя… но свет возвращает тебя 💫", 3200);
  setTimeout(() => {
    player.obj.position.set(camp.x + .8, 0, camp.z + 1.6);
    combat.respawn();
  }, 1400);
};
combat.onWaveCleared = () => story.waveCleared();

const story = new Story({
  scene, world, player, combat, audio, fox, save, persist, input, camp,
});
story.ensureHerbMeshes(buildHerb);

/* ── камера-риг ── */
const cam = { yaw: Math.PI, pitch: .42, dist: 7.2, cur: new THREE.Vector3(0, 5, 10) };

/* ── UI ── */
const $ = id => document.getElementById(id);
const startScreen = $("start"), hud = $("hud"), toastEl = $("toast");
const interactBtn = $("interactBtn"), soundBtn = $("soundBtn");
let toastTimer = null;
function showToast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}
function updateHUD() {
  $("ffCount").textContent = world.firefliesCollected;
  const lit = world.lanterns.filter(l => l.lit).length;
  $("lanCount").textContent = `${lit}/${world.lanterns.length}`;
  const night = world.nightF > .5;
  $("timeIcon").textContent = night ? "🌙" : (world.dayT > .1 && world.dayT < .45 ? "☀️" : "🌆");
  $("timeLabel").textContent = night ? "ночь" : (world.dayT > .1 && world.dayT < .45 ? "день" : "сумерки");
  soundBtn.textContent = audio.muted ? "🔇" : "🔊";
}
soundBtn.addEventListener("pointerdown", e => {
  e.stopPropagation();
  audio.setMuted(!audio.muted);
  save.muted = audio.muted;
  updateHUD();
});

/* ── события мира ── */
world.onCollect = (n) => { audio.collect(); updateHUD(); };
world.onLantern = (i) => {
  audio.lantern(); updateHUD(); persist();
  const lit = world.lanterns.filter(l => l.lit).length;
  if (lit === world.lanterns.length) showToast("Все фонари Гавани горят! Гавань сияет ✨", 4200);
  else showToast("Фонарь зажжён 🏮");
};

/* ── старт по касанию (нужен для аудио на iOS) ── */
let started = false;
startScreen.addEventListener("pointerdown", () => {
  if (started) return;
  started = true;
  audio.init();
  audio.setMuted(audio.muted);
  startScreen.classList.add("hidden");
  hud.classList.add("on");
  updateHUD();
  setTimeout(() => showToast("Собирай ✨ и зажигай 🏮 фонари", 3600), 900);
}, { once: false });

/* ── взаимодействие: фонари, Дэн, котелок ── */
let nearAct = null;
const ACT_EMOJI = { lantern: "🔥", den: "🧑", cauldron: "🍲" };
function checkInteract() {
  if (story.dialog.active) { nearAct = null; interactBtn.classList.remove("show"); input.consumeInteract(); return; }
  let best = null, bestD = 2.4;
  world.lanterns.forEach((L, i) => {
    if (L.lit) return;
    const d = Math.hypot(player.position.x - L.x, player.position.z - L.z);
    if (d < bestD) { bestD = d; best = { type: "lantern", i }; }
  });
  {
    const d = Math.hypot(player.position.x - den.group.position.x, player.position.z - den.group.position.z);
    if (d < bestD) { bestD = d; best = { type: "den" }; }
  }
  {
    const d = Math.hypot(player.position.x - (camp.x + 1.1), player.position.z - (camp.z + .3));
    if (d < bestD) { bestD = d; best = { type: "cauldron" }; }
  }
  if ((best && best.type) !== (nearAct && nearAct.type)) {
    nearAct = best;
    if (best) { interactBtn.textContent = ACT_EMOJI[best.type]; interactBtn.classList.add("show"); }
    else interactBtn.classList.remove("show");
  }
  if (input.consumeInteract() && nearAct) {
    if (nearAct.type === "lantern") {
      if (world.lightLantern(nearAct.i)) {
        save.lanterns = world.lanterns.map((l, i) => l.lit ? i : -1).filter(i => i >= 0);
        world.onLantern(nearAct.i);
      }
    } else if (nearAct.type === "den") {
      story.talkToDen();
    } else if (nearAct.type === "cauldron") {
      story.useCauldron();
    }
    nearAct = null;
    interactBtn.classList.remove("show");
  }
}

/* ── автоприцел ── */
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function aimDir() {
  _fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  let bestDir = null, bestD = Infinity;
  for (const e of combat.enemies) {
    _to.subVectors(e.obj.position, player.position); _to.y = 0;
    const d = _to.length();
    if (d > 20) continue;
    _to.normalize();
    if (_to.dot(_fwd) < .3) continue; // конус ~72°
    if (d < bestD) { bestD = d; bestDir = _to.clone(); }
  }
  return bestDir || _fwd.clone();
}

/* ── цикл ── */
const clock = new THREE.Clock();
let elapsed = 0, fpsAcc = 0, fpsN = 0, saveAcc = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  elapsed += dt;

  input.update();
  player.update(dt, input, cam.yaw, world.colliders);
  if (input.consumeJump() && !input.locked) audio.jump();

  // ── M2: бой ──
  if (!input.locked && !combat.dead) {
    if (input.consumeAttack()) {
      if (combat.tryAttack(player.position, aimDir())) player.attackT = .22;
    }
    if (input.consumeBlink() && story.blinkUnlocked) combat.tryBlink(player);
    if (input.consumePotion() && story.usePotion()) {
      world.burst(player.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff9ed2, 8);
    }
  } else {
    input.consumeAttack(); input.consumeBlink(); input.consumePotion(); input.consumeJump();
  }
  combat.update(dt, elapsed, player.position, input, player);

  // ── спутники и декор жизни ──
  fox.update(dt, elapsed, player.position);
  story.updateHerbs(dt, elapsed, player.position);
  den.glow.material.opacity = .8 + Math.sin(elapsed * 5) * .15;
  den.lamp.rotation.y = elapsed * 1.2;
  den.group.rotation.z = Math.sin(elapsed * .8) * .015;
  camp.flame.scale.setScalar(1.4 + Math.sin(elapsed * 8) * .18 + Math.sin(elapsed * 13.7) * .1);
  camp.flameCore.scale.y = 1 + Math.sin(elapsed * 9) * .15;
  camp.broth.material.emissiveIntensity = .7 + Math.sin(elapsed * 2.4) * .3;

  // камера: свайп/мышь + следование
  const cd = input.takeCamDelta();
  cam.yaw -= cd.x * .0042;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + cd.y * .0032, .12, 1.15);
  const tgt = new THREE.Vector3(
    player.position.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    player.position.y + 1.5 + Math.sin(cam.pitch) * cam.dist,
    player.position.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
  );
  tgt.y = Math.max(tgt.y, .4);
  cam.cur.lerp(tgt, 1 - Math.exp(-9 * dt));
  camera.position.copy(cam.cur);
  camera.lookAt(player.position.x, player.position.y + 1.35, player.position.z);

  world.update(dt, player.position, elapsed);
  if (started) audio.update(dt, elapsed, player.speed2d, player.onGround, world.nightF);
  checkInteract();

  // автосейв каждые 5с
  saveAcc += dt;
  if (saveAcc > 5) { saveAcc = 0; persist(); }

  renderer.render(scene, camera);
}
frame();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
addEventListener("pagehide", persist);

// офлайн-режим при хостинге (для файла-сборки dist SW не нужен)
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// отладочный доступ (тесты)
window.__debug = { world, player, combat, story, fox };
