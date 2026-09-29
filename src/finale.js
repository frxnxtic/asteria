// Финал: мост света, арена Чаши, бой с Тишью, выбор из трёх концовок, титры, NG+.
import * as THREE from "../vendor/three.module.js";

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

export const ENDINGS = {
  light: {
    title: "Развеять Тишь",
    icon: "✨",
    desc: "Уничтожить Тишь и вернуть небу все звёзды силой света.",
    lines: [
      "Юляся поднимает посох. Свет всех зажжённых фонарей Гавани стекается к звезде на его вершине.",
      "— Иди домой, — говорит она. — Звёзды здесь. Мы здесь. И мы помним, как гореть.",
      "Тишь растворяется беззвучно — как выдох, который длился сто лет.",
      "Над Астерией одна за другой вспыхивают созвездия. Все. До последней звезды.",
    ],
  },
  heal: {
    title: "Понять и исцелить",
    icon: "💗",
    desc: "Тайники леса открыли тебе её имя. Верни Тиши её свет — и её имя.",
    lines: [
      "Ты знаешь её имя. Оно написано на дне каждого тайника: Тишь. Просто — Тишь. Никто не звал её по имени сто лет.",
      "Юляся протягивает руку не с проклятием — с подарком. Осколок собственной звезды.",
      "— Тебя помнят, — говорит она. — Просто время было очень долгим.",
      "Тишь впервые за век издаёт звук — тихий-тихий смех. И поднимается в небо новой звездой. Самой яркой.",
    ],
  },
  star: {
    title: "Отдать свой свет",
    icon: "🌟",
    desc: "Стать новой звездой самой. Мир будет сиять — твоим светом.",
    lines: [
      "Юляся смотрит на гаснущую Чашу и понимает: звёзд не хватает. Одна — лишняя на земле.",
      "Она улыбается Искре: — Побудь хранительницей вместо меня. У тебя получится.",
      "Свет мягко поднимает её над ареной. Не больно. Как возвращение домой.",
      "Ночью над Астерией загорается новая звезда. Говорят, если загадать желание — она подмигивает.",
    ],
  },
};

export class Finale {
  constructor(scene, world, combat, audio, player, fox, events, npcs, save, persist, dialog) {
    this.scene = scene; this.world = world; this.combat = combat;
    this.audio = audio; this.player = player; this.fox = fox;
    this.events = events; this.save = save; this.persist = persist;
    this.arena = { x: 0, z: -88 };
    this.tishSpawned = false;
    this.denAllyT = 0;
    this._build();

    // сейв-восстановление
    if (this.save.ending !== undefined) this.ending = this.save.ending;
  }

