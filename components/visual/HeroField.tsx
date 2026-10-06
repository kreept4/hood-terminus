"use client";

import DotField from "@/components/visual/DotField";

/**
 * The page's field of dots, themed.
 *
 * DotField takes plain colour strings rather than reading CSS variables, so the
 * palette is resolved here. The stock purple is replaced with the brand green
 * at low alpha: it has to sit under a headline and never compete with it, which
 * is also why the glow is the page ground rather than a lit colour. It darkens
 * the field toward the cursor instead of lighting it up.
 */
export function HeroField() {
  return (
    <DotField
      dotRadius={1.5}
      dotSpacing={20}
      cursorRadius={420}
      cursorForce={0.1}
      bulgeOnly
      bulgeStrength={52}
      glowRadius={200}
      sparkle={false}
      waveAmplitude={0}
      gradientFrom="rgba(204, 255, 0, 0.78)"
      gradientTo="rgba(152, 157, 152, 0.42)"
      glowColor="#030302"
    />
  );
}
