#!/usr/bin/env python3
"""Builds the App Store screenshot panels (6.9", 1320x2868) from raw simulator captures.

Raw captures: docs/store/screenshots/raw/*.png, taken on an iPhone 17 Pro Max
simulator (iOS 26.5, 1320x2868) with the status bar overridden to 9:41 / full
battery / full signal:

  xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged \
    --batteryLevel 100 --wifiBars 3 --cellularMode active --cellularBars 4

Run:  python3 scripts/store/compose_screenshots.py
Needs Pillow. Uses the app's own Geist typeface (OFL, src/assets/fonts).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "docs/store/screenshots/raw"
OUT = ROOT / "docs/store/screenshots/6.9-inch"
FONTS = ROOT / "src/assets/fonts"

W, H = 1320, 2868
BG_TOP, BG_BOTTOM = (30, 30, 30), (10, 10, 10)
INK, MUTED = (237, 237, 237), (170, 170, 170)
PINE = (78, 170, 145)

# (file, raw capture, headline, subline). Headlines say what the screen does.
PANELS = [
    ("1-sit-down-stay-put", "welcome.png", "Sit down.\nStay put.",
     "A focus timer that notices when you drift."),
    ("2-pick-a-mode", "home.png", "Pick a mode.\nStart the timer.",
     "Each mode remembers its own length. Your tally grows with every session."),
    ("3-camera-keeps-watch", "session.png", "The camera\nkeeps watch.",
     "It checks you're still at your desk. Everything stays on your iPhone."),
    ("4-watch-your-streak", "progress2.png", "Watch your\nstreak grow.",
     "Sessions, streaks and distractions at a glance."),
    ("5-two-permissions", "permissions.png", "Two permissions.\nThat's it.",
     "Camera to check you're there. Screen Time to notice and lock the apps you pick."),
]


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def gradient():
    img = Image.new("RGB", (W, H))
    px = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        px.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return img


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def device(shot):
    """The screenshot inside a thin phone bezel, bleeding off the bottom."""
    width = 1100
    scale = width / shot.width
    shot = shot.resize((width, round(shot.height * scale)), Image.LANCZOS)
    radius = 118
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *shot.size), radius, fill=255)
    bezel = 22
    frame = Image.new("RGBA", (shot.width + 2 * bezel, shot.height + 2 * bezel), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle((0, 0, *frame.size), radius + bezel, fill=(52, 52, 54), outline=(86, 86, 90), width=4)
    fd.rounded_rectangle((bezel - 6, bezel - 6, frame.width - bezel + 6, frame.height - bezel + 6),
                         radius + 6, fill=(0, 0, 0))
    frame.paste(shot, (bezel, bezel), mask)
    return frame


def patch_status_bar(shot):
    """Progress is scrolled, so content sits under the status bar. Reuse the clean top strip from Home."""
    clean = Image.open(RAW / "home.png").convert("RGB").crop((0, 0, shot.width, 172))
    shot = shot.copy()
    shot.paste(clean, (0, 0))
    return shot


def compose(slug, raw, headline, subline):
    canvas = gradient()
    shot = Image.open(RAW / raw).convert("RGB")
    if raw == "progress2.png":
        shot = patch_status_bar(shot)

    # Soft pine glow behind the phone.
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse((160, 1100, W - 160, 2500), fill=(14, 46, 38))
    canvas = Image.composite(glow.filter(ImageFilter.GaussianBlur(240)), canvas, Image.new("L", (W, H), 90))

    draw = ImageDraw.Draw(canvas)
    head_font, sub_font = font("Geist-SemiBold.ttf", 112), font("Geist-Regular.ttf", 50)
    x, y = 110, 150
    for line in headline.split("\n"):
        draw.text((x, y), line, font=head_font, fill=INK)
        y += 128
    y += 26
    draw.rectangle((x, y, x + 96, y + 8), fill=PINE)
    y += 44
    for line in wrap(draw, subline, sub_font, W - 2 * x):
        draw.text((x, y), line, font=sub_font, fill=MUTED)
        y += 68

    phone = device(shot)
    top = max(y + 70, 700)
    canvas.paste(phone, ((W - phone.width) // 2, top), phone)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{slug}.png"
    canvas.convert("RGB").save(path, optimize=True)
    return path


if __name__ == "__main__":
    for panel in PANELS:
        print(compose(*panel))
