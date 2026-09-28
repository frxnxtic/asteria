// Глава 1 «Пробуждение Гавани»: цепочка заданий, диалоги, виджет цели.
import * as THREE from "../vendor/three.module.js";

const $ = id => document.getElementById(id);

export class Dialog {
  constructor(onLock) {
    this.el = $("dialog");
    this.lines = [];
    this.idx = 0;
    this.onDone = null;
    this.active = false;
    this._onLock = onLock;
    this.el.addEventListener("pointerdown", () => this.advance());
  }
  open(who, avatar, lines, onDone) {
    this.lines = lines;
    this.idx = 0;
    this.onDone = onDone || null;
    this.active = true;
    $("dlgWho").textContent = who;
    $("dlgAvatar").textContent = avatar;
    $("dlgLine").textContent = this.lines[0];
    this.el.classList.add("open");
    this._onLock(true);
  }
  advance() {
    if (!this.active) return;
    this.idx++;
    if (this.idx >= this.lines.length) {
      this.active = false;
      this.el.classList.remove("open");
      this._onLock(false);
      const cb = this.onDone;
      this.onDone = null;
      cb && cb();
    } else {
      $("dlgLine").textContent = this.lines[this.idx];
      window.__audioBlip && window.__audioBlip();
    }
  }
}

export class Story {
  constructor(deps) {
    Object.assign(this, deps); // scene, world, player, combat, audio, fox, save, persist, camp
    this.dialog = new Dialog(lock => deps.input.setLocked(lock));
    window.__audioBlip = () => this.audio.blip();
    this.step = this.save.storyStep ?? 0;
    // защита от застревания на старых сейвах
    if (this.step === 1 && (this.save.questHerbs ?? 0) >= 3) this.step = 2;
    this.potions = this.save.potions ?? 0;
    this.herbCarry = this.save.herbCarry ?? 0;
    this.questHerbs = this.save.questHerbs ?? 0; // травы, сданные в квест
    this.blinkUnlocked = this.save.blinkUnlocked ?? false;
    this.potionRecipe = this.save.potionRecipe ?? false;
    this.blinkBtn = $("blinkBtn");
    this.blinkBtn.style.display = this.blinkUnlocked ? "grid" : "none";
    this.onPotions = null;

    this._herbs = [];
    this._spawnHerbs();

    this._applyStep(true);
    this.refreshPotion();
  }

