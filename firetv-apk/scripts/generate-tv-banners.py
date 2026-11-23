#!/usr/bin/env python3
"""Regenerate Android TV / Fire TV banner_16x9 + opaque launcher icons.

Sizes follow Google TV app icon guidelines (mdpi base 160×90 for banners).
Requires: pip install pillow
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
STORE = Path(__file__).resolve().parents[1] / "store-assets"
TEAL = (22, 62, 61, 255)  # #163E3D

BANNER_MIPMAP = {
    "mipmap-mdpi": (160, 90),
    "mipmap-hdpi": (240, 135),
    "mipmap-xhdpi": (320, 180),
    "mipmap-xxhdpi": (480, 270),
    "mipmap-xxxhdpi": (640, 360),
}
BANNER_DRAWABLE = {
    "drawable-mdpi": (160, 90),
    "drawable-hdpi": (240, 135),
    "drawable": (320, 180),
    "drawable-xhdpi": (640, 360),
    "drawable-xxhdpi": (480, 270),
    "drawable-xxxhdpi": (640, 360),
}
LAUNCHER = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def flatten_on_teal(src: Image.Image) -> Image.Image:
    out = Image.new("RGBA", src.size, TEAL)
    out.alpha_composite(src)
    pixels = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 255:
                alpha = a / 255.0
                pixels[x, y] = (
                    int(r * alpha + TEAL[0] * (1 - alpha)),
                    int(g * alpha + TEAL[1] * (1 - alpha)),
                    int(b * alpha + TEAL[2] * (1 - alpha)),
                    255,
                )
    return out


def make_banner(mark: Image.Image, w: int, h: int) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), TEAL)
    logo_h = max(1, int(h * 0.52))
    logo = mark.resize((logo_h, logo_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((w - logo_h) // 2, (h - logo_h) // 2))
    return flatten_on_teal(canvas)


def make_banner_foreground(mark: Image.Image, w: int, h: int) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo_h = max(1, int(h * 0.52))
    logo = mark.resize((logo_h, logo_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((w - logo_h) // 2, (h - logo_h) // 2))
    return canvas


def make_launcher(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), TEAL)
    logo_h = max(1, int(size * 0.62))
    logo = mark.resize((logo_h, logo_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo_h) // 2, (size - logo_h) // 2))
    return flatten_on_teal(canvas)


def main() -> None:
    mark = Image.open(ROOT / "drawable-nodpi" / "ic_igc_mark.png").convert("RGBA")
    for folder, (w, h) in BANNER_MIPMAP.items():
        d = ROOT / folder
        d.mkdir(parents=True, exist_ok=True)
        img = make_banner(mark, w, h)
        img.save(d / "banner_16x9.png", "PNG")
        img.save(d / "tv_banner.png", "PNG")
    for folder, (w, h) in BANNER_DRAWABLE.items():
        d = ROOT / folder
        d.mkdir(parents=True, exist_ok=True)
        img = make_banner(mark, w, h)
        img.save(d / "banner_16x9.png", "PNG")
        img.save(d / "tv_banner.png", "PNG")
    fg = make_banner_foreground(mark, 640, 360)
    fg.save(ROOT / "drawable-nodpi" / "banner_16x9_foreground.png", "PNG")
    STORE.mkdir(parents=True, exist_ok=True)
    make_banner(mark, 1280, 720).save(STORE / "firetv-banner-1280x720.png", "PNG")
    for folder, size in LAUNCHER.items():
        img = make_launcher(mark, size)
        img.save(ROOT / folder / "ic_igc_launcher.png", "PNG")
    print("OK: banner_16x9 + tv_banner + opaque launchers regenerated")


if __name__ == "__main__":
    main()
