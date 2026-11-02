# Run: python3 scripts/make-kiosk-backgrounds.py public/kiosk  (needs numpy, scipy, pillow)
"""Generate the kiosk backgrounds (original artwork, procedurally made):
  bg-sky.jpg   — pale sky blue silk: soft diagonal folds of light and shade, heavy grain
  bg-depth.jpg — watercolour wash on paper: white top, banded blues darkening downward,
                 band edges aligned to the placement LEVELS (0.24 / 0.43 / 0.60 / 0.84)
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

out = sys.argv[1]
rng = np.random.default_rng(7)


def ramp(t, stops):
    """Map t (0..1 array) through colour stops [(pos, (r,g,b)), ...]."""
    pos = np.array([p for p, _ in stops])
    cols = np.array([c for _, c in stops], dtype=float)
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], -1)


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def grain(shape, sigma, amount):
    g = rng.normal(0, 1, shape)
    if sigma:
        g = gaussian_filter(g, sigma)
        g /= g.std()
    return g * amount


# ---------------------------------------------------------------- sky silk
W, H = 1200, 1800
y, x = np.mgrid[0:H, 0:W].astype(float)
X, Y = x / W, y / H
def smooth(sig, shape=None):
    n = gaussian_filter(rng.normal(0, 1, shape or (H, W)), sig)
    return (n - n.mean()) / n.std()

def diag_field(sig_along, sig_across, angle=-58):
    """Smooth noise stretched along a diagonal (rotated), cropped to W×H."""
    D = int(np.hypot(W, H)) + 4
    n = gaussian_filter(rng.normal(0, 1, (D, D)), (sig_across, sig_along))
    n = (n - n.mean()) / n.std()
    lo, hi = n.min(), n.max()
    im = Image.fromarray(((n - lo) / (hi - lo) * 65535).astype(np.uint16).astype(np.int32), mode="I")
    im = im.rotate(angle, resample=Image.BILINEAR)
    l, t = (D - W) // 2, (D - H) // 2
    a = np.asarray(im.crop((l, t, l + W, t + H)), dtype=float) / 65535 * (hi - lo) + lo
    return (a - a.mean()) / a.std()

# soft patches of light and shade, swept diagonally (lower-left to upper-right)
v = 0.7 * diag_field(260, 90) + 0.35 * diag_field(140, 60) + 0.25 * smooth(160)
v = (v - v.min()) / (v.max() - v.min())
sky = ramp(v, [
    (0.0, hexc("8dc9e6")), (0.22, hexc("a0d5ed")), (0.45, hexc("bfe7f5")),
    (0.65, hexc("d4f2f9")), (0.85, hexc("e3f8fb")), (1.0, hexc("effcfd")),
])
# a few broad, soft highlights sweeping the same way
f = diag_field(320, 120)
streak = sum(np.exp(-((f - c) / 0.06) ** 2) for c in (-0.9, 0.2, 1.2))
streak = gaussian_filter(streak, 12) * 0.8 * np.clip(0.5 + 0.5 * smooth(220), 0, 1)
sky += streak[..., None] * np.array([30, 18, 9])
sky += grain((H, W), 0, 10)[..., None]
Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).save(f"{out}/bg-sky.jpg", quality=80)

# ---------------------------------------------------------------- watercolour depth
W, H = 1400, 1200
y, x = np.mgrid[0:H, 0:W].astype(float)
X, Y = x / W, y / H
# soft, wavy band edges like pigment pooling
edge = lambda amp, f, ph: amp * np.sin(X * np.pi * f + ph) + amp * 0.6 * np.sin(X * np.pi * f * 2.3 + ph * 1.7)
yy = Y + gaussian_filter(rng.normal(0, 1, (H, W)), 40) * 0.012
stops = [
    # the kiosk palette: off-white, then the projection's aqua and blues to navy
    (0.0, "f1f3f5"), (0.14, "eef2f4"), (0.18, "abdeed"), (0.215, "60b3cc"),
    (0.25, "3e79ad"), (0.33, "3873a8"), (0.415, "336ea3"),   # sunlight  (white text ≥ 5 : 1)
    (0.455, "255c9e"), (0.52, "23599c"), (0.575, "215696"),  # twilight  (≥ 6.8 : 1)
    (0.635, "143a6c"), (0.7, "113363"), (0.78, "0e2d59"), (0.84, "0c2a52"),  # midnight (≥ 12 : 1)
    (0.92, "0b274c"), (1.0, "0a2540"),
]
stops = [(p, hexc(c.lower())) for p, c in stops]
# shift each band edge with its own wave so the boundaries undulate
shift = np.zeros_like(Y)
for b, (amp, f, ph) in zip([0.24, 0.43, 0.60, 0.84], [(0.014, 1.6, 0.3), (0.012, 2.0, 1.9), (0.03, 1.2, 3.1), (0.012, 1.8, 0.9)]):
    w = np.exp(-((Y - b) / 0.07) ** 2)
    shift += w * edge(amp, f, ph)
wash = ramp(np.clip(yy - shift, 0, 1), stops)
# watercolour mottling + a slightly darker pigment rim just above each lower edge
mott = gaussian_filter(rng.normal(0, 1, (H, W)), 18)
mott /= mott.std()
depthf = np.clip((Y - 0.2) / 0.8, 0, 1)
wash *= (1 + mott * 0.005 * depthf)[..., None]
# paper: fine tooth + faint fibres
paper = grain((H, W), 0.7, 0.8) + grain((H, W), 2.5, 0.4)
wash += paper[..., None]
Image.fromarray(np.clip(wash, 0, 255).astype(np.uint8)).save(f"{out}/bg-depth.jpg", quality=80)
print("ok")
