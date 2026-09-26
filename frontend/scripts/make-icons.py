"""Render the Striv mark into the web icon assets.

The mark is drawn directly rather than rasterising the SVG so the files have no
external dependency. Anti-aliasing is done by drawing at 8x and downsampling,
which gives clean edges on the rounded corners at every size.

Scope note: this only produces the browser assets (favicon, PWA icons,
apple-touch). The Android launcher and splash art used to be generated here too,
but the native app in ../striv-mobile owns its own assets now, so that code was
removed rather than left pointing at a directory that no longer exists.
"""

import os
from PIL import Image, ImageDraw

INK = (28, 27, 27, 255)       # near-black tile
WHITE = (255, 255, 255, 255)
ACCENT = (96, 99, 238, 255)   # secondary/indigo

SCALE = 8
BASE = 40  # design grid, matches the SVG viewBox

WEB_DIR = "public"


def draw_mark(draw, px, u):
    """Draw the mark into an existing ImageDraw at the given scale."""
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


def render(size: int) -> Image.Image:
    px = size * SCALE
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), px, px / BASE)
    return img.resize((size, size), Image.LANCZOS)


def write_web_icons():
    # Multi-size .ico so browsers can pick a crisp frame for the tab and for
    # pinned/bookmarked shortcuts.
    render(256).save(
        os.path.join(WEB_DIR, "favicon.ico"),
        format="ICO",
        sizes=[(s, s) for s in (16, 32, 48, 64)],
    )
    render(192).save(os.path.join(WEB_DIR, "icon-192.png"))
    render(512).save(os.path.join(WEB_DIR, "icon-512.png"))
    render(180).save(os.path.join(WEB_DIR, "apple-icon.png"))
    print("web: favicon.ico, icon-192.png, icon-512.png, apple-icon.png")


if __name__ == "__main__":
    write_web_icons()