  _build() {
    // мост света: от святилища к арене
    const bridge = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 18),
      new THREE.MeshStandardMaterial({
        color: 0xc9b8ff, emissive: 0x8b6bff, emissiveIntensity: 1.1,
        transparent: true, opacity: .85,
      })
    );
    bridge.rotation.x = -Math.PI / 2;
    bridge.position.set(0, .05, -84);
    this.scene.add(bridge);
    this.bridge = bridge;

    // арена: тёмный круг + Чаша (гаснущий обелиск)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10, 28),
      new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.arena.x, .02, this.arena.z);
    this.scene.add(floor);

    const cup = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 1.4, 6), mat(0x3a3455));
    stem.position.y = .7;
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(.85, .35, .6, 10),
      mat(0x2a2440, { emissive: 0x4a5a9a, emissiveIntensity: .4 })
    );
    bowl.position.y = 1.65;
    cup.add(stem, bowl);
    cup.position.set(this.arena.x, 0, this.arena.z);
    this.scene.add(cup);
    this.cup = bowl;
    this.world.colliders.push({ x: this.arena.x, z: this.arena.z, r: 1 });

    // камни арены
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.6 + (i % 3) * .4, 5), mat(0x241c38));
      m.position.set(this.arena.x + Math.cos(a) * 10, .7, this.arena.z + Math.sin(a) * 10);
      m.rotation.z = (i % 2 ? .08 : -.08);
      this.scene.add(m);
      this.world.colliders.push({ x: m.position.x, z: m.position.z, r: .5 });
    }

    // Дэн-союзник на арене (декор-позиция для залпов)
    this.denPos = new THREE.Vector3(this.arena.x - 7, 1.4, this.arena.z + 6);
  }

  update(dt, elapsed, playerPos) {
    // пульс моста
    this.bridge.material.emissiveIntensity = .9 + Math.sin(elapsed * 1.8) * .3;
    this.cup.material.emissiveIntensity = .3 + Math.sin(elapsed * 2.2) * .15 + (this.combat.enemies.some(e => e.tish) ? .5 : 0);

    // залпы Дэна в бою с Тишью
    const tish = this.combat.enemies.find(e => e.tish);
    if (tish && playerPos) {
      this.denAllyT -= dt;
      if (this.denAllyT <= 0) {
        this.denAllyT = 3.6;
        this.combat.allyShot(this.denPos.clone(), tish);
        this.world.burst(this.denPos.clone(), 0xffd9a0, 3);
      }
    }
  }

  /* ── старт финального боя ── */
  startFight() {
    if (this.tishSpawned) return;
    this.tishSpawned = true;
    this.combat.startTish(new THREE.Vector3(this.arena.x, 0, this.arena.z - 4));
    this.audio.hurt();
  }

  /* ── после победы: сердце Тиши и выбор ── */
  offerChoice(onChoose) {
    this.input && this.input.setLocked(true);
    const opened = this.events.chests.filter(c => c.opened).length;
    const ov = document.createElement("div");
    ov.id = "choiceOverlay";
    ov.style.cssText = `position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:rgba(8,4,20,.9);backdrop-filter:blur(8px);overflow:auto`;
    ov.innerHTML = `
      <div style="font-size:44px">🌌</div>
      <div style="color:#f2eeff;font-weight:800;font-size:21px">Сердце Тиши бьётся перед тобой</div>
      <div style="color:#b7aed6;font-size:14.5px;max-width:480px;text-align:center">Что ты сделаешь с ней, хранительница? Выбор определяет, каким будет небо Астерии.</div>
      <div id="endCards" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:760px"></div>`;
    document.body.appendChild(ov);
    const cards = ov.querySelector("#endCards");

    const make = (key) => {
      const e = ENDINGS[key];
      const locked = key === "heal" && opened < 3;
      const card = document.createElement("div");
      card.style.cssText = `width:220px;padding:16px;border-radius:18px;cursor:${locked ? "not-allowed" : "pointer"};` +
        `background:rgba(30,18,60,.9);border:2px solid ${locked ? "rgba(120,110,150,.3)" : "rgba(245,200,107,.45)"};` +
        `display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;transition:transform .15s;` +
        (locked ? "opacity:.55;" : "");
      card.innerHTML = `
        <div style="font-size:34px">${e.icon}</div>
        <div style="color:#f5c86b;font-weight:800;font-size:16px">${e.title}</div>
        <div style="color:#c9b8ff;font-size:12.5px;line-height:1.4">${e.desc}</div>
        ${locked ? '<div style="color:#ff9ed2;font-size:11.5px">Открыто 3+ тайников леса 💎 (сейчас ' + opened + ')</div>' : ""}`;
      if (!locked) {
        card.addEventListener("pointerdown", () => {
          ov.remove();
          this.input && this.input.setLocked(false);
          onChoose(key);
        });
        card.addEventListener("mouseenter", () => card.style.transform = "scale(1.04)");
        card.addEventListener("mouseleave", () => card.style.transform = "scale(1)");
      }
      cards.appendChild(card);
    };
    ["light", "heal", "star"].forEach(make);
  }

  /* ── финальная сцена ── */
  playEnding(key, dialog, onDone) {
    this.ending = key;
    this.save.ending = key;
    this.persist();
    const e = ENDINGS[key];
    const who = key === "star" ? "Юляся" : "Астерия";
    const avatar = key === "star" ? "🌟" : (key === "heal" ? "💗" : "✨");

    // визуальный эффект
    this.world.burst(new THREE.Vector3(this.arena.x, 2, this.arena.z), key === "heal" ? 0xff9ed2 : 0xf5e3a0, 30);
    if (key === "star") this.fox.show(this.player.obj.position); // Искра принимает смену
    this.audio.questDone();

    dialog.open(who, avatar, e.lines, () => {
      // все созвездия зажигаются
      this.world.constellations.lightFox();
      this.world.constellations.litT = 0.0001;
      this.showCredits(onDone);
    });
  }

  /* ── титры ── */
  showCredits(onDone) {
    const ov = document.createElement("div");
    ov.id = "credits";
    ov.style.cssText = `position:absolute;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:radial-gradient(120% 120% at 50% 20%, #2b1a5e 0%, #160c33 55%, #0d0722 100%);padding:30px;text-align:center;overflow:auto`;
    const rows = [
      ["44px", "✨"],
      ["clamp(34px,7vw,56px)", "АСТЕРИЯ"],
      ["15px", "история, рассказанная для одной единственной героини"],
      ["12px", "·"],
      ["17px", "Юляся — та, кто зажигает звёзды"],
      ["15px", "Дэн — хранитель Гавани"],
      ["15px", "Искра — лисёнок, который выбрал сам"],
      ["15px", "Мила и Борей — душа Гавани"],
      ["15px", "9 фонарей, 22 светлячка и вся Мгла — за смелость"],
      ["12px", "·"],
      ["16px", "музыка рождалась из математики и лунного света"],
      ["15px", "мир — из уважения к одному опроснику"],
      ["14px", "«вложить душу» — принято и исполнено"],
      ["12px", "·"],
      ["20px", "с любовью, твой разработчик 💜"],
    ];
    rows.forEach(([size, text], i) => {
      const d = document.createElement("div");
      d.style.cssText = `font-size:${size};color:${i === 1 ? "#f5c86b" : i === 12 ? "#c9b8ff" : "#f2eeff"};` +
        (i === 1 ? "font-weight:800;letter-spacing:.12em;" : "") +
        (i === 0 ? "filter:drop-shadow(0 0 18px rgba(245,200,107,.6));" : "");
      d.textContent = text;
      d.style.opacity = "0";
      d.style.transition = `opacity 1s ease ${i * .45}s`;
      ov.appendChild(d);
    });
    const btn = document.createElement("button");
    btn.textContent = "Продолжить жить в Астерии ✨";
    btn.style.cssText = `margin-top:22px;padding:14px 26px;border-radius:16px;border:none;cursor:pointer;` +
      `font-size:16px;font-weight:800;color:#241047;background:linear-gradient(120deg,#a67bff,#ff9ed2 55%,#f5c86b);` +
      `box-shadow:0 10px 30px rgba(166,123,255,.45)`;
    btn.addEventListener("pointerdown", () => {
      ov.remove();
      onDone();
    });
    ov.appendChild(btn);
    document.body.appendChild(ov);
    requestAnimationFrame(() => [...ov.children].forEach(c => c.style.opacity = "1"));
  }

  /* ── NG+: заново прожить историю, оставив коллекции ── */
  offerNewGamePlus(story) {
    // кнопка в HUD после финала? Проще: у Дэна появляется вариант в диалоге.
    // Реализовано в story.talkToDen (step 17): «Начать звёздный путь заново».
  }

  startNewGamePlus(story) {
    const keep = {
      fireflies: this.save.fireflies,
      sparkles: this.save.sparkles,
      chests: this.save.chests,
      maxHpBonus: this.save.maxHpBonus,
      cosmetics: this.save.cosmetics,
      cloak: this.save.cloak,
      potions: this.save.potions,
      herbCarry: this.save.herbCarry,
      ngPlus: (this.save.ngPlus ?? 0) + 1,
    };
    Object.keys(this.save).forEach(k => delete this.save[k]);
    Object.assign(this.save, keep);
    this.persist();
    location.reload();
  }
}
