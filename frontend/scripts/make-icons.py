"""Render the Striv mark into web and Android icon assets.

The mark is drawn directly rather than rasterising the SVG so the files have no
external dependency. Anti-aliasing is done by drawing at 8x and downsampling,
which gives clean edges on the rounded corners at every size.

Android adaptive icons need two layers rather than one flattened image: a
full-bleed background and a foreground whose content is confined to the inner
~66% safe zone, because the launcher masks the result to an arbitrary shape
(circle, squircle, rounded square) and crops anything outside that zone.
"""

import os
from PIL import Image, ImageDraw

INK = (28, 27, 27, 255)       # near-black tile
WHITE = (255, 255, 255, 255)
ACCENT = (96, 99, 238, 255)   # secondary/indigo
SURFACE = (253, 248, 248, 255)

SCALE = 8
BASE = 40  # design grid, matches the SVG viewBox

WEB_DIR = "public"
ANDROID_RES = os.path.join(
    "android", "app", "src", "main", "res"
)


def draw_mark(draw, px, u, *, include_tile=True):
    """Draw the mark into an existing ImageDraw at the given scale."""
    if include_tile:
        draw.rounded_rectangle([0, 0, px - 1, px - 1], radius=11 * u, fill=INK)

    def bar(x, y, w, h, colour):
        draw.rounded_rectangle(
            [x * u, y * u, (x + w) * u, (y + h) * u],
            radius=(w / 2) * u,
            fill=colour,
        )

    # Three ascending bars
    bar(10, 22, 4.5, 8, (255, 255, 255, 140))
    bar(17.75, 17, 4.5, 13, (255, 255, 255, 204))
    bar(25.5, 11, 4.5, 19, WHITE)

    # Forward chevron
    stroke = max(int(2.6 * u), 2)
    draw.line(
        [(14.5 * u, 14.5 * u), (20 * u, 9.5 * u), (25.5 * u, 14.5 * u)],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )
    r = stroke / 2
    for cx, cy in ((14.5, 14.5), (20, 9.5), (25.5, 14.5)):
        draw.ellipse([cx * u - r, cy * u - r, cx * u + r, cy * u + r], fill=ACCENT)


def render(size, *, tile=True, pad_ratio=0.0):
    """Render the mark at `size`, optionally padded for an adaptive safe zone."""
    px = size * SCALE
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if pad_ratio > 0:
        # Scale the 40-unit design down and centre it, leaving the margin the
        # launcher mask may crop.
        inner = 1.0 - 2 * pad_ratio
        off = (1.0 - inner) / 2
        # Draw into a temporary canvas then paste, so the geometry code stays
        # expressed in the original 40-unit grid.
        tmp_size = int(px * inner)
        tmp = Image.new("RGBA", (tmp_size, tmp_size), (0, 0, 0, 0))
        tmp_draw = ImageDraw.Draw(tmp)
        draw_mark(tmp_draw, tmp_size, tmp_size / BASE, include_tile=tile)
        img.paste(tmp, (int(px * off), int(px * off)), tmp)
    else:
        draw_mark(draw, px, px / BASE, include_tile=tile)

    return img.resize((size, size), Image.LANCZOS)


def render_solid(size, colour):
    img = Image.new("RGBA", (size, size), colour)
    return img


def write_web_icons():
    sizes = [16, 32, 48, 64]
    render(256).save(os.path.join(WEB_DIR, "favicon.ico"),
                     format="ICO", sizes=[(s, s) for s in sizes])
    render(192).save(os.path.join(WEB_DIR, "icon-192.png"))
    render(512).save(os.path.join(WEB_DIR, "icon-512.png"))
    render(180).save(os.path.join(WEB_DIR, "apple-icon.png"))
    print("web: favicon.ico, icon-192.png, icon-512.png, apple-icon.png")


def write_android_icons():
    if not os.path.isdir(ANDROID_RES):
        print("android: res/ not found — run 'npx cap add android' first, then "
              "re-run this script.")
        return

    # Adaptive icon background colour. Capacitor's template ships #FFFFFF, which
    # would put the mark's white bars on a white field and make the logo vanish.
    # Rewritten here so regenerating icons cannot silently reintroduce that.
    values_dir = os.path.join(ANDROID_RES, "values")
    os.makedirs(values_dir, exist_ok=True)
    with open(os.path.join(values_dir, "ic_launcher_background.xml"), "w",
              encoding="utf-8") as handle:
        handle.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="ic_launcher_background">#1C1B1B</color>\n'
            "</resources>\n"
        )

    # Remove Capacitor's stock launcher vectors: they are a teal placeholder
    # grid that is never referenced once the adaptive icon points at our PNG
    # layers, and leaving them invites confusion about which art is live.
    for stale in (
        os.path.join(ANDROID_RES, "drawable", "ic_launcher_background.xml"),
        os.path.join(ANDROID_RES, "drawable-v24", "ic_launcher_foreground.xml"),
    ):
        if os.path.exists(stale):
            os.remove(stale)

    # Launcher icon densities.
    legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for density, size in legacy.items():
        folder = os.path.join(ANDROID_RES, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)
        render(size).save(os.path.join(folder, "ic_launcher.png"))
        # Round variant: same art, launchers mask it themselves.
        render(size).save(os.path.join(folder, "ic_launcher_round.png"))

    # Adaptive icon layers are 108dp, of which only the inner 72dp is safe.
    adaptive = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    for density, size in adaptive.items():
        folder = os.path.join(ANDROID_RES, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)
        # Foreground: mark only, inset so a circular mask cannot clip it.
        render(size, tile=False, pad_ratio=0.28).save(
            os.path.join(folder, "ic_launcher_foreground.png")
        )
        # Background: solid ink, full bleed.
        render_solid(size, INK).save(
            os.path.join(folder, "ic_launcher_background.png")
        )

    # Splash screen: the mark centred on the app surface colour.
    for density, size in {"mdpi": 288, "hdpi": 432, "xhdpi": 576,
                          "xxhdpi": 864, "xxxhdpi": 1152}.items():
        folder = os.path.join(ANDROID_RES, f"drawable-{density}")
        os.makedirs(folder, exist_ok=True)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mark = render(int(size * 0.4))
        off = (size - mark.size[0]) // 2
        canvas.paste(mark, (off, off), mark)
        canvas.save(os.path.join(folder, "splash.png"))

    print("android: launcher (legacy + adaptive) and splash written")


if __name__ == "__main__":
    write_web_icons()
    write_android_icons()
