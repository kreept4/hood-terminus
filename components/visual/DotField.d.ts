/**
 * Types for the vendored DotField, which ships as plain JavaScript.
 *
 * Declared here rather than by converting the component: keeping the vendored
 * file byte-identical to the registry version means it can be re-pulled and
 * diffed without losing local edits.
 */
declare module "@/components/visual/DotField" {
  import type { ComponentType, HTMLAttributes } from "react";

  export type DotFieldProps = {
    dotRadius?: number;
    dotSpacing?: number;
    cursorRadius?: number;
    cursorForce?: number;
    bulgeOnly?: boolean;
    bulgeStrength?: number;
    glowRadius?: number;
    sparkle?: boolean;
    waveAmplitude?: number;
    gradientFrom?: string;
    gradientTo?: string;
    glowColor?: string;
  } & HTMLAttributes<HTMLDivElement>;

  const DotField: ComponentType<DotFieldProps>;
  export default DotField;
}