  /* ── цель ── */
  objective(text, flash = true) {
    const el = $("objective");
    el.textContent = text;
    if (flash) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  /* ── травы ── */
  _spawnHerbs() {
    const spots = [[3, -9], [-4, -10], [7, -2], [-7, -3], [0, 8], [6, 7], [-6, 7], [3, -22], [-3, -22], [8, -14]];
    this._herbSpots = spots;
  }

  ensureHerbMeshes(makeHerb) {
    // создаётся в main после сборки мира
    this._herbMeshes = this._herbSpots.map(([x, z]) => {
      const h = makeHerb();
      h.group.position.set(x, 0, z);
      this.scene.add(h.group);
      return { x, z, ...h, alive: true, respawnAt: 0 };
    });
  }

  updateHerbs(dt, elapsed, playerPos) {
    if (!this._herbMeshes) return;
    for (const h of this._herbMeshes) {
      if (!h.alive) {
        if (elapsed > h.respawnAt) {
          h.alive = true;
          h.group.visible = true;
        }
        continue;
      }
      h.flower.rotation.y = elapsed * .8 + h.x;
      h.glow.material.opacity = .55 + Math.sin(elapsed * 2 + h.z) * .25;
      if (playerPos) {
        const d = Math.hypot(playerPos.x - h.x, playerPos.z - h.z);
        if (d < 1.25) {
          h.alive = false;
          h.group.visible = false;
          h.respawnAt = elapsed + 50;
          this.world.burst(new THREE.Vector3(h.x, .5, h.z), 0x9bd4ff, 6);
          this.audio.herb();
          if (this.step === 1 && this.questHerbs < 3) {
            this.questHerbs++;
            this.save.questHerbs = this.questHerbs;
            if (this.questHerbs >= 3) this.nextStep();
            else this.objective(`Лунная трава ${this.questHerbs}/3 🌙`);
          } else {
            this.herbCarry++;
            this.save.herbCarry = this.herbCarry;
            this.objective(`Лунная трава ${this.questHerbs}/3 🌙 · в сумке: ${this.herbCarry}`, false);
          }
          this.persist();
        }
      }
    }
  }

  /* ── шаги главы ── */
  _applyStep(initial = false) {
    switch (this.step) {
      case 0:
        this.objective("Найди Дэна у костра 🔥", !initial);
        break;
      case 1:
        this.objective(`Лунная трава ${this.questHerbs}/3 🌙`, !initial);
        break;
      case 2:
        this.objective("Свари зелье у котелка 🍲", !initial);
        break;
      case 3:
        this.objective("Отбей нападение Мглы ⚔️", !initial);
        break;
      case 4:
        this.objective("Поговори с Дэном 🧑", !initial);
        break;
      case 5:
        this.objective("Глава 1 завершена ✨ Гавань дышит", !initial);
        break;
    }
    this.save.storyStep = this.step;
  }

  nextStep() {
    this.step++;
    this._applyStep();
    this.persist();
  }

  /* ── взаимодействия ── */
  talkToDen() {
    if (this.dialog.active) return;
    const D = this.dialog;
    if (this.step === 0) {
      D.open("Дэн", "🧑", [
        "Ты проснулась, Юляся. Я — Дэн, хранитель этой Гавани.",
        "Звёзды гаснут. Небо тускнеет с каждой ночью — так начинается Тишь.",
        "Мгла уже принюхивается к свету наших фонарей. Нужен щит — зелье ночного зрения.",
        "Собери три лунные травы 🌙 — они светятся голубым вокруг площади. Котелок уже кипит.",
      ], () => this.nextStep());
    } else if (this.step === 4) {
      D.open("Дэн", "🧑", [
        "Ты сделала это… Гавань снова дышит.",
        "Это была лишь разведка Тиши. Она вернётся — и не одна.",
        "Погоди… кто это? Лисёнок. Он шёл за тобой от самого леса.",
        "Кажется, он выбрал тебя. Его зовут Искра — пусть подсвечивает тебе путь. 🐾",
      ], () => {
        this.fox.show(this.player.obj.position);
        this.world.burst(this.player.obj.position.clone().add(new THREE.Vector3(1, .5, 1)), 0xffe9a0, 10);
        this.audio.questDone();
        this.nextStep();
        toast("Искра присоединился к тебе! 🐾", 3600);
        if (!this.potionRecipe) {
          this.potionRecipe = true;
          this.save.potionRecipe = true;
          setTimeout(() => toast("Рецепт «Зелье росы»: 2 лунные травы → лечение 🧪", 4200), 1800);
        }
        this.persist();
      });
    } else {
      D.open("Дэн", "🧑", ["Отдыхай, хранительница. Скоро откроются новые пути."]);
    }
  }

  useCauldron() {
    if (this.dialog.active) return;
    if (this.step === 2 && this.questHerbs >= 3) {
      this.audio.brew();
      this.world.burst(new THREE.Vector3(this.camp.x + 1.1, .8, this.camp.z + .3), 0x9bd4ff, 12);
      this.dialog.open("Дэн", "🧑", [
        "Готово. Пей… Чувствуешь? Теперь ты видишь Мглу насквозь.",
        "Слышишь шёпот? Они уже идут. Возьми — осколок падшей звезды. 💫",
        "✦ — звёздные снаряды. 💫 — Блик: рывок сквозь пространство. Мгла тебя не догонит.",
      ], () => this._startWave());
      return;
    }
    if (this.potionRecipe) {
      if (this.herbCarry >= 2) {
        if (this.potions >= 3) { toast("Зелья больше не поместятся 🧪"); return; }
        this.herbCarry -= 2;
        this.potions++;
        this.save.herbCarry = this.herbCarry;
        this.save.potions = this.potions;
        this.audio.brew();
        this.world.burst(new THREE.Vector3(this.camp.x + 1.1, .8, this.camp.z + .3), 0xff9ed2, 10);
        toast("Сварено зелье росы 🧪", 2200);
        this.refreshPotion();
        this.persist();
      } else {
        toast(`Нужно 2 лунные травы 🌙 (есть ${this.herbCarry})`);
      }
      return;
    }
    if (this.step < 2) toast("Сначала — разговор и травы. Дэн у костра 🧑");
    else toast("Нужно 3 лунные травы 🌙");
  }

  _startWave() {
    this.blinkUnlocked = true;
    this.save.blinkUnlocked = true;
    this.blinkBtn.style.display = "grid";
    this.world.burst(this.player.obj.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xf5c86b, 14);
    const spawns = [];
    const P = this.combat.spawnPoints;
    for (let i = 0; i < 6; i++) {
      spawns.push({ delay: .8 + i * 1.5, pos: P[i % P.length].clone() });
    }
    spawns.push({ delay: 9, pos: P[0].clone(), elite: true });
    this.combat.startWave(spawns);
    this.nextStep();
    toast("Мгла атакует! ✦ стреляй, 💫 рывайся!", 4200);
  }

  waveCleared() {
    this.audio.questDone();
    this.nextStep();
    toast("Мгла отступила… Поговори с Дэном 🧑", 3600);
  }

  refreshPotion() {
    $("potionQty").textContent = this.potions;
    this.onPotions && this.onPotions(this.potions);
  }

  usePotion() {
    if (this.potions <= 0) { toast("Нет зелий — свари у котелка 🍲"); return false; }
    if (this.combat.hp >= this.combat.maxHp) { toast("Сердце полно ✦"); return false; }
    this.potions--;
    this.save.potions = this.potions;
    this.combat.heal(2);
    this.audio.brew();
    this.refreshPotion();
    this.persist();
    return true;
  }
}

let toastTimer = null;
export function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
