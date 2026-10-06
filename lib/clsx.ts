/**
 * Minimal class joiner. A dependency would earn its place if we needed
 * conflict resolution, and we do not.
 */
export function clsx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
