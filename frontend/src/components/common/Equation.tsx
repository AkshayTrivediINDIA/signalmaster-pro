import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Render a LaTeX expression with KaTeX.
 *
 * `throwOnError: false` means an invalid formula degrades to red source text
 * rather than crashing the module; the raw string is also exposed to screen
 * readers via the aria-label so equations are never purely visual.
 *
 * `trust: false` keeps KaTeX from emitting URLs/HTML from \href-like commands,
 * and `maxExpand` bounds macro expansion. All LaTeX in the app is authored
 * constants (never user input), so this is defence in depth.
 */
export function Equation({
  latex,
  display = false,
  className = '',
  label,
}: {
  latex: string;
  display?: boolean;
  className?: string;
  label?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html',
        // Never allow \href / \includegraphics style commands to emit URLs.
        trust: false,
        maxExpand: 1000,
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (!html) {
    return (
      <code className="break-all rounded bg-surface2 px-1.5 py-0.5 font-mono text-[12px] text-err" aria-label={`invalid formula ${latex}`}>
        {latex}
      </code>
    );
  }
  return (
    <span
      className={`inline-block max-w-full overflow-x-auto ${className}`}
      aria-label={label ?? latex.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default Equation;
