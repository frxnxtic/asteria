#!/usr/bin/env python3
"""Генерирует PNG-иконки Астерии без внешних зависимостей: ночной градиент + золотая звезда."""
import zlib, struct, math, os

def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, size):
    cx = cy = size / 2
    R = size / 2
    px = bytearray()
    for y in range(size):
        px.append(0)  # filter: None
        for x in range(size):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy) / R
            # фон: радиальный градиент фиолетовой ночи
            tr = max(0.0, 1 - d)
            bg_r = int(18 + 38 * tr ** 1.6)
            bg_g = int(8 + 22 * tr ** 1.6)
            bg_b = int(40 + 60 * tr ** 1.4)
            # четырёхлучевая звезда: ромб с вогнутыми сторонами + свечение
            ax, ay = abs(dx), abs(dy)
            star_d = (ax + ay) / (R * 0.62)          # ромб
            pinch = 1 - 0.42 * min(ax, ay) / max(ax, ay, 1e-6)  # вогнутость лучей
            star = max(0.0, 1 - star_d * pinch)
            glow = max(0.0, 1 - d / 0.78) ** 2
            core = star ** 1.8
            gold = core * 0.95 + glow * 0.5
            r = min(255, int(bg_r * (1 - gold) + 255 * gold))
            g = min(255, int(bg_g * (1 - gold) + 214 * gold))
            b = min(255, int(bg_b * (1 - gold) + 120 * gold))
            a = 255
            px += bytes((r, g, b, a))
    raw = zlib.compress(bytes(px), 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", ihdr)
            + png_chunk(b"IDAT", raw)
            + png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(data)
    print(path, size, "x", size, f"{len(data)//1024} KB")

os.makedirs("icons", exist_ok=True)
write_png("icons/icon-192.png", 192)
write_png("icons/icon-512.png", 512)
write_png("icons/apple-touch-icon.png", 180)
