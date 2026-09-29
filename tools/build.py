#!/usr/bin/env python3
"""Собирает dist/asteria.html — один самодостаточный офлайн-файл (three + модули игры).

Схема сборки:
  three.core.js  → IIFE, публикует экспорты в window.__THREE_CORE__
  three.module.js→ IIFE, достаёт нужные имена из __THREE_CORE__, публикует window.THREE
  src/*.js       → лишаются import/export и складываются в один классический скрипт
"""
import base64, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
read = lambda p: (root / p).read_text(encoding = "utf-8")

def export_pairs(src, path):
    """Достаёт финальный `export { ... };` и возвращает (pairs, src_without_export)."""
    m = re.search(r"export\s*\{([^{}]*)\};?\s*$", src.strip(), flags = re.S)
    if not m:
        raise SystemExit(f"не найден финальный export в {path}")
    pairs = []
    for entry in m.group(1).split(","):
        entry = entry.strip()
        if not entry:
            continue
        if " as " in entry:
            local, exposed = [s.strip() for s in entry.split(" as ")]
        else:
            local = exposed = entry
        pairs.append(f"{exposed}: {local}")
    stripped = src.strip()[:m.start()] + src.strip()[m.end():]
    return pairs, stripped

# ── three.core ──
core_pairs, core_src = export_pairs(read("vendor/three.core.js"), "three.core.js")
core_bundle = ("(function(){\n" + core_src +
               "\nwindow.__THREE_CORE__ = { " + ", ".join(core_pairs) + " };\n})();")

# ── three.module ──
module = read("vendor/three.module.js")

# 1) забираем список импортируемых из core имён
m = re.search(r"import\s*\{([^{}]*)\}\s*from\s*['\"]\.\/three\.core\.js['\"];", module, flags = re.S)
if not m:
    raise SystemExit("не найден import из three.core.js")
imported = []
for entry in m.group(1).split(","):
    entry = entry.strip()
    if not entry:
        continue
    imported.append(entry.split(" as ")[-1].strip())  # локальное имя
module = module[:m.start()] + module[m.end():]

# 2) убираем ре-экспорт из core (всё уже войдёт в финальный export)
module = re.sub(r"export\s*\{[^{}]*\}\s*from\s*['\"]\.\/three\.core\.js['\"];\s*", "", module, flags = re.S)

# 3) финальный export → window.THREE (собственные + всё из core, т.к. module ре-экспортирует core)
mod_pairs, module_src = export_pairs(module, "three.module.js")
module_bundle = ("(function(){\nconst { " + ", ".join(imported) + " } = window.__THREE_CORE__;\n"
                 + module_src +
                 "\nwindow.THREE = Object.assign({}, window.__THREE_CORE__, { " + ", ".join(mod_pairs) + " });\n})();")

three_bundle = core_bundle + "\n" + module_bundle

# ── игровые модули: убираем import/export ──
def strip_module(src):
    src = re.sub(r"^import[^\n]*;\s*$", "", src, flags = re.M)
    src = re.sub(r"^export\s+(?=(?:async\s+)?(?:class|function|const|let|var))", "", src, flags = re.M)
    return src

game = "\n".join(strip_module(read(f"src/{f}")) for f in
                 ["input.js", "player.js", "world.js", "entities.js", "combat.js",
                  "story.js", "audio.js", "puzzles.js", "events.js", "weather.js", "npcs.js", "main.js"])
game = "const THREE = window.THREE;\n" + game

# service worker не нужен в файле-сборке — вырезаем регистрацию целиком
game = re.sub(r"// офлайн.*?\nif \(\"serviceWorker\".*?\n\}\n?", "", game, flags = re.S)

# защита: в классическом скрипте не должно остаться import/export на уровне строк
leftover = re.search(r"^\s*(import|export)[\s{]", three_bundle + "\n" + game, flags = re.M)
if leftover:
    raise SystemExit(f"в бандле остался ESM-синтаксис: {leftover.group(0).strip()!r}")

# ── HTML ──
html = read("index.html")
icon_b64 = base64.b64encode((root / "icons/apple-touch-icon.png").read_bytes()).decode()
html = html.replace('<link rel="manifest" href="manifest.webmanifest">',
                    f'<link rel="apple-touch-icon" href="data:image/png;base64,{icon_b64}">')
bundle_tag = ("<script>\ntry {\n" + three_bundle + "\n" + game +
              '\n} catch (e) { var __err = document.createElement("pre");'
              '__err.style.cssText = "color:#ff7a9e;padding:16px;white-space:pre-wrap;font-size:12px";'
              '__err.textContent = "ОШИБКА СБОРКИ: " + (e && e.stack || e);'
              'document.body.prepend(__err); }\n</script>')
html = html.replace('<script type="module" src="src/main.js"></script>', bundle_tag)

out = root / "dist" / "asteria.html"
out.parent.mkdir(exist_ok = True)
out.write_text(html, encoding = "utf-8")
print(f"OK {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")
