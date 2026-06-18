from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = ROOT / "ASSETS" / "SPRITES" / "enemyIcons"
SIZE = 150
CENTER = SIZE // 2


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
        alpha,
    )


def add_glow(base: Image.Image, shape: Image.Image, color: tuple[int, int, int, int], radius: int) -> None:
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    alpha = shape.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    glow.putalpha(alpha)
    tint = Image.new("RGBA", base.size, color)
    glow = Image.composite(tint, glow, glow)
    base.alpha_composite(glow)


def polygon(cx: float, cy: float, radius: float, sides: int, rotation: float = -math.pi / 2) -> list[tuple[float, float]]:
    return [
        (
            cx + math.cos(rotation + math.tau * i / sides) * radius,
            cy + math.sin(rotation + math.tau * i / sides) * radius,
        )
        for i in range(sides)
    ]


def make_canvas() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (5, 8, 12, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    for y in range(SIZE):
        shade = int(18 + 14 * (1 - abs(y - CENTER) / CENTER))
        draw.line([(0, y), (SIZE, y)], fill=(2, 8, shade, 255))

    for r, a in [(66, 28), (49, 18), (32, 14)]:
        draw.ellipse((CENTER - r, CENTER - r, CENTER + r, CENTER + r), outline=(255, 196, 80, a), width=1)

    gold = (197, 151, 73, 210)
    shadow = (36, 24, 12, 235)
    draw.rounded_rectangle((4, 4, SIZE - 5, SIZE - 5), radius=9, outline=shadow, width=3)
    draw.rounded_rectangle((7, 7, SIZE - 8, SIZE - 8), radius=7, outline=gold, width=1)
    draw.rounded_rectangle((13, 13, SIZE - 14, SIZE - 14), radius=4, outline=(211, 178, 97, 84), width=1)
    for sx, sy in [(1, 1), (-1, 1), (1, -1), (-1, -1)]:
        x0 = CENTER + sx * 56
        y0 = CENTER + sy * 56
        draw.line((x0, y0 - sy * 15, x0 - sx * 15, y0), fill=gold, width=2)
        draw.line((x0 - sx * 4, y0 - sy * 23, x0 - sx * 23, y0 - sy * 4), fill=(255, 224, 139, 100), width=1)
    return img


def draw_sparks(draw: ImageDraw.ImageDraw, points: Iterable[tuple[float, float]], color: tuple[int, int, int, int]) -> None:
    for x, y in points:
        draw.line((x - 2, y, x + 2, y), fill=color, width=1)
        draw.line((x, y - 2, x, y + 2), fill=color, width=1)


def save_icon(zone: str, filename: str, img: Image.Image) -> None:
    out_dir = OUT_ROOT / zone
    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / filename)


def icon_laser_striker() -> Image.Image:
    img = make_canvas()
    shape = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shape, "RGBA")
    sd.arc((24, 44, 126, 132), 197, 348, fill=rgba("#ff3b35", 210), width=5)
    sd.arc((32, 28, 130, 112), 155, 318, fill=rgba("#ffb15a", 140), width=2)
    sd.polygon(polygon(CENTER, CENTER, 28, 4, math.pi / 4), fill=rgba("#c81624", 245), outline=rgba("#ff9b6b", 255))
    sd.polygon(polygon(CENTER, CENTER, 16, 4, math.pi / 4), fill=rgba("#ff5b42", 245), outline=rgba("#ffd0a2", 230))
    sd.line((28, 110, 125, 36), fill=rgba("#ffdd99", 185), width=2)
    add_glow(img, shape, rgba("#ff2d2d", 210), 11)
    img.alpha_composite(shape)
    draw_sparks(ImageDraw.Draw(img, "RGBA"), [(38, 38), (114, 57), (42, 118), (101, 108)], rgba("#ffb45f", 220))
    return img


def icon_aliven_spark_cluster() -> Image.Image:
    img = make_canvas()
    shape = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shape, "RGBA")
    mote_points = [(75, 66), (55, 62), (92, 56), (63, 86), (94, 86), (76, 101), (45, 80), (108, 76)]
    for box in [(33, 43, 118, 108), (43, 35, 111, 116)]:
        sd.arc(box, 15, 245, fill=rgba("#7ab4ff", 120), width=2)
    for x, y in mote_points:
        sd.ellipse((x - 6, y - 6, x + 6, y + 6), fill=rgba("#7ab4ff", 235), outline=rgba("#d7f0ff", 255), width=1)
    sd.ellipse((66, 58, 86, 78), fill=rgba("#e8fbff", 245), outline=rgba("#7ab4ff", 255), width=1)
    add_glow(img, shape, rgba("#4a94ff", 210), 12)
    img.alpha_composite(shape)
    draw_sparks(ImageDraw.Draw(img, "RGBA"), [(37, 35), (121, 101), (30, 89), (117, 43)], rgba("#81d7ff", 220))
    return img


