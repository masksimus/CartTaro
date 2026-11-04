#!/usr/bin/env python3
"""Install unmodified public-domain 1909 Rider-Waite-Smith scans.
Provenance: https://github.com/mixvlad/TarotCards/blob/main/SOURCES.md
Published website needs no remote connections for card images.
"""
from pathlib import Path
import hashlib
import json
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "classic"
ASSETS.mkdir(parents=True, exist_ok=True)
CARDS = [
    "00_Fool.jpg","01_Magician.jpg","02_High_Priestess.jpg",
    "03_Empress.jpg","04_Emperor.jpg","05_Hierophant.jpg",
    "06_Lovers.jpg","07_Chariot.jpg","08_Strength.jpg",
    "09_Hermit.jpg","10_Wheel_of_Fortune.jpg","11_Justice.jpg",
    "12_Hanged_Man.jpg","13_Death.jpg","14_Temperance.jpg",
    "15_Devil.jpg","16_Tower.jpg","17_Star.jpg","18_Moon.jpg",
    "19_Sun.jpg","20_Judgement.jpg","21_World.jpg"
]
BASE = "https://raw.githubusercontent.com/mixvlad/TarotCards/main/tarot/rider-waite/720px/"
records = []
for idx, name in enumerate(CARDS):
    dest = ASSETS / name
    data = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(BASE + name, headers={
                "User-Agent": "CartTaro-original-card-install/1.0",
                "Accept": "image/jpeg",
            })
            with urllib.request.urlopen(req, timeout=35) as resp:
                data = resp.read(3_000_001)
            if not (20_000 <= len(data) <= 3_000_000 and
                    data[:3] == bytes.fromhex("ffd8ff") and
                    data[-2:] == bytes.fromhex("ffd9")):
                raise ValueError(f"{name}: invalid JPEG signature/size {len(data)}")
            break
        except (urllib.error.HTTPError, urllib.error.URLError,
                TimeoutError, ValueError) as exc:
            if attempt == 3:
                raise RuntimeError(f"Failed downloading validated {name}: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
    dest.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    records.append({"number": idx, "file": name, "bytes": len(data),
                    "sha256": digest, "source_url": BASE + name})
    print(f"{idx:02d} {name}: {len(data):,} bytes, SHA256 {digest[:14]}", flush=True)
assert len(records) == 22 and len({r["sha256"] for r in records}) == 22
(ASSETS / "manifest.json").write_text(
    json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "SOURCES.md").write_text(
    "# Оригинальные карты Таро Райдера — Уэйта — Смит (1909)\n\n"
    "22 изображения Старших Арканов. Художница: **Pamela Colman Smith** "
    "(1878–1951), издание **Rider & Company, 1909**.\n\n"
    "Исторические рисунки общественного достояния в США и странах, "
    "где действует срок охраны жизнь автора + 70 лет. "
    "Не используем поздние коммерческие перекраски или современные перерисовки.\n\n"
    "Источник: "
    "[mixvlad/TarotCards — Rider-Waite 720px]"
    "(https://github.com/mixvlad/TarotCards/tree/main/tarot/rider-waite/720px). "
    "Автор коллекции указывает исторические сканы "
    "на [Steve-P.org](https://steve-p.org/cards/RWSa.html). "
    "Описание происхождения: "
    "[SOURCES.md](https://github.com/mixvlad/TarotCards/blob/main/SOURCES.md). "
    "Исторические изображения также доступны в Wikimedia Commons.\n\n"
    "Изображения сохранены **без изменений пикселей**, без перекраски. "
    "Контрольные суммы каждого файла: classic/manifest.json.\n\n"
    "Русские названия и толкования — самостоятельный текст. "
    "Этот раздел — изолированное арт-превью, "
    "не связанное с хранилищем VK и серверной экономикой Neon.\n",
    encoding="utf-8"
)
print("Installed complete original Rider-Waite-Smith deck: 22 JPEG files")
