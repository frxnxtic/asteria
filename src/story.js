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
    Object.assign(this, deps); // scene, world, player, combat, audio, fox, save, persist, camp, puzzles, events
    this.dialog = new Dialog(lock => deps.input.setLocked(lock));
    window.__audioBlip = () => this.audio.blip();
    this.step = this.save.storyStep ?? 0;
    // защита от застревания на старых сейвах
    if (this.step === 1 && (this.save.questHerbs ?? 0) >= 3) this.step = 2;
    this.potions = this.save.potions ?? 0;
    this.herbCarry = this.save.herbCarry ?? 0;
    this.questHerbs = this.save.questHerbs ?? 0;
    this.blinkUnlocked = this.save.blinkUnlocked ?? false;
    this.potionRecipe = this.save.potionRecipe ?? false;
    this.bossSpawned = false;
    this.blinkBtn = $("blinkBtn");
    this.blinkBtn.style.display = this.blinkUnlocked ? "grid" : "none";
    this.onPotions = null;

    this._herbs = [];
    this._spawnHerbs();

    // восстановление загадок из сейва
    const pz = this.save.puzzles ?? {};
    if (pz.mirrors) this.puzzles.solved.mirrors = true;
    if (pz.stars) this.puzzles.solved.stars = true;
    if (pz.bells) this.puzzles.solved.bells = true;
    this.puzzles.restore();
    if (pz.mirrors) this.world.obeliskHeart.material.emissiveIntensity = .6;
    if (this.save.foxLit || this.step >= 12) {
      // созвездие уже зажжено (прошлая сессия) — без повторной анимации
      this.world.constellations.lightFox();
      this.world.constellations.litT = 3;
      this.world.obeliskHeart.material.emissiveIntensity = 2.4;
      this._bossDone = true;
      this.save.foxLit = true;
    }

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
        if (!initial) setTimeout(() => toast("Дэн зовёт тебя к костру 🔥", 3600), 3200);
        break;
      case 6:
        this.objective("Пройди врата Сумеречного леса 🌲", !initial);
        break;
      case 7:
        this.objective("Загадка зеркал: доведи луч до обелиска 🪞", !initial);
        break;
      case 8:
        this.objective("Загадка звёзд: соедини созвездие Лисы ✦", !initial);
        break;
      case 9:
        this.objective("Загадка грибов: повтори песню колокольчиков 🍄", !initial);
        break;
      case 10:
        this.objective("Святилище пробуждено. Войди в круг камней ⚔️", !initial);
        break;
      case 11:
        this.objective("Победи Пожирателя Света ⚔️", !initial);
        break;
      case 12:
        this.objective("Небо вспыхнуло! Вернись к Дэну 🧑", !initial);
        break;
      case 13:
        this.objective("Глава 2 завершена ✨ Созвездие Лисы горит", !initial);
        if (!initial && !(this.save.hint3)) {
          this.save.hint3 = true;
          setTimeout(() => toast("Борей что-то увидел в телескоп… поговори с Дэном 🔭", 4200), 4000);
        }
        break;
      case 14:
        this.objective("Пройди по мосту света к Чаше Весов 🌉", !initial);
        break;
      case 15:
        this.objective("Победи Тишь — сердце угасания ⚔️", !initial);
        break;
      case 16:
        this.objective("Небо решает, кем ему быть… выбери ✨", !initial);
        break;
      case 17:
        this.objective("Астерия твоя. Живи ✨", !initial);
        break;
    }
    this.save.storyStep = this.step;
  }

  /* ── цель для компаса ── */
  getTarget() {
    const s = this.world.sanctuary;
    switch (this.step) {
      case 5: case 13:
        return { x: this.camp.x - 1.2, z: this.camp.z - .8, label: "Дэн" };
      case 6: return { x: 0, z: -36, label: "врата леса" };
      case 7: return { x: -3, z: -47, label: "зеркала" };
      case 8: return { x: -8, z: -54, label: "звёздная плита" };
      case 9: return { x: 9, z: -55, label: "колокольчики" };
      case 10:
      case 11: return { x: s.x, z: s.z, label: "святилище" };
      case 12: return { x: this.camp.x - 1.2, z: this.camp.z - .8, label: "Дэн" };
      case 14: case 15: return { x: 0, z: -84, label: "мост света" };
      default: return null;
    }
  }

  /* ── триггеры зоны (вызывать из main каждый кадр) ── */
  zoneTriggers(playerPos) {
    if (this.dialog.active) return;
    // шаг 5 → 6: через 8 секунд после финала главы 1 Дэн зовёт (кнопкой у Дэна)
    // шаг 6 → 7: прошла врата
    if (this.step === 6 && playerPos.z < -37) {
      this.nextStep();
      toast("Сумеречный лес встречает тебя шёпотом листьев 🍂", 3600);
    }
    // шаг 10/11 → босс: вошла в круг камней (или вернулась после перезагрузки в бою)
    if ((this.step === 10 || this.step === 11) && !this.bossSpawned) {
      const s = this.world.sanctuary;
      if (Math.hypot(playerPos.x - s.x, playerPos.z - s.z) < 11) {
        this.bossSpawned = true;
        this.nextStep();
        this.combat.startBoss(new THREE.Vector3(s.x, 0, s.z - 6));
        this.audio.hurt();
        toast("ПОЖИРАТЕЛЬ СВЕТА ПРОБУЖДАЕТСЯ ⚔️", 4200);
      }
    }
    // страховка: босса нет, свиты нет, а шаг всё ещё 11 → победа засчитана
    if (this.step === 11 && this.bossSpawned && this.combat.enemies.length === 0) {
      this.bossDefeated();
    }
    // глава 3: вход на арену Чаши → финальный бой
    if (this.step === 14 && playerPos.z < -77) {
      this.nextStep();
      toast("Мост света дрожит под ногами… Вперёд, хранительница", 3800);
    }
    if (this.step === 15 && !this.finale.tishSpawned) {
      const a = this.finale.arena;
      if (Math.hypot(playerPos.x - a.x, playerPos.z - a.z) < 11) {
        this.finale.startFight();
        toast("ТИШЬ ПРОБУЖДАЕТСЯ. Дэн держит фланг — за тобой небо! ⚔️", 4600);
      }
    }
    // страховка: сейв сохранил шаг «выбери», но Тишь ещё не побеждена/выбор не сделан
    const started = document.getElementById("hud").classList.contains("on");
    if (started && this.step === 16 && !this.save.ending && this.combat.enemies.length === 0 && !this._endingFlow) {
      this.onTishDefeated();
    }
  }

  /* ── решённые загадки (колбэки от puzzles) ── */
  onPuzzleSolved(name) {
    this.save.puzzles = { ...this.puzzles.solved };
    if (name === "mirrors" && this.step === 7) {
      this.world.obeliskHeart.material.emissiveIntensity = .6;
      this.nextStep();
      toast("Луч коснулся обелиска! Сердце святилища тёплое ✨", 3600);
    }
    if (name === "stars" && this.step === 8) {
      this.nextStep();
      toast("Звёзды помнят рисунок Лисы ✦", 3200);
    }
    if (name === "bells" && this.step === 9) {
      this.nextStep();
    }
  }

  /* ── Тишь повержена: предложить судьбу неба ── */
  onTishDefeated() {
    if (this._endingFlow) return;
    this._endingFlow = true;
    this.audio.questDone();
    this.world.burst(new THREE.Vector3(this.finale.arena.x, 2, this.finale.arena.z), 0x5a8ae0, 24);
    if (this.step === 15) this.nextStep();
    setTimeout(() => this.finale.offerChoice(key => {
      this.finale.playEnding(key, this.dialog, () => {
        this.step = 17;
        this.save.storyStep = 17;
        this.objective("Астерия твоя. Живи ✨");
        this.persist();
      });
    }), 1200);
  }

  /* ── босс повержен ── */
  bossDefeated() {
    if (this._bossDone) return;
    this._bossDone = true;
    this.save.foxLit = true;
    this.audio.questDone();
    this.world.constellations.lightFox();
    this.world.obeliskHeart.material.emissiveIntensity = 2.4;
    this.events.addSparkles(8);
    this.nextStep();
    toast("СОЗВЕЗДИЕ ЛИСЫ ВОСПЫЛАЛО В НЕБЕ ✨🦊", 5000);
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
    } else if (this.step === 5) {
      D.open("Дэн", "🧑", [
        "Смотри на север, Юляся. Видишь пустое место в небе?",
        "Созвездие Лисы погасло. Лисы — знак Искры. Если оно исчезнет навсегда, Тишь доберётся и до Гавани.",
        "За мостом — Сумеречный лес. Найди святилище, разгадай его тайны и зажги сердце созвездия.",
        "И вот ещё что… в лесу прячут блёстки 💎. Они пригодятся у алтаря святилища.",
      ], () => this.nextStep());
    } else if (this.step === 12) {
      D.open("Дэн", "🧑", [
        "Небо… Ты видишь? Созвездие Лисы горит снова! Вся Гавань смотрит вверх.",
        "Тишь отступила от леса. Но она запомнила твоё имя, хранительница.",
        "Собирай блёстки 💎 — алтарь у святилища сделает твоё сердце ярче.",
        "Отдыхай. Скоро откроются новые пути… 🌟",
      ], () => {
        this.nextStep();
        this.events.addSparkles(3);
        this.audio.questDone();
        toast("Глава 2 завершена ✨ Награда: +3 блёстки 💎", 4200);
      });
    } else if (this.step === 13) {
      D.open("Дэн", "🧑", [
        "Борей не спал всю ночь. В телескоп видно: гаснет Чаша Весов — сердце самой Тиши.",
        "За святилищем открылся мост света. Он выдержит только хранительницу.",
        "Ты не одна: Искра с тобой, я буду рядом на арене. Моё плечо — твоё.",
        "Иди. Астерия смотрит на тебя. 🌌",
      ], () => this.nextStep());
    } else if (this.step === 17) {
      if (this._denRepeat) {
        D.open("Дэн", "🧑", [
          "Уверена? Прожить всё заново — с нуля, но сохранив светлячков, блёстки и наряды?",
          "Тогда просто шагни в утро. Я буду ждать у костра. Всегда. 💜",
        ], () => this.finale.startNewGamePlus(this));
        this._denRepeat = false;
      } else {
        this._denRepeat = true;
        D.open("Дэн", "🧑", [
          "Небо твоё, хранительница. Живи в нём сколько захочешь.",
          "А если однажды захочется пережить всё сначала — просто поговори со мной ещё раз. 🌟",
        ]);
      }
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
