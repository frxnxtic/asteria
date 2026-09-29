import * as THREE from "../vendor/three.module.js";

// Жители Ночной Гавани: трактирщица Мила и звездочёт Борей.
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .9, ...opts });

function buildNPC({ skin = 0xffd9b8, hairC, topC, bottomC, apron = false, hat = false, beard = false }) {
  const g = new THREE.Group();
  const skinM = mat(skin), hairM = mat(hairC), topM = mat(topC), botM = mat(bottomC);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .45, 6), botM);
  legs.position.y = .22;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, .5, 8), topM);
  body.position.y = .7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), skinM);
  head.position.y = 1.1;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * .62), hairM);
  hair.position.y = 1.11;
  g.add(legs, body, head, hair);
  if (apron) {
    const ap = new THREE.Mesh(new THREE.BoxGeometry(.24, .34, .02), mat(0xe8dcc2));
    ap.position.set(0, .62, .18);
    g.add(ap);
  }
  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .03, 10), hairM);
    const top = new THREE.Mesh(new THREE.ConeGeometry(.12, .24, 8), hairM);
    brim.position.y = 1.22; top.position.y = 1.34;
    g.add(brim, top);
  }
  if (beard) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(.09, .2, 6), mat(0xd8d8e0));
    b.rotation.x = Math.PI;
    b.position.set(0, .98, .1);
    g.add(b);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class NPCs {
  constructor(scene, world, dialog) {
    this.dialog = dialog;
    this.list = [];

    // Мила — трактирщица у дома с тёплыми окнами
    const mila = buildNPC({ hairC: 0x8a4a2f, topC: 0xb5563f, bottomC: 0x4a3f5a, apron: true });
    mila.position.set(10.5, 0, 10);
    mila.rotation.y = Math.PI + .4;
    scene.add(mila);
    world.colliders.push({ x: 10.5, z: 10, r: .35 });

    // Борей — звездочёт с телескопом у восточного фонаря
    const borya = buildNPC({ hairC: 0x3a3a48, topC: 0x2e4a5a, bottomC: 0x33283f, hat: true, beard: true });
    borya.position.set(17, 0, 10.5);
    borya.rotation.y = -2.2;
    scene.add(borya);
    world.colliders.push({ x: 17, z: 10.5, r: .35 });
    // телескоп на треноге
    const scope = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 1.1, 8),
      mat(0x8a6a3c, { metalness: .4, roughness: .5 }));
    tube.rotation.z = Math.PI / 2.6;
    tube.position.y = 1.25;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.02, .03, 1.2, 5), mat(0x5a4030));
      leg.position.set(Math.cos(a) * .25, .6, Math.sin(a) * .25);
      leg.rotation.z = Math.cos(a) * .3;
      leg.rotation.x = Math.sin(a) * .3;
      scope.add(leg);
    }
    scope.add(tube);
    scope.position.set(18, 0, 9.5);
    scene.add(scope);
    world.colliders.push({ x: 18, z: 9.5, r: .3 });

    this.list.push(
      { name: "Мила", avatar: "👩‍🍳", obj: mila, x: 10.5, z: 10, seed: 0 },
      { name: "Борей", avatar: "🧙‍♂️", obj: borya, x: 17, z: 10.5, seed: 1 },
    );
  }

  // реплики зависят от прогресса (step из story)
  talk(npc, step) {
    const lines = {
      Мила: step >= 12 ? [
        "Созвездие Лисы вернулось! Вся Гавань не спала — смотрели на небо. Горячий сидр за счёт заведения! 🍷",
        "Дэн опять весь день у котелка. Покорми его, а? Волнуется он.",
      ] : step >= 3 ? [
        "Мгла у самых ворот, а ты уже зажигаешь наши фонарики. Спасибо, хранительница.",
        "После дождя приходи — у меня как раз пряники звёздной глазури.",
        "В дождь светлячки светятся ярче. Проверь сама!",
      ] : [
        "Добро пожаловать в Гавань, милая! Ты как раз к полднику.",
        "Слышала, звёзды начали гаснуть… страшно даже в тёплой кухне.",
      ],
      Борей: step >= 12 ? [
        "Хм! Созвездие Лисы — с наклоном в четверть луча точнее, чем в мои таблицы. Ты хорошо поработала, девочка.",
        "Следом должна гаснуть чаша Весов… нет-нет, не сейчас. Но готовься.",
      ] : step >= 6 ? [
        "Лес дышит тревожно. Обелиск святилища помнит больше, чем я за сорок лет.",
        "Тишь — не тьма, запомни. Тьма боится света. Тишь его… забывает.",
      ] : [
        "Пф! Юная хозяйка посоха. Не загораживай мне телескоп.",
        "Звёзды гаснут, а все пекут пироги. Безумный мир.",
      ],
    };
    const pool = lines[npc.name] || ["…"];
    const line = pool[(Math.random() * pool.length) | 0];
    this.dialog.open(npc.name, npc.avatar, [line]);
  }

  near(playerPos) {
    let best = null, bestD = 2.2;
    for (const n of this.list) {
      const d = Math.hypot(playerPos.x - n.x, playerPos.z - n.z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  update(elapsed) {
    for (const n of this.list) {
      n.obj.rotation.z = Math.sin(elapsed * .9 + n.seed * 3) * .015;
    }
  }
}
