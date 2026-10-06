import { clsx } from "@/lib/clsx";

/**
 * A page section.
 *
 * `min-height: 100dvh`, never `height`: a section fills the screen when its
 * content is short and flows past it when a board runs to thirty rows. dvh
 * rather than vh is what stops the last row hiding under collapsing mobile
 * browser chrome.
 *
 * The heading is set at the display step and hung on a full-bleed rule. Earlier
 * this was a small semibold label floating above a card, which read as a form
 * field label rather than as the title of the screen it sits on.
 *
 * No subtitle. Every one that was written under these headings restated the
 * heading in a longer sentence, which is what a subtitle is for only when the
 * heading is doing a bad job.
 */
export function Section({
  id,
  title,
  icon,
  aside,
  children,
  className,
}: {
  id?: string;
  title?: string;
  /** Decorative. The heading beside it already names the section. */
  icon?: React.ReactNode;
  /** Sits opposite the title. A control, never a second label. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={clsx(
        /**
         * Centred by auto margins rather than `justify-center`.
         *
         * `justify-center` on a flex column centres the content and then clips
         * whatever does not fit, in both directions: once the screener grew to
         * fifty rows the top of the table was pushed above the section and
         * could not be scrolled back to. Auto margins centre short content the
         * same way and simply let tall content start at the top.
         */
        "gutter flex min-h-dvh w-full flex-col py-14 md:py-20",
        id && "scroll-mt-20",
        className,
      )}
    >
      <div className="my-auto w-full">
      {(title || aside) && (
        <header className="mb-6 border-b border-line-soft pb-5 md:mb-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-3.5">
              {icon && (
                <span aria-hidden="true" className="shrink-0 text-green">
                  {icon}
                </span>
              )}
              {title && (
                <h2 className="text-h1 leading-none font-bold tracking-tight text-ink">
                  {title}
                </h2>
              )}
            </div>
            {aside}
          </div>
        </header>
      )}
      {children}
      </div>
    </section>
  );
}
