import { Children, isValidElement } from "react";

/**
 * Shell for the legal pages.
 *
 * A single prose column across a wide screen gives about 150 characters a line,
 * past the point where the eye reliably finds the start of the next one. So the
 * width is filled with something useful instead: a clause index on the left,
 * prose on the right at a readable measure. Long documents become navigable and
 * clause numbers stay citable.
 *
 * The index is derived from the `Clause` children rather than declared a second
 * time, so it cannot drift out of step with the document it indexes.
 */
export function LegalPage({
  title,
  updated,
  intro,
  summary,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  /**
   * Plain-language précis. Labelled as one, because a summary that reads like
   * the operative terms is worse than no summary.
   */
  summary: { heading: string; points: string[]; footnote: string };
  children: React.ReactNode;
}) {
  const index = Children.toArray(children)
    .filter(isValidElement)
    .map(
      (child) =>
        (child as React.ReactElement<{ n?: number; heading?: string }>).props,
    )
    .filter(
      (p): p is { n: number; heading: string } =>
        typeof p.n === "number" && typeof p.heading === "string",
    );

  return (
    <div className="gutter py-14 md:py-20">
      <header className="border-b border-line-soft pb-8">
        <h1 className="text-h1 leading-none font-bold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lead text-ink-2">{intro}</p>
        <p className="mt-3 text-micro text-ink-3">Last updated {updated}</p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <nav
          aria-label="Contents"
          className="lg:col-span-3 lg:sticky lg:top-8 lg:self-start"
        >
          <p className="mb-3 text-body font-semibold text-ink">Contents</p>
          <ol className="flex flex-col gap-2">
            {index.map(({ n, heading }) => (
              <li key={n}>
                <a
                  href={`#clause-${n}`}
                  className="flex gap-2.5 text-body text-ink-3 transition-colors duration-100 hover:text-green"
                >
                  <span className="tnum shrink-0 text-ink-3">{n}</span>
                  <span>{heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-prose lg:col-span-6">{children}</div>

        <aside aria-label="Summary" className="lg:col-span-3">
          <div className="rounded-lg border border-line-soft bg-surface p-5">
            <p className="text-body font-semibold text-ink">
              {summary.heading}
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {summary.points.map((point) => (
                <li key={point} className="text-body leading-relaxed text-ink-2">
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line-soft pt-3 text-micro text-ink-3">
              {summary.footnote}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Clause({
  n,
  heading,
  children,
}: {
  n: number;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`clause-${n}`} className="scroll-mt-8 border-t border-line-soft py-7 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-lead font-semibold text-ink">
        <span className="tnum mr-2.5 text-ink-3">{n}</span>
        {heading}
      </h2>
      {children}
    </section>
  );
}
