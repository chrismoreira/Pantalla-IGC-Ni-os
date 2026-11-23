#!/usr/bin/env python3
"""Regenerate Amazon App Icon (TV) + Appstore assets + leanback banners.

Amazon App Icon (TV) / store asset:
  - 1280×720 PNG, RGB (no alpha / transparency)
  - Full-bleed artwork edge-to-edge, no borders, no rounded corners
  - Safe zone 882×448 centered — logo only inside that zone
  - Also 114×114 and 512×512 opaque squares for store listings

Additional Appstore listing assets (all RGB, no transparency):
  - Background Image 1920×1080
  - Promotional Image 1024×500 (logo + title)
  - Featured Content Logo 640×260 (logo + title on teal)
  - Featured Content Background 1920×720

In-APK leanback banners follow the same teal full-bleed + safe-zone logo
layout, scaled from the 1280×720 reference (Google TV mdpi base 160×90).

Requires: pip install pillow
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
STORE = Path(__file__).resolve().parents[1] / "store-assets"

# Brand teal #163E3D — RGB only for final opaque assets
TEAL_RGB = (22, 62, 61)
TEAL_RGBA = (*TEAL_RGB, 255)
WHITE_RGB = (255, 255, 255)
APP_TITLE = "Pantalla IGC"

# Amazon App Icon (TV) reference canvas + safe zone
REF_W, REF_H = 1280, 720
SAFE_W, SAFE_H = 882, 448
# Logo fills most of the safe-zone short edge, still inside margins
SAFE_LOGO_FRACTION = 0.78

# Background Image content safe area (Amazon): 1214×830, prefer subject right
BG_W, BG_H = 1920, 1080
BG_SAFE_W, BG_SAFE_H = 1214, 830

PROMO_W, PROMO_H = 1024, 500
FEATURED_LOGO_W, FEATURED_LOGO_H = 640, 260
FEATURED_BG_W, FEATURED_BG_H = 1920, 720

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

FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
)


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
    # Flatten onto teal so every pixel ends fully opaque (a=255).
    base = Image.new("RGBA", (w, h), TEAL_RGBA)
    return Image.alpha_composite(base, canvas)


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


def load_title_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def flatten_to_teal_rgb(canvas: Image.Image) -> Image.Image:
    """Composite RGBA onto teal and return opaque RGB."""
    rgba = canvas.convert("RGBA")
    base = Image.new("RGBA", rgba.size, TEAL_RGBA)
    return Image.alpha_composite(base, rgba).convert("RGB")


def make_background_1920x1080(mark: Image.Image) -> Image.Image:
    """Fire TV Background: teal full-bleed; mark in right-biased safe area."""
    # Amazon safe area 1214×830 — bias subject to the right half of the canvas.
    sx = BG_W - BG_SAFE_W  # left edge of safe zone when flush-right
    sy = (BG_H - BG_SAFE_H) // 2
    logo_px = max(1, int(min(BG_SAFE_W, BG_SAFE_H) * 0.55))
    canvas = Image.new("RGBA", (BG_W, BG_H), TEAL_RGBA)
    logo = mark.resize((logo_px, logo_px), Image.Resampling.LANCZOS)
    ox = sx + (BG_SAFE_W - logo_px) // 2
    oy = sy + (BG_SAFE_H - logo_px) // 2
    canvas.alpha_composite(logo, (ox, oy))
    return flatten_to_teal_rgb(canvas)


def make_featured_background_1920x720(mark: Image.Image) -> Image.Image:
    """Featured Content Background: teal full-bleed + centered mark (no title)."""
    logo_px = max(1, int(min(FEATURED_BG_W, FEATURED_BG_H) * 0.42))
    return composite_mark_on_teal(mark, FEATURED_BG_W, FEATURED_BG_H, logo_px).convert(
        "RGB"
    )


def make_logo_title_rgb(
    mark: Image.Image,
    w: int,
    h: int,
    *,
    edge_pad: int,
    logo_frac: float,
    title_size: int,
    gap: int,
) -> Image.Image:
    """Horizontal logo + title on teal; RGB opaque (no transparency)."""
    canvas = Image.new("RGBA", (w, h), TEAL_RGBA)
    logo_px = max(1, int(h * logo_frac))
    logo = mark.resize((logo_px, logo_px), Image.Resampling.LANCZOS)
    font = load_title_font(title_size)
    draw = ImageDraw.Draw(canvas)
    bbox = draw.textbbox((0, 0), APP_TITLE, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    total_w = logo_px + gap + tw
    start_x = max(edge_pad, (w - total_w) // 2)
    logo_y = (h - logo_px) // 2
    text_x = start_x + logo_px + gap
    text_y = (h - th) // 2 - bbox[1]
    # Keep title ≥ edge_pad from every edge (Amazon promotional guidance).
    text_x = min(text_x, w - edge_pad - tw)
    text_y = max(edge_pad - bbox[1], min(text_y, h - edge_pad - th - bbox[1]))
    canvas.alpha_composite(logo, (start_x, logo_y))
    draw = ImageDraw.Draw(canvas)
    draw.text((text_x, text_y), APP_TITLE, font=font, fill=(*WHITE_RGB, 255))
    return flatten_to_teal_rgb(canvas)


def make_promotional_1024x500(mark: Image.Image) -> Image.Image:
    return make_logo_title_rgb(
        mark,
        PROMO_W,
        PROMO_H,
        edge_pad=50,
        logo_frac=0.58,
        title_size=96,
        gap=36,
    )


def make_featured_logo_640x260(mark: Image.Image) -> Image.Image:
    # Amazon allows transparency on Featured Logo; we keep RGB teal for
    # consistency with the rest of the Appstore pack (no alpha).
    return make_logo_title_rgb(
        mark,
        FEATURED_LOGO_W,
        FEATURED_LOGO_H,
        edge_pad=20,
        logo_frac=0.62,
        title_size=54,
        gap=18,
    )


def assert_store_rgb(path: Path, size: tuple[int, int]) -> None:
    img = Image.open(path)
    assert img.size == size, (path.name, img.size, size)
    assert img.mode == "RGB", (path.name, img.mode)
    for pt in ((0, 0), (size[0] - 1, 0), (0, size[1] - 1), (size[0] - 1, size[1] - 1)):
        assert img.getpixel(pt) == TEAL_RGB, (path.name, pt, img.getpixel(pt))


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

    # Remaining Appstore listing assets (RGB, no transparency)
    make_background_1920x1080(mark).save(
        STORE / "firetv-background-1920x1080.png", "PNG", optimize=True
    )
    make_promotional_1024x500(mark).save(
        STORE / "firetv-promotional-1024x500.png", "PNG", optimize=True
    )
    make_featured_logo_640x260(mark).save(
        STORE / "firetv-featured-logo-640x260.png", "PNG", optimize=True
    )
    make_featured_background_1920x720(mark).save(
        STORE / "firetv-featured-background-1920x720.png", "PNG", optimize=True
    )

    for folder, size in LAUNCHER.items():
        img = make_launcher(mark, size)
        save_png(img, ROOT / folder / "ic_igc_launcher.png")

    # Sanity: store assets must be RGB with teal corners
    assert_store_rgb(STORE / "firetv-banner-1280x720.png", (REF_W, REF_H))
    assert_store_rgb(STORE / "firetv-background-1920x1080.png", (BG_W, BG_H))
    assert_store_rgb(STORE / "firetv-promotional-1024x500.png", (PROMO_W, PROMO_H))
    assert_store_rgb(
        STORE / "firetv-featured-logo-640x260.png", (FEATURED_LOGO_W, FEATURED_LOGO_H)
    )
    assert_store_rgb(
        STORE / "firetv-featured-background-1920x720.png",
        (FEATURED_BG_W, FEATURED_BG_H),
    )
    sx, sy, sw, sh = safe_zone(REF_W, REF_H)
    assert (sx, sy, sw, sh) == ((REF_W - SAFE_W) // 2, (REF_H - SAFE_H) // 2, SAFE_W, SAFE_H)

    print(
        "OK: Amazon App Icon 1280×720 + Background 1920×1080 + Promotional 1024×500 "
        "+ Featured Logo 640×260 + Featured BG 1920×720 + store squares "
        "+ banner_16x9/tv_banner + opaque launchers"
    )


if __name__ == "__main__":
    main()
