import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";

/**
 * A market board.
 *
 * No title bar. The section heading directly above already names the board,
 * and repeating it inside the card, then restating the filters beside it, put
 * three lines of chrome above every table. `action` is the one thing allowed
 * in that space, and only when there is something to press.
 */
export function Board({
  action,
  children,
  className,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx("overflow-hidden", className)}>
      {action && (
        <div className="flex justify-end border-b border-line-soft px-3 py-2">
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}
