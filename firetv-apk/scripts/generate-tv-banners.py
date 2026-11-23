#!/usr/bin/env python3
"""Regenerate Amazon App Icon (TV) + Android leanback banners + opaque launchers.

Amazon App Icon (TV) / store asset:
  - 1280×720 PNG, RGB (no alpha / transparency)
  - Full-bleed artwork edge-to-edge, no borders, no rounded corners
  - Safe zone 882×448 centered — logo only inside that zone
  - Also 114×114 and 512×512 opaque squares for store listings

In-APK leanback banners follow the same teal full-bleed + safe-zone logo
layout, scaled from the 1280×720 reference (Google TV mdpi base 160×90).

Requires: pip install pillow
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
STORE = Path(__file__).resolve().parents[1] / "store-assets"

# Brand teal #163E3D — RGB only for final opaque assets
TEAL_RGB = (22, 62, 61)
TEAL_RGBA = (*TEAL_RGB, 255)

# Amazon App Icon (TV) reference canvas + safe zone
REF_W, REF_H = 1280, 720
SAFE_W, SAFE_H = 882, 448
# Logo fills most of the safe-zone short edge, still inside margins
SAFE_LOGO_FRACTION = 0.78

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
STORE_SQUARES = (114, 512)


def safe_zone(w: int, h: int) -> tuple[int, int, int, int]:
    """Return (x, y, sw, sh) for the Amazon-proportional safe zone on canvas w×h."""
    sw = max(1, round(w * SAFE_W / REF_W))
    sh = max(1, round(h * SAFE_H / REF_H))
    x = (w - sw) // 2
    y = (h - sh) // 2
    return x, y, sw, sh


def logo_size_for_safe(sw: int, sh: int) -> int:
    return max(1, int(min(sw, sh) * SAFE_LOGO_FRACTION))


def composite_mark_on_teal(mark: Image.Image, w: int, h: int, logo_px: int) -> Image.Image:
    """Full-bleed teal canvas with white mark centered; returns opaque RGBA."""
    canvas = Image.new("RGBA", (w, h), TEAL_RGBA)
    logo = mark.resize((logo_px, logo_px), Image.Resampling.LANCZOS)
    ox = (w - logo_px) // 2
    oy = (h - logo_px) // 2
    canvas.alpha_composite(logo, (ox, oy))
    # Flatten every pixel onto teal so alpha is always 255 (no transparency).
    base = Image.new("RGBA", (w, h), TEAL_RGBA)
    base.alpha_composite(canvas)
    pixels = base.load()
    assert pixels is not None
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 255:
                continue
            alpha = a / 255.0
            pixels[x, y] = (
                int(r * alpha + TEAL_RGB[0] * (1 - alpha)),
                int(g * alpha + TEAL_RGB[1] * (1 - alpha)),
                int(b * alpha + TEAL_RGB[2] * (1 - alpha)),
                255,
            )
    return base


def make_banner(mark: Image.Image, w: int, h: int) -> Image.Image:
    """16:9 full-bleed teal; logo only inside Amazon-proportional safe zone."""
    _sx, _sy, sw, sh = safe_zone(w, h)
    return composite_mark_on_teal(mark, w, h, logo_size_for_safe(sw, sh))


def make_banner_rgb(mark: Image.Image, w: int, h: int) -> Image.Image:
    """Same as make_banner but RGB (Amazon: no transparency channel)."""
    return make_banner(mark, w, h).convert("RGB")


def make_banner_foreground(mark: Image.Image, w: int, h: int) -> Image.Image:
    """Transparent foreground (logo only) for optional adaptive layers."""
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    _sx, _sy, sw, sh = safe_zone(w, h)
    logo_px = logo_size_for_safe(sw, sh)
    logo = mark.resize((logo_px, logo_px), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((w - logo_px) // 2, (h - logo_px) // 2))
    return canvas


def make_launcher(mark: Image.Image, size: int) -> Image.Image:
    """Opaque square launcher (1:1), teal full-bleed."""
    logo_px = max(1, int(size * 0.62))
    return composite_mark_on_teal(mark, size, size, logo_px)


def make_store_square_rgb(mark: Image.Image, size: int) -> Image.Image:
    return make_launcher(mark, size).convert("RGB")


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Drop any residual alpha; store + APK banners must be opaque.
    if img.mode == "RGBA":
        # Keep RGBA files fully opaque (a=255) for Android density buckets,
        # but store assets are saved as RGB separately.
        img.save(path, "PNG", optimize=True)
    else:
        img.save(path, "PNG", optimize=True)


def main() -> None:
    mark = Image.open(ROOT / "drawable-nodpi" / "ic_igc_mark.png").convert("RGBA")

    for folder, (w, h) in BANNER_MIPMAP.items():
        img = make_banner(mark, w, h)
        d = ROOT / folder
        save_png(img, d / "banner_16x9.png")
        save_png(img, d / "tv_banner.png")

    for folder, (w, h) in BANNER_DRAWABLE.items():
        img = make_banner(mark, w, h)
        d = ROOT / folder
        save_png(img, d / "banner_16x9.png")
        save_png(img, d / "tv_banner.png")

    fg = make_banner_foreground(mark, 640, 360)
    save_png(fg, ROOT / "drawable-nodpi" / "banner_16x9_foreground.png")

    STORE.mkdir(parents=True, exist_ok=True)
    # Amazon App Icon (TV): 1280×720 RGB, no transparency
    make_banner_rgb(mark, REF_W, REF_H).save(
        STORE / "firetv-banner-1280x720.png", "PNG", optimize=True
    )
    for size in STORE_SQUARES:
        make_store_square_rgb(mark, size).save(
            STORE / f"firetv-icon-{size}x{size}.png", "PNG", optimize=True
        )

    for folder, size in LAUNCHER.items():
        img = make_launcher(mark, size)
        save_png(img, ROOT / folder / "ic_igc_launcher.png")

    # Sanity: store banner must be RGB 1280×720 with teal corners
    store = Image.open(STORE / "firetv-banner-1280x720.png")
    assert store.size == (REF_W, REF_H), store.size
    assert store.mode == "RGB", store.mode
    for pt in ((0, 0), (REF_W - 1, 0), (0, REF_H - 1), (REF_W - 1, REF_H - 1)):
        assert store.getpixel(pt) == TEAL_RGB, (pt, store.getpixel(pt))
    sx, sy, sw, sh = safe_zone(REF_W, REF_H)
    assert (sx, sy, sw, sh) == ((REF_W - SAFE_W) // 2, (REF_H - SAFE_H) // 2, SAFE_W, SAFE_H)

    print(
        "OK: Amazon 1280×720 RGB + store squares + banner_16x9/tv_banner "
        "+ opaque launchers (safe zone 882×448 @ 1280×720)"
    )


if __name__ == "__main__":
    main()
