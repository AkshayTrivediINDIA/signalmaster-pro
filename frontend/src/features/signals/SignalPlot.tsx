import { useMemo } from 'react';
import { Plot, type PlotTrace } from '../../components/plot/Plot';
import type { Signal } from '../../core/signals';

export interface SignalTraceOptions {
  name?: string;
  color?: string;
  /** Force stems even for a continuous-domain signal (used for impulses). */
  stems?: boolean;
  dash?: 'solid' | 'dot' | 'dash';
  width?: number;
  showMarkers?: boolean;
}

/**
 * Build Plotly traces for a signal.
 *
 * Discrete sequences are drawn as stems (a vertical line from zero plus a
 * marker) because the signal has no value between samples. Continuous signals
 * are drawn as lines. Continuous impulses are drawn as stems too, since a
 * δ(t) has no plottable finite height.
 */
export function signalTraces(signal: Signal, opts: SignalTraceOptions = {}): PlotTrace[] {
  const { name = 'signal', color, stems, dash = 'solid', width = 2, showMarkers } = opts;
  const isDiscrete = signal.domain === 'discrete';
  const isImpulse = signal.params.type === 'impulse';
  const useStems = stems ?? (isDiscrete || isImpulse);

  if (useStems) {
    const stemX: (number | null)[] = [];
    const stemY: (number | null)[] = [];
    for (let i = 0; i < signal.axis.length; i++) {
      stemX.push(signal.axis[i], signal.axis[i], null);
      stemY.push(0, signal.values[i], null);
    }
    return [
      { x: stemX, y: stemY, mode: 'lines', name: `${name} (stem)`, color, width: 1.4, extra: { hoverinfo: 'skip', showlegend: false } },
      { x: signal.axis, y: signal.values, mode: 'markers', name, color, extra: { marker: { size: 6 } } },
    ];
  }
  return [
    {
      x: signal.axis,
      y: signal.values,
      mode: showMarkers ? 'lines+markers' : 'lines',
      name,
      color,
      dash,
      width,
    },
  ];
}

export function SignalPlot({
  signal,
  title,
  summary,
  color,
  height = 320,
  containerRef,
  xLabel,
  yLabel,
  className,
}: {
  signal: Signal;
  title: string;
  summary?: string;
  color?: string;
  height?: number;
  containerRef?: React.RefObject<HTMLDivElement>;
  xLabel?: string;
  yLabel?: string;
  className?: string;
}) {
  const traces = useMemo(() => signalTraces(signal, { color }), [signal, color]);
  const autoSummary = useMemo(() => {
    const n = signal.values.length;
    const min = Math.min(...signal.values);
    const max = Math.max(...signal.values);
    return (
      summary ??
      `${signal.domain === 'continuous' ? 'Continuous-time rendering' : 'Discrete sequence'} with ${n} ${signal.domain === 'continuous' ? 'time samples' : 'samples'}. ` +
        `Values range from ${min.toPrecision(4)} to ${max.toPrecision(4)}. Expression: ${signal.formula}.`
    );
  }, [signal, summary]);

  return (
    <Plot
      traces={traces}
      title={title}
      summary={autoSummary}
      height={height}
      containerRef={containerRef}
      xLabel={xLabel ?? (signal.domain === 'continuous' ? 'Time t (s)' : 'Sample index n')}
      yLabel={yLabel ?? 'Amplitude'}
      className={className}
    />
  );
}
