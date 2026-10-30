# Abaco Zuzzurellone - builds the Android launcher icons, the Play Store icon and the splash
# images from the logo.
# Launcher and store icons show only the abacus drawing: the "abaco zuzzurellone" lettering is
# too small to read at icon size. They keep the store look: cream with abacus beads around the
# edge. The beads are the adaptive background layer (mipmap-*/ic_launcher_background.png),
# committed as drawn and only read here; the abacus is the foreground layer.
# Needs Pillow:   python tools/make-android-icons.py     (run from the project root)
# Source: resources/icon-source.png, a square logo on a plain cream background, with some
# empty margin around the drawing.
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'

# Cream of the logo background: also the adaptive-icon background (values/ic_launcher_background.xml)
CREAM = (253, 248, 235, 255)
# Android density buckets -> scale factor against mdpi
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# Width of the abacus as a share of the 108dp adaptive canvas. Launchers show only the central
# 72dp and may mask it to a 66dp circle: the abacus corners must stay inside that circle.
ADAPTIVE_ABACUS_SHARE = 0.46
# Share of the adaptive canvas that a legacy icon shows (the central 72dp of 108dp)
LEGACY_VIEW_SHARE = 72 / 108
# Width of the abacus as a share of the 512px Play Store icon (Play rounds its corners itself)
STORE_ABACUS_SHARE = 0.66
# Share of the splash screen's shorter side taken by the full logo
SPLASH_LOGO_SHARE = 0.55
# Corner radius of the legacy square icon, as a share of its side
LEGACY_CORNER_SHARE = 0.22
# Shapes are drawn this many times larger and scaled down, so their edges come out smooth
SMOOTH = 4
# Largest channel distance from CREAM still treated as background, and smallest treated as solid
NOISE = 14
SOLID = 60


def color_to_alpha(pixel):
    """Remove CREAM from one pixel: transparent on the background, opaque on the drawing, a smooth
    ramp on the soft edges. Edge colors are "un-mixed" from the cream, so no pale halo shows."""
    distance = max(abs(value - back) for value, back in zip(pixel[:3], CREAM))
    if distance <= NOISE:
        return (0, 0, 0, 0)
    alpha = min(1.0, (distance - NOISE) / (SOLID - NOISE))
    color = tuple(max(0, min(255, round(back + (value - back) / alpha))) for value, back in zip(pixel[:3], CREAM))
    return color + (round(alpha * 255),)


def abacus_drawing():
    """The abacus alone, on a transparent background, cropped to its edges. It is the shape holding
    the topmost drawn pixel of the source; the lettering and sparks below do not touch it."""
    source = Image.open(ROOT / 'resources' / 'icon-source.png').convert('RGB')
    logo = Image.new('RGBA', source.size)
    logo.putdata([color_to_alpha(pixel) for pixel in source.getdata()])
    mask = logo.getchannel('A').point(lambda alpha: 255 if alpha else 0)
    top = next(index for index, alpha in enumerate(mask.getdata()) if alpha)
    ImageDraw.floodfill(mask, (top % mask.width, top // mask.width), 128)
    abacus = Image.new('RGBA', logo.size)
    abacus.paste(logo, mask=mask.point(lambda value: 255 if value == 128 else 0))
    return abacus.crop(abacus.getbbox())


def place(canvas, drawing, width_share):
    """drawing scaled to width_share of the canvas width and pasted in the middle of it."""
    width = round(canvas.width * width_share)
    height = round(drawing.height * width / drawing.width)
    scaled = drawing.resize((width, height), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((canvas.width - width) // 2, (canvas.height - height) // 2))
    return canvas


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


def beads_only(icon):
    """The store icon with its old logo painted over in cream, keeping the beads around the edge:
    the beads are the drawn shapes touching the border, everything else is the logo."""
    icon = icon.convert('RGBA')
    mask = Image.new('L', icon.size, 0)
    mask.putdata([255 if max(abs(v - c) for v, c in zip(pixel[:3], CREAM)) > NOISE else 0 for pixel in icon.getdata()])
    last = icon.width - 1
    for x in range(icon.width):
        for point in ((x, 0), (x, last), (0, x), (last, x)):
            if mask.getpixel(point) == 255:
                ImageDraw.floodfill(mask, point, 128)
    # The logo plus a thin ring around it, so its soft edge does not stay as a shadow
    logo = mask.point(lambda value: 255 if value == 255 else 0).filter(ImageFilter.MaxFilter(5))
    icon.paste(CREAM, mask=logo)
    return icon


def main():
    abacus = abacus_drawing()

    # Launcher icons: adaptive foreground (abacus on transparent), and the legacy square and round
    # icons for old Android, which show the central part of background + foreground
    for density, scale in DENSITIES.items():
        folder = RES / f'mipmap-{density}'
        canvas = round(108 * scale)
        foreground = place(Image.new('RGBA', (canvas, canvas)), abacus, ADAPTIVE_ABACUS_SHARE)
        foreground.save(folder / 'ic_launcher_foreground.png', optimize=True)
        full = Image.open(folder / 'ic_launcher_background.png').convert('RGBA')
        full.alpha_composite(foreground)
        margin = round(canvas * (1 - LEGACY_VIEW_SHARE) / 2)
        view = full.crop((margin, margin, canvas - margin, canvas - margin))
        size = round(48 * scale)
        masked(view, size, LEGACY_CORNER_SHARE).save(folder / 'ic_launcher.png', optimize=True)
        masked(view, size, 0.5).save(folder / 'ic_launcher_round.png', optimize=True)
    print('launcher icons written under', RES)

    # Play Store icon (512x512, uploaded by hand): same beads, old logo swapped for the abacus.
    # release/ is git-ignored, so the icon is only rebuilt when it is there.
    store_icons = [ROOT / 'release' / 'store' / 'play-icon-512.png', ROOT / 'release' / 'play-icon-512.png']
    existing = [path for path in store_icons if path.exists()]
    if existing:
        store = place(beads_only(Image.open(existing[0])), abacus, STORE_ABACUS_SHARE).convert('RGB')
        for path in existing:
            store.save(path, optimize=True)
            print(f'{path} written')

    # Splash screens: keep each existing file's size, cream background, full logo in the middle
    logo = Image.open(ROOT / 'resources' / 'icon-source.png').convert('RGBA')
    for splash in RES.glob('drawable*/splash.png'):
        size = Image.open(splash).size
        centered(size, logo, SPLASH_LOGO_SHARE, CREAM).convert('RGB').save(splash)
    print('splash screens written under', RES)


if __name__ == '__main__':
    main()
