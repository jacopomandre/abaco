# Abaco Zuzzurellone - builds every Android launcher icon and splash image from the logo.
# Needs Pillow:   python tools/make-android-icons.py     (run from the project root)
# Source: resources/icon-source.png, a square logo on a plain cream background, with some
# empty margin around the drawing.
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'

# Cream of the logo background: also the adaptive-icon background (values/ic_launcher_background.xml)
CREAM = (253, 248, 235, 255)
# Android density buckets -> scale factor against mdpi
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# Share of the 108dp adaptive canvas taken by the logo. Launchers show only the central 72dp
# (0.667) and may mask it to a circle: a bit less keeps the lettering clear of that circle.
ADAPTIVE_LOGO_SHARE = 0.64
# Share of a round legacy icon, and of the splash screen's shorter side, taken by the logo
ROUND_LOGO_SHARE = 0.95
SPLASH_LOGO_SHARE = 0.55
# Corner radius of the legacy square icon, as a share of its side
LEGACY_CORNER_SHARE = 0.22
# Shapes are drawn this many times larger and scaled down, so their edges come out smooth
SMOOTH = 4


def centered(canvas_size, logo, share, background):
    """Canvas of canvas_size filled with background, logo centered at `share` of the shorter side."""
    canvas = Image.new('RGBA', canvas_size, background)
    side = round(min(canvas_size) * share)
    scaled = logo.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((canvas_size[0] - side) // 2, (canvas_size[1] - side) // 2))
    return canvas


def masked(image, size, radius_share):
    """image cut to a rounded square (radius_share 0.5 = circle) and scaled to size x size."""
    big = image.resize((size * SMOOTH, size * SMOOTH), Image.LANCZOS)
    mask = Image.new('L', big.size, 0)
    edge = big.size[0] - 1
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, edge, edge), radius=round(edge * radius_share), fill=255)
    big.putalpha(mask)
    return big.resize((size, size), Image.LANCZOS)


def main():
    logo = Image.open(ROOT / 'resources' / 'icon-source.png').convert('RGBA')

    for name, scale in DENSITIES.items():
        folder = RES / f'mipmap-{name}'
        # Adaptive icon foreground (Android 8+): the launcher masks it and adds the cream background
        adaptive = round(108 * scale)
        centered((adaptive, adaptive), logo, ADAPTIVE_LOGO_SHARE, (0, 0, 0, 0)).save(folder / 'ic_launcher_foreground.png')
        # Legacy icons (Android 7 and older): a rounded square and a round variant
        legacy = round(48 * scale)
        masked(logo, legacy, LEGACY_CORNER_SHARE).save(folder / 'ic_launcher.png')
        round_source = centered(logo.size, logo, ROUND_LOGO_SHARE, CREAM)
        masked(round_source, legacy, 0.5).save(folder / 'ic_launcher_round.png')

    # Splash screens: keep each existing file's size, cream background, logo in the middle
    for splash in RES.glob('drawable*/splash.png'):
        size = Image.open(splash).size
        centered(size, logo, SPLASH_LOGO_SHARE, CREAM).convert('RGB').save(splash)

    print('icons and splash screens written under', RES)


if __name__ == '__main__':
    main()
