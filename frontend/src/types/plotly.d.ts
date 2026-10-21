declare module 'plotly.js-basic-dist-min' {
  const Plotly: {
    newPlot: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
    react: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
    relayout: (el: HTMLElement, update: unknown) => Promise<unknown>;
    downloadImage: (el: HTMLElement, opts: Record<string, unknown>) => Promise<string>;
    Plots: { resize: (el: HTMLElement) => void };
  };
  export default Plotly;
}
