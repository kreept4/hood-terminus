"""
The settings gear, generated rather than drawn by hand.

Every other icon in `components/shell/NavIcons.tsx` is a few straight strokes on
a 16 unit grid. A gear is the one shape in that set that cannot be eyeballed:
its teeth have to sit at equal angles with matching flank widths, and a hand
written path gets that subtly wrong in a way the eye reads as wobble at 17px.

So the outline is computed. Eight teeth, each described by four points, the
root and tip radii chosen so the teeth read as teeth at icon size rather than
as a blurred ring. The numbers below are the only things worth changing.

    py design/gear.py

Prints the two `d` attributes to paste into `IconSettings`.
"""

from math import cos, radians, sin

CENTRE = 8.0
TEETH = 8
TIP_R = 6.5          # outer radius, at the tip of a tooth
ROOT_R = 5.0         # inner radius, between teeth
HUB_R = 2.3          # the hole in the middle
TIP_HALF = 11.0      # half the angular width of a tooth tip, in degrees
ROOT_HALF = 21.0     # half the angular width of the gap, in degrees


def point(radius: float, degrees: float) -> tuple[float, float]:
    """A point on a circle, in SVG coordinates with y growing downwards."""
    a = radians(degrees)
    return (CENTRE + radius * cos(a), CENTRE + radius * sin(a))


def gear_path() -> str:
    step = 360 / TEETH
    points: list[tuple[float, float]] = []

    for i in range(TEETH):
        mid = i * step - 90  # start at the top, so a tooth points up
        # Root, up the flank to the tip, across the tip, and back down.
        points.append(point(ROOT_R, mid - ROOT_HALF))
        points.append(point(TIP_R, mid - TIP_HALF))
        points.append(point(TIP_R, mid + TIP_HALF))
        points.append(point(ROOT_R, mid + ROOT_HALF))

    head = f"M{points[0][0]:.2f} {points[0][1]:.2f}"
    rest = "".join(f"L{x:.2f} {y:.2f}" for x, y in points[1:])
    return head + rest + "Z"


def hub_path() -> str:
    """The centre hole, as two arcs, so it strokes like the rest of the set."""
    left = CENTRE - HUB_R
    right = CENTRE + HUB_R
    return (
        f"M{left:.2f} {CENTRE:.2f}"
        f"A{HUB_R:.2f} {HUB_R:.2f} 0 0 1 {right:.2f} {CENTRE:.2f}"
        f"A{HUB_R:.2f} {HUB_R:.2f} 0 0 1 {left:.2f} {CENTRE:.2f}Z"
    )


if __name__ == "__main__":
    print(f'<path d="{gear_path()}" />')
    print(f'<path d="{hub_path()}" />')
