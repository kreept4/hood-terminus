import { clsx } from "@/lib/clsx";

/**
 * The one card in the product.
 *
 * Solid, not glass. The fill is opaque at every stop, so a card never borrows
 * the colour of whatever wash happens to sit behind it. Depth comes from a lit
 * top edge and a grounded shadow rather than from translucency, which is what
 * keeps a dense column of numbers legible on top of it.
 *
 * No pointer tilt and no client JavaScript: this renders on the server and
 * costs nothing to put fifty of on a page.
 */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Adds a hover lift. Only for cards that are themselves a link. */
  interactive?: boolean;
}) {
  return (
    <div className={clsx("panel", interactive && "panel-interactive", className)}>
      {children}
    </div>
  );
}

/**
 * Card header. A label, and optionally one line of qualifying detail that says
 * what the numbers below are measured over.
 */
export function CardHeader({
  label,
  meta,
  aside,
}: {
  label: string;
  meta?: string;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-3">
      <h3 className="text-body font-semibold text-ink">
        {label}
      </h3>
      {aside ?? (meta && <span className="text-micro text-ink-3">{meta}</span>)}
    </header>
  );
}

/** The scrolling region of a card. Never lets the page scroll sideways. */
export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("min-h-0 flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}
