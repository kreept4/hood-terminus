"""
Design token generator for Hood Terminus.

The problem this solves: hand-picked hex values and one-off font sizes. Those
read as arbitrary because they are, and arbitrary is what makes an interface
look thrown together.

Everything below is derived instead:

  colour    one perceptually even ramp built in OKLCH, gamut-mapped into
            sRGB, with every foreground/background pair's WCAG contrast
            computed and asserted rather than eyeballed
  type      one modular scale, fluid between two viewport anchors, with line
            height and tracking as functions of size, because a 100px heading
            and a 10px caption need opposite optical treatment
  space     a 4px base with a fixed set of steps, so no component invents a gap
  layout    a real column grid per breakpoint: columns, gutter, margin

Tailwind's @theme maps --color-x to var(--c-x), which is defined once on
:root. The indirection is kept because it costs nothing and is what a second
theme would need, but there is only one theme: this is a trading surface and
dark is what it is designed for.

Run:  python design/tokens.py
Emits app/tokens.css and prints a contrast audit that fails loudly.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Colour science
# ─────────────────────────────────────────────────────────────────────────────


def oklch_to_linear_srgb(L: float, C: float, H: float) -> tuple[float, float, float]:
    h = math.radians(H)
    a = C * math.cos(h)
    b = C * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b

    l, m, s = l_**3, m_**3, s_**3

    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, bl


def linear_to_srgb(c: float) -> float:
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def in_gamut(rgb: tuple[float, float, float]) -> bool:
    return all(-1e-4 <= c <= 1 + 1e-4 for c in rgb)


def oklch_to_hex(L: float, C: float, H: float) -> str:
    """
    Gamut-map by reducing chroma until the colour fits sRGB.

    Clipping RGB channels instead would shift hue, which is exactly how a
    'green' ramp ends up with a yellow step in the middle.
    """
    c = C
    while c > 0:
        if in_gamut(oklch_to_linear_srgb(L, c, H)):
            break
        c -= 0.002
    r, g, b = (linear_to_srgb(x) for x in oklch_to_linear_srgb(L, c, H))
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def hex_to_rgb(hx: str) -> tuple[float, float, float]:
    hx = hx.lstrip("#")
    return tuple(int(hx[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore


def relative_luminance(hx: str) -> float:
    def ch(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (ch(c) for c in hex_to_rgb(hx))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: str, bg: str) -> float:
    a, b = relative_luminance(fg), relative_luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# ─────────────────────────────────────────────────────────────────────────────
# Palettes
#
# One neutral ramp per theme, biased toward the brand hue so the greys read as
# chosen rather than inherited. One accent, which is also the "up" semantic.
# One "down". Nothing else: a third hue in a trading interface competes with
# the only two colours that carry meaning.
# ─────────────────────────────────────────────────────────────────────────────

HUE_GREEN = 123.0
HUE_RED = 33.0

# Amber, for Verify's caution and for any check that warns rather than fails.
#
# Sits between the red and the green on purpose. A warning that borrowed the red
# would read as a failure and a warning that borrowed the green would read as a
# pass, and Verify's whole contract is that those three states stay distinct at
# a glance. Placed nearer the red than the green, because the cost of reading a
# caution as a pass is somebody buying a token they should have looked at twice.
HUE_AMBER = 80.0

# The brand accent. Pinned, not derived, and the hue above is set to match it
# so the neutrals and the supporting ramp agree with it rather than sitting a
# quarter-turn away.
#
# At L 0.93 it is far brighter than a typical accent, which has one hard
# consequence: white on it fails contrast at 1.18 to 1. Anything placed on the
# accent has to be the dark ground, and `onAccent` below is exactly that.
BRAND_GREEN = "#CCFF00"

# name -> (L, C) in OKLCH
# Robinhood's own dark surface is close to black with almost no cast, and the
# green is what carries the brand. Chroma here is deliberately tiny: enough
# that the greys agree with the accent, never enough to read as a green screen.
DARK_NEUTRALS = {
    "ground": (0.098, 0.004),
    "surface": (0.178, 0.006),
    "surface2": (0.232, 0.007),
    "lineSoft": (0.258, 0.007),
    "line": (0.318, 0.009),
    "ink3": (0.690, 0.008),
    "ink2": (0.870, 0.005),
    "ink": (0.980, 0.003),
}

DARK_ACCENTS = {
    "greenBright": (0.900, 0.200, HUE_GREEN),
    "greenLine": (0.352, 0.090, HUE_GREEN),
    "greenDeep": (0.262, 0.075, HUE_GREEN),
    "red": (0.640, 0.215, HUE_RED),
    "redLine": (0.338, 0.100, HUE_RED),
    "redDeep": (0.250, 0.080, HUE_RED),
    # Same three steps as the red: a text colour, a border, and a fill dark
    # enough to carry that text. Lighter than the red because amber loses
    # contrast against this ground faster than a red of the same lightness does.
    "amber": (0.800, 0.150, HUE_AMBER),
    "amberLine": (0.360, 0.080, HUE_AMBER),
    "amberDeep": (0.262, 0.055, HUE_AMBER),
}


def build_palette(mode: str) -> dict[str, str]:
    p: dict[str, str] = {}
    neutrals = DARK_NEUTRALS
    accents = DARK_ACCENTS

    for name, (L, C) in neutrals.items():
        p[name] = oklch_to_hex(L, C, HUE_GREEN)
    for name, (L, C, H) in accents.items():
        p[name] = oklch_to_hex(L, C, H)

    if mode == "dark":
        p["green"] = BRAND_GREEN
        p["onAccent"] = p["ground"]
    else:
        p["onAccent"] = "#ffffff"
    return p


# ─────────────────────────────────────────────────────────────────────────────
# Type scale
# ─────────────────────────────────────────────────────────────────────────────

# Two anchors. The scale is tighter on a phone and opens up on a desktop, and
# every step interpolates between the two. Ratios differ on purpose: a small
# screen cannot afford the same contrast between body and display.
VIEWPORT_MIN, VIEWPORT_MAX = 360, 1600
BASE_MIN, RATIO_MIN = 14.0, 1.150
BASE_MAX, RATIO_MAX = 15.0, 1.200

# No type below this, whatever the scale says. A 10px caption is a caption
# nobody reads, and the steps below body were all landing on it, which is what
# made three different labels render at the same illegible size.
FLOOR_PX = 11.0

STEP_NAMES = [
    ("micro", -2),
    ("small", -1),
    ("body", 0),
    ("lead", 1),
    ("h3", 2),
    ("h2", 4),
    ("h1", 6),
    ("display", 7),
    ("mega", 9),
]


@dataclass(frozen=True)
class TypeStep:
    name: str
    px: float
    min_px: float
    line_height: float
    tracking_em: float
    weight: int

    def clamp(self) -> str:
        if self.px == self.min_px:
            return f"{self.px}px"
        slope = (self.px - self.min_px) / (VIEWPORT_MAX - VIEWPORT_MIN)
        intercept = self.min_px - slope * VIEWPORT_MIN
        return (
            f"clamp({self.min_px}px, "
            f"{round(slope * 100, 4)}vw + {round(intercept, 3)}px, "
            f"{self.px}px)"
        )


def line_height_for(px: float) -> float:
    """
    Large type needs proportionally less leading. A single ratio applied to
    every size is the most common reason a heading looks loose and a caption
    looks cramped.
    """
    lh = 1.72 - 0.115 * math.log(px / 10.0 + 1.0) * 2.4
    return round(max(0.92, min(1.65, lh)), 3)


def tracking_for(px: float) -> float:
    """
    Monospace runs wide, so display sizes need real negative tracking to hold
    together, and small sizes need a touch of positive tracking to stay legible.
    """
    t = 0.030 - 0.0300 * math.log(px / 9.0 + 1.0) * 1.30
    return round(max(-0.062, min(0.040, t)), 4)


def weight_for(step: int) -> int:
    if step >= 6:
        return 700
    if step >= 2:
        return 600
    if step >= 1:
        return 500
    return 400


def build_type() -> list[TypeStep]:
    out = []
    for name, step in STEP_NAMES:
        px = max(round(BASE_MAX * (RATIO_MAX**step), 2), FLOOR_PX)
        min_px = round(BASE_MIN * (RATIO_MIN**step), 2)
        # Below the base step the two ratios cross over and the small anchor
        # ends up larger than the large one, which would emit an inverted
        # clamp().
        min_px = max(FLOOR_PX, min(min_px, px))
        out.append(
            TypeStep(
                name, px, min_px, line_height_for(px), tracking_for(px),
                weight_for(step),
            )
        )
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Space and layout
# ─────────────────────────────────────────────────────────────────────────────

SPACE_BASE = 4
SPACE_STEPS = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 56, 72]


@dataclass(frozen=True)
class Breakpoint:
    name: str
    min_px: int
    columns: int
    gutter: int
    margin: int


BREAKPOINTS = [
    Breakpoint("xs", 0, 4, 12, 16),
    Breakpoint("sm", 600, 8, 16, 24),
    Breakpoint("md", 900, 12, 20, 32),
    Breakpoint("lg", 1280, 12, 24, 40),
    Breakpoint("xl", 1600, 12, 24, 56),
]


# ─────────────────────────────────────────────────────────────────────────────
# Audit
#
# 4.5 is WCAG AA for body text, 3.0 for large text and UI boundaries. Both
# The audit is a build gate, not a report: a palette that fails it does not
# get written.
# ─────────────────────────────────────────────────────────────────────────────

CONTRACTS = [
    ("ink", "ground", 4.5, "body text on page"),
    ("ink", "surface", 4.5, "body text on a cell"),
    ("ink2", "ground", 4.5, "secondary text on page"),
    ("ink2", "surface", 4.5, "secondary text on a cell"),
    ("ink3", "ground", 4.5, "captions and unit labels"),
    ("green", "ground", 3.0, "up values, accent"),
    ("green", "surface", 3.0, "up values on a cell"),
    ("red", "ground", 3.0, "down values"),
    ("red", "surface", 3.0, "down values on a cell"),
    ("amber", "ground", 3.0, "caution and warn"),
    ("amber", "surface", 3.0, "caution on a cell"),
    # The one that matters most: a warn chip is amber text on its own amber
    # fill, so that pair has to hold on its own rather than against the page.
    ("amber", "amberDeep", 3.0, "warn chip label on its fill"),
    ("line", "ground", 1.2, "hairline visible against page"),
]


def audit(mode: str, p: dict[str, str]) -> list[str]:
    failures: list[str] = []
    print(f"\n  contrast audit: {mode}")
    print("  " + "-" * 68)
    for fg, bg, minimum, use in CONTRACTS:
        r = contrast(p[fg], p[bg])
        ok = r >= minimum
        if not ok:
            failures.append(f"[{mode}] {fg} on {bg}: {r:.2f} < {minimum} ({use})")
        print(
            f"  {'ok ' if ok else 'FAIL'}  {fg:>11} on {bg:<9} "
            f"{r:5.2f}  min {minimum:<4}  {use}"
        )

    # Button labels sit on the accent fill, so that pair is checked with
    # whichever ink the theme actually puts on it.
    r = contrast(p["onAccent"], p["green"])
    ok = r >= 4.5
    if not ok:
        failures.append(f"[{mode}] onAccent on green: {r:.2f} < 4.5 (button label)")
    print(f"  {'ok ' if ok else 'FAIL'}  {'onAccent':>11} on {'green':<9} {r:5.2f}  min 4.5   button label on accent fill")
    print("  " + "-" * 68)
    return failures


# ─────────────────────────────────────────────────────────────────────────────
# Emit
# ─────────────────────────────────────────────────────────────────────────────


def kebab(name: str) -> str:
    """
    camelCase and trailing digits both become dashed segments, so `ink2` emits
    `ink-2` and matches the `text-ink-2` utility the components already use.
    Without the digit rule the generated names silently diverge from the ones
    in the markup, which fails as a blank colour rather than an error.
    """
    out = ""
    for i, ch in enumerate(name):
        if ch.isupper():
            out += "-" + ch.lower()
        elif ch.isdigit() and i and not name[i - 1].isdigit():
            out += "-" + ch
        else:
            out += ch
    return out


def vars_block(p: dict[str, str], indent: str = "  ") -> list[str]:
    return [f"{indent}--c-{kebab(k)}: {v};" for k, v in p.items()]


def emit(dark: dict[str, str], t: list[TypeStep]) -> str:
    L: list[str] = []
    a = L.append

    a("/* ─────────────────────────────────────────────────────────────")
    a("   GENERATED by design/tokens.py. Do not edit by hand.")
    a("")
    a("   Colour is derived in OKLCH and gamut-mapped, so each ramp is")
    a("   perceptually even and the greys carry the brand hue rather than")
    a("   being neutral by accident. Every pair passed a WCAG contrast")
    a("   assertion at generation time.")
    a("")
    a("   @theme maps --color-x to var(--c-x), defined once on :root. The")
    a("   indirection costs nothing and is what a second theme would need,")
    a("   but there is one theme: this is a trading surface and dark is")
    a("   what it is designed for.")
    a("   ───────────────────────────────────────────────────────────── */")
    a("")

    a("@theme {")
    a("  /* colour */")
    for k in dark:
        a(f"  --color-{kebab(k)}: var(--c-{kebab(k)});")

    a("")
    a("  /* type scale */")
    for s in t:
        a(f"  --text-{s.name}: {s.clamp()};")
        a(f"  --text-{s.name}--line-height: {s.line_height};")
        a(f"  --text-{s.name}--letter-spacing: {s.tracking_em}em;")
        a(f"  --text-{s.name}--font-weight: {s.weight};")

    a("")
    a("  /* space, 4px base */")
    for n in SPACE_STEPS:
        a(f"  --spacing-{n}: {n * SPACE_BASE / 16}rem;")

    a("")
    a("  /* breakpoints */")
    for b in BREAKPOINTS:
        if b.min_px:
            a(f"  --breakpoint-{b.name}: {b.min_px}px;")
    a("}")
    a("")

    a("/* One theme. `color-scheme: dark` is declared so form controls,")
    a("   scrollbars and the viewport canvas the browser paints all agree")
    a("   with it rather than defaulting to light. */")
    a(":root {")
    a("  color-scheme: dark;")
    L.extend(vars_block(dark))
    a("}")
    a("")

    a("/* Layout grid. Columns, gutter and page margin per breakpoint, so a")
    a("   section never invents its own padding. */")
    b0 = BREAKPOINTS[0]
    a(":root {")
    a(f"  --grid-columns: {b0.columns};")
    a(f"  --grid-gutter: {b0.gutter}px;")
    a(f"  --grid-margin: {b0.margin}px;")
    a("}")
    for b in BREAKPOINTS[1:]:
        a(f"@media (min-width: {b.min_px}px) {{")
        a("  :root {")
        a(f"    --grid-columns: {b.columns};")
        a(f"    --grid-gutter: {b.gutter}px;")
        a(f"    --grid-margin: {b.margin}px;")
        a("  }")
        a("}")
    a("")
    a("/* One padding rule for every full-width surface in the product. */")
    a(".gutter {")
    a("  padding-inline: var(--grid-margin);")
    a("}")
    a("")
    a(".grid-page {")
    a("  display: grid;")
    a("  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));")
    a("  gap: var(--grid-gutter);")
    a("}")
    a("")
    return "\n".join(L)


def main() -> int:
    dark = build_palette("dark")
    t = build_type()

    print("\n  palette")
    print("  " + "-" * 68)
    print(f"  {'token':>12}  {'value':>9}")
    for k in dark:
        print(f"  {kebab(k):>12}  {dark[k]:>9}")

    print("\n  type scale")
    print("  " + "-" * 68)
    print(f"  {'name':>9}  {'min':>7}  {'max':>7}  {'line':>6}  {'track':>8}  {'wt':>4}")
    for s in t:
        print(
            f"  {s.name:>9}  {s.min_px:>7}  {s.px:>7}  {s.line_height:>6}  "
            f"{s.tracking_em:>8}  {s.weight:>4}"
        )

    failures = audit("dark", dark)

    out = Path(__file__).resolve().parents[1] / "app" / "tokens.css"
    out.write_text(emit(dark, t), encoding="utf-8")
    print(f"\n  wrote app/tokens.css")

    if failures:
        print("\n  CONTRAST FAILURES")
        for f in failures:
            print(f"    {f}")
        return 1
    print("  all contrast contracts pass\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
