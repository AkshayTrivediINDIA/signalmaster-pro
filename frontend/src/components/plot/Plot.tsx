import { useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import { useTheme } from '../../hooks/useTheme';

export interface PlotTrace {
  x: (number | null)[];
  y: (number | null)[];
  type?: 'scatter' | 'bar';
  mode?: 'lines' | 'markers' | 'lines+markers';
  name?: string;
  color?: string;
  dash?: 'solid' | 'dot' | 'dash';
  width?: number;
  /** Extra Plotly trace options merged in (e.g. `line.shape`). */
  extra?: Record<string, unknown>;
  yaxis?: 'y' | 'y2';
}

export interface PlotProps {
  traces: PlotTrace[];
  title: string;
  /** Text alternative for screen readers / printable views. */
  summary?: string;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  y2Label?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  /** Draws vertical dashed reference lines (e.g. n = 0 or the ROC boundary). */
  vLines?: { x: number; label?: string; color?: string }[];
  /** Attached to the plot container so callers can export the image. */
  containerRef?: React.RefObject<HTMLDivElement>;
  legend?: boolean;
  gridColor?: string;
  className?: string;
  showModeBar?: boolean;
}

/** Theme tokens shared by every chart. */
export function usePlotTheme() {
  const { theme } = useTheme();
  return useMemo(() => {
    const dark = theme === 'dark';
    return {
      dark,
      ink: dark ? '#e2e5ea' : '#16191f',
      muted: dark ? '#949ca8' : '#606772',
      grid: dark ? 'rgba(148,156,168,0.16)' : 'rgba(96,103,114,0.14)',
      surface: dark ? '#15181e' : '#ffffff',
      zeroline: dark ? 'rgba(148,156,168,0.42)' : 'rgba(96,103,114,0.38)',
      // Muted, evenly-spaced hues: distinguishable in both themes and in print,
      // without the saturated primaries that make engineering plots look toy-like.
      palette: ['#1d4e89', '#b45309', '#0f766e', '#6d28d9', '#9f1239', '#0369a1', '#4d7c0f'],
    };
  }, [theme]);
}

/**
 * Interactive Plotly chart wrapper.
 *
 * The chart is re-rendered with `Plotly.react` when data or theme changes and
 * resized through a ResizeObserver, so it stays responsive on mobile/tablet.
 * Plotly's own modebar is hidden; export is handled by the shared ExportMenu
 * so every module exposes the same PNG workflow.
 */
export function Plot({
  traces,
  title,
  summary,
  height = 320,
  xLabel,
  yLabel,
  y2Label,
  xRange,
  yRange,
  vLines,
  containerRef,
  legend = true,
  className = '',
  showModeBar = false,
}: PlotProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = containerRef ?? localRef;
  const theme = usePlotTheme();
  const [error, setError] = useState<string | null>(null);

  const plotlyData = useMemo(() => {
    // Colour by *series*, not by trace: a stem is drawn as a hidden line trace
    // plus a visible marker trace, and both must share one colour. Traces that
    // are excluded from the legend therefore inherit the current series colour
    // instead of consuming the next palette entry.
    let series = 0;
    return traces.map((t) => {
      const hidden = (t.extra as { showlegend?: boolean } | undefined)?.showlegend === false;
      const color = t.color ?? theme.palette[series % theme.palette.length];
      if (!hidden) series += 1;
      return {
        x: t.x,
        y: t.y,
        type: t.type ?? 'scatter',
        mode: t.mode ?? 'lines',
        name: t.name,
        yaxis: t.yaxis,
        line: { color, width: t.width ?? 2, dash: t.dash ?? 'solid', ...(t.extra?.line as object) },
        marker: { color, size: t.mode === 'markers' ? 5 : 4, ...(t.extra?.marker as object) },
        ...(t.extra ?? {}),
      };
    });
  }, [traces, theme]);

  const layout = useMemo(
    () => ({
      height,
      margin: { l: 56, r: y2Label ? 56 : 16, t: 14, b: 46 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter Variable, Inter, system-ui, sans-serif', size: 11, color: theme.muted },
      hovermode: 'closest',
      showlegend: legend && traces.length > 1,
      legend: { orientation: 'h', y: -0.22, x: 0, font: { size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
      xaxis: {
        title: { text: xLabel, font: { size: 11, color: theme.muted } },
        gridcolor: theme.grid,
        zerolinecolor: theme.zeroline,
        zerolinewidth: 1,
        linecolor: theme.grid,
        range: xRange,
        ticks: 'outside',
        tickcolor: theme.grid,
        tickfont: { size: 10 },
        automargin: true,
      },
      yaxis: {
        title: { text: yLabel, font: { size: 11, color: theme.muted } },
        gridcolor: theme.grid,
        zerolinecolor: theme.zeroline,
        zerolinewidth: 1,
        linecolor: theme.grid,
        range: yRange,
        tickfont: { size: 10 },
        automargin: true,
      },
      ...(y2Label
        ? {
            yaxis2: {
              title: { text: y2Label, font: { size: 11, color: theme.muted } },
              overlaying: 'y',
              side: 'right',
              gridcolor: 'rgba(0,0,0,0)',
              tickfont: { size: 10 },
              automargin: true,
            },
          }
        : {}),
      shapes: (vLines ?? []).map((v) => ({
        type: 'line',
        x0: v.x,
        x1: v.x,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: v.color ?? theme.zeroline, width: 1, dash: 'dot' },
      })),
      annotations: (vLines ?? [])
        .filter((v) => v.label)
        .map((v) => ({
          x: v.x,
          y: 1,
          yref: 'paper',
          text: v.label,
          showarrow: false,
          font: { size: 9, color: theme.muted },
          yshift: 8,
        })),
    }),
    [height, xLabel, yLabel, y2Label, xRange, yRange, vLines, theme, legend, traces.length],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    Plotly.react(el, plotlyData, layout, {
      displayModeBar: showModeBar,
      displaylogo: false,
      responsive: true,
      scrollZoom: false,
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Plot could not be rendered.');
    });
    return () => {
      cancelled = true;
    };
  }, [plotlyData, layout, ref, showModeBar]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try {
        Plotly.Plots.resize(el);
      } catch {
        /* the plot may not exist yet */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  useEffect(
    () => () => {
      const el = ref.current;
      if (el) {
        try {
          Plotly.purge(el);
        } catch {
          /* already gone */
        }
      }
    },
    [ref],
  );

  return (
    <figure className={`relative ${className}`}>
      <figcaption className="sr-only">
        {title}. {summary ?? ''}
      </figcaption>
      <div
        ref={ref}
        role="img"
        aria-label={`${title}. ${summary ?? ''}`}
        style={{ width: '100%', height }}
      />
      {error && <p className="note-err absolute inset-x-3 bottom-3">{error}</p>}
      {summary && (
        <details className="mt-1 text-[11px] text-muted">
          <summary className="cursor-pointer select-none hover:text-ink">Data description</summary>
          <p className="mt-1 leading-relaxed">{summary}</p>
        </details>
      )}
    </figure>
  );
}

/** Export the current chart as a PNG using Plotly's in-browser renderer. */
export async function exportPlotPng(el: HTMLDivElement | null, filename: string): Promise<void> {
  if (!el) throw new Error('No chart available to export.');
  await Plotly.downloadImage(el, {
    format: 'png',
    filename: filename.replace(/\.png$/i, ''),
    width: 1200,
    height: 700,
    scale: 2,
  });
}