def icon_sand_fish() -> Image.Image:
    img = make_canvas()
    shape = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shape, "RGBA")
    sd.arc((21, 56, 125, 126), 202, 350, fill=rgba("#87e8ff", 125), width=2)
    body = [(37, 78), (62, 57), (104, 66), (122, 78), (101, 91), (60, 96)]
    sd.polygon(body, fill=rgba("#d8b35a", 245), outline=rgba("#ffe7a3", 255))
    sd.polygon([(37, 78), (23, 62), (29, 81), (22, 98)], fill=rgba("#b98d3b", 225), outline=rgba("#ffe0a0", 210))
    sd.polygon([(75, 62), (87, 43), (92, 67)], fill=rgba("#f1ca6c", 190), outline=rgba("#ffe6b0", 180))
    sd.polygon([(74, 92), (88, 111), (92, 88)], fill=rgba("#f1ca6c", 180), outline=rgba("#ffe6b0", 170))
    sd.ellipse((101, 72, 108, 79), fill=rgba("#fff3c7", 255))
    sd.line((52, 75, 101, 82), fill=rgba("#8f6b2a", 140), width=2)
    add_glow(img, shape, rgba("#eec35f", 205), 12)
    img.alpha_composite(shape)
    draw_sparks(ImageDraw.Draw(img, "RGBA"), [(42, 43), (114, 42), (45, 115), (113, 108)], rgba("#ffe09b", 210))
    return img


def icon_ribbon_worm() -> Image.Image:
    img = make_canvas()
    shape = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shape, "RGBA")
    pts = [(39, 91), (51, 78), (62, 74), (74, 81), (85, 87), (99, 78), (112, 61)]
    for width, color in [(18, rgba("#184d2f", 210)), (12, rgba("#49b873", 245)), (5, rgba("#b5ffd1", 160))]:
        sd.line(pts, fill=color, width=width, joint="curve")
    for x, y in pts[1:-1]:
        sd.ellipse((x - 7, y - 7, x + 7, y + 7), outline=rgba("#a8ffd2", 135), width=1)
    sd.ellipse((102, 51, 122, 71), fill=rgba("#8fffb8", 245), outline=rgba("#e6fff0", 255), width=1)
    sd.ellipse((112, 58, 116, 62), fill=rgba("#031c12", 220))
    add_glow(img, shape, rgba("#3fe17d", 210), 12)
    img.alpha_composite(shape)
    draw_sparks(ImageDraw.Draw(img, "RGBA"), [(33, 51), (54, 113), (124, 92), (95, 35)], rgba("#8dff8e", 210))
    return img


def icon_horizon_pentagon() -> Image.Image:
    img = make_canvas()
    shape = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shape, "RGBA")
    for r, a in [(47, 140), (36, 110), (24, 90)]:
        sd.ellipse((CENTER - r, CENTER - r, CENTER + r, CENTER + r), outline=rgba("#82f5ff", a), width=2)
    sd.line((24, CENTER, 126, CENTER), fill=rgba("#f4d47a", 130), width=2)
    sd.polygon(polygon(CENTER, CENTER, 33, 5), fill=rgba("#151f38", 245), outline=rgba("#d8faff", 255))
    sd.polygon(polygon(CENTER, CENTER, 23, 5), fill=rgba("#5defff", 190), outline=rgba("#fff0a8", 240))
    for p in polygon(CENTER, CENTER, 50, 5):
        sd.line((CENTER, CENTER, p[0], p[1]), fill=rgba("#b08cff", 90), width=1)
    add_glow(img, shape, rgba("#76f4ff", 210), 14)
    img.alpha_composite(shape)
    draw_sparks(ImageDraw.Draw(img, "RGBA"), [(42, 42), (111, 43), (37, 109), (112, 111), (75, 28)], rgba("#fff1a4", 220))
    return img


def main() -> None:
    save_icon("euhedral", "EnemyIcon_Euhedral__0000_Laser-Striker.png", icon_laser_striker())
    save_icon("impetus", "EnemyIcon_Impetus__0000_Aliven-Spark-Cluster.png", icon_aliven_spark_cluster())
    save_icon("caustics", "EnemyIcon_Caustics__0000_Sand-Fish.png", icon_sand_fish())
    save_icon("verdure", "EnemyIcon_Verdure__0000_Ribbon-Worm.png", icon_ribbon_worm())
    save_icon("horizon", "EnemyIcon_Horizon__0000_Horizon-Pentagon.png", icon_horizon_pentagon())


if __name__ == "__main__":
    main()
