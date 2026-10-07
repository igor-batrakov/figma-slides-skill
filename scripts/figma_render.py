#!/usr/bin/env python3
"""Картинки слайдов одной секции Figma — для проверки глазами. Тратит ровно два запроса к API:
один на структуру файла (если нет свежей копии) и один на картинки всех слайдов секции.

Токен — только из переменной окружения FIGMA_TOKEN (права на чтение), в вывод не попадает.

  python3 figma_render.py <file_key> "<имя секции>" <папка> [--scale 0.5] [--refresh]

<file_key> — часть ссылки после /design/: figma.com/design/<file_key>/...
Копия структуры файла лежит в <папка>/file.json; --refresh скачивает её заново (после
каждой пересборки секции id слайдов меняются, так что после запуска плагина нужен --refresh).
Если Pillow установлен, рядом появятся листы sheet-NN.png по 4 слайда — их удобно смотреть.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.figma.com/v1"


def get(url, token):
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            wait = e.headers.get("Retry-After", "?")
            sys.exit(f"Лимит API Figma (429), повторить можно через {wait} с. "
                     "На местах View/Collab лимит ~20 запросов в месяц: проверяйте слайды в браузере.")
        sys.exit(f"API Figma ответил {e.code}: {e.read()[:200]!r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file_key")
    ap.add_argument("section")
    ap.add_argument("out")
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        sys.exit("Нет переменной окружения FIGMA_TOKEN")
    os.makedirs(a.out, exist_ok=True)
    cache = os.path.join(a.out, "file.json")

    if a.refresh or not os.path.exists(cache):
        data = get(f"{API}/files/{a.file_key}", token)
        # Копию пишем только после успешного ответа: ошибка не должна затирать прошлую.
        with open(cache, "w") as f:
            json.dump(data, f)
    data = json.load(open(cache))

    section = None
    for page in data["document"]["children"]:
        for n in page.get("children", []):
            if n["type"] == "SECTION" and n["name"] == a.section:
                section = n
    if not section:
        sys.exit(f"Секции «{a.section}» нет в копии файла. После запуска плагина добавьте --refresh")
    frames = sorted(section.get("children", []), key=lambda f: f["absoluteBoundingBox"]["x"])
    ids = [f["id"] for f in frames]
    print(f"Слайдов в секции: {len(ids)}")

    q = urllib.parse.urlencode({"ids": ",".join(ids), "format": "png", "scale": a.scale})
    images = get(f"{API}/images/{a.file_key}?{q}", token)
    if images.get("err"):
        sys.exit(f"Ошибка рендера: {images['err']}")

    paths = []
    for i, f in enumerate(frames, 1):
        url = images["images"].get(f["id"])
        if not url:
            print("нет картинки:", f["name"])
            continue
        p = os.path.join(a.out, f"{i:02d}.png")
        for attempt in range(3):  # ссылки ведут на S3, соединение иногда рвётся
            try:
                urllib.request.urlretrieve(url, p)
                break
            except OSError:
                if attempt == 2:
                    raise
        paths.append((i, f["name"], p))
    print(f"Скачано картинок: {len(paths)} → {a.out}")

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("Pillow не установлен — листов не будет, смотрите NN.png по одному")
        return
    tw, th, gap = 720, 450, 12
    for s in range(0, len(paths), 4):
        sheet = Image.new("RGB", (2 * tw + 3 * gap, 2 * th + 3 * gap), "#888888")
        d = ImageDraw.Draw(sheet)
        for k, (num, name, p) in enumerate(paths[s:s + 4]):
            im = Image.open(p).convert("RGB")
            im.thumbnail((tw, th))
            x, y = gap + (k % 2) * (tw + gap), gap + (k // 2) * (th + gap)
            sheet.paste(im, (x, y))
            d.rectangle([x, y, x + 34, y + 20], fill="#ff2d55")
            d.text((x + 6, y + 4), str(num), fill="white")
        out = os.path.join(a.out, f"sheet-{s // 4 + 1:02d}.png")
        sheet.save(out)
        print("лист:", out)


if __name__ == "__main__":
    main()
