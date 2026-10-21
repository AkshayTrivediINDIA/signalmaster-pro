import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList } from '../../components/ui/feedback';
import { NumberField, SegmentedControl, SelectField } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme } from '../../components/plot/Plot';
import { SignalControls, useSignalBuilder, EXAMPLE_STATES } from '../signals/builder';
import { SignalPlot } from '../signals/SignalPlot';
import { analyzeCtft, analyzeContinuousSpectrum, analyzeDiscreteDft, analyzeDtft, aliasFrequency, type Spectrum, type SpectrumPoint } from '../../core/fourier';
import { toDb } from '../../core/fft';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import type { SignalParams, TimeSpec } from '../../core/signals';

type Method = 'dft' | 'dtft' | 'ctfft' | 'ctft';

const METHODS: Record<Method, { label: string; domain: 'continuous' | 'discrete'; help: string }> = {
  dft: { label: 'DFT / FFT (discrete)', domain: 'discrete', help: 'Exact N-point transform of a discrete sequence with bins at k/N cycles/sample.' },
  dtft: { label: 'DTFT sweep (discrete)', domain: 'discrete', help: 'Continuous frequency function evaluated numerically over a dense ω grid.' },
  ctfft: { label: 'Sampled spectrum (continuous → FFT)', domain: 'continuous', help: 'FFT of the uniformly sampled record, mapped to Hz with fs = 1/Δt.' },
  ctft: { label: 'CTFT integral (continuous)', domain: 'continuous', help: 'Rectangle-rule evaluation of ∫x(t)e^{−jωt}dt over the observation window.' },
};

export default function FourierLab() {
  const pending = usePendingConfig('fourier');
  const [method, setMethod] = useState<Method>('dft');
  const [oneSided, setOneSided] = useState(true);
  const [scale, setScale] = useState<'linear' | 'db'>('linear');
  const [points, setPoints] = useState('1024');
  const [useFft, setUseFft] = useState(true);
  const builder = useSignalBuilder(EXAMPLE_STATES.discreteCosine);
  const plotRef = useRef<HTMLDivElement>(null);
  const magRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const c = pending as Record<string, unknown>;
    if (typeof c.method === 'string' && c.method in METHODS) setMethod(c.method as Method);
    if (typeof c.oneSided === 'boolean') setOneSided(c.oneSided);
    if (typeof c.scale === 'string') setScale(c.scale as 'linear' | 'db');
    if (typeof c.points === 'string') setPoints(c.points);
    if (c.params && c.spec) builder.load({ params: c.params as SignalParams, spec: c.spec as TimeSpec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const requiredDomain = METHODS[method].domain;
  useEffect(() => {
    if (builder.spec.domain !== requiredDomain) {
      builder.setSpecField('domain', requiredDomain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredDomain]);

  const spectrum = useMemo<{ ok: true; value: Spectrum } | { ok: false; error: string }>(() => {
    if (!builder.signal) return { ok: false, error: builder.error ?? 'The source signal is invalid.' };
    const pts = Math.max(16, Math.min(4000, Math.round(Number(points) || 1024)));
    switch (method) {
      case 'dft': {
        const r = analyzeDiscreteDft(builder.signal, { useFft, oneSided });
        return r.ok ? r : { ok: false, error: r.error };
      }
      case 'dtft': {
        const r = analyzeDtft(builder.signal, { points: pts, omegaMin: 0, omegaMax: Math.PI });
        return r.ok ? r : { ok: false, error: r.error };
      }
      case 'ctfft': {
        const r = analyzeContinuousSpectrum(builder.signal, { useFft, oneSided });
        return r.ok ? r : { ok: false, error: r.error };
      }
      case 'ctft': {
        const r = analyzeCtft(builder.signal, { points: pts });
        return r.ok ? r : { ok: false, error: r.error };
      }
    }
  }, [builder.signal, builder.error, method, oneSided, points, useFft]);

  const sp = spectrum.ok ? spectrum.value : null;

  const magY = useMemo(() => {
    if (!sp) return [];
    return scale === 'db' ? sp.points.map((p) => toDb(p.magnitude)) : sp.points.map((p) => p.magnitude);
  }, [sp, scale]);

  const phaseY = useMemo(() => (sp ? sp.points.map((p) => (p.phase * 180) / Math.PI) : []), [sp]);

  const freqX = useMemo(() => (sp ? sp.points.map((p) => p.freq) : []), [sp]);

  const traces = useMemo(
    () => [
      { x: freqX, y: magY, mode: 'lines' as const, name: scale === 'db' ? '|X| (dB)' : '|X|', color: theme.palette[0], width: 1.8 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [freqX, magY, scale, theme],
  );

  const phaseTraces = useMemo(
    () => [{ x: freqX, y: phaseY, mode: 'lines' as const, name: '∠X (degrees)', color: theme.palette[2], width: 1.4 }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [freqX, phaseY, theme],
  );

  const unit = sp?.continuous ? 'Hz' : 'cycles/sample';
  const baseName = `spectrum-${method}`;

  const csv = () => {
    if (!sp) return;
    downloadCsv(
      baseName,
      ['frequency_' + (sp.continuous ? 'hz' : 'cycles_per_sample'), 'omega_rad', 'magnitude', 'phase_rad', 'real', 'imag'],
      sp.points.map((p) => [p.freq, p.omega, p.magnitude, p.phase, p.re, p.im]),
      {
        product: 'SignalMaster Pro',
        module: 'Fourier Transform Lab',
        method: METHODS[method].label,
        source_expression: builder.signal?.formula ?? '',
        frequency_units: unit,
        resolution: `${sp.resolution} ${unit}`,
        sampling_rate: sp.continuous ? `${sp.fs} Hz` : '1 sample/sample',
        nyquist: sp.continuous ? `${sp.fs / 2} Hz` : '0.5 cycles/sample',
        samples: String(sp.n),
        reconstruction_error: sp.reconstructionError.toExponential(3),
        notes: sp.notes.join(' | '),
      },
    );
  };

  const config = { method, oneSided, scale, points, useFft, params: builder.params, spec: builder.spec };

  const peak = useMemo(() => {
    if (!sp || sp.points.length === 0) return null;
    return sp.points.reduce((best, p) => (p.magnitude > best.magnitude ? p : best), sp.points[0]);
  }, [sp]);

  return (
    <div>
      <PageHeader
        title="Fourier Transform Lab"
        description="Move between the time and frequency domains with DFT/FFT, DTFT and numerical CTFT — including the sampling limits that make real analysis imperfect."
        icon="fourier"
        actions={
          <>
            <SaveExperimentButton module="fourier" config={config} defaultName="spectrum analysis" summary={METHODS[method].label} disabled={!sp} />
            <ExportMenu baseName={baseName} onCsv={sp ? csv : undefined} onJson={() => config} pngRef={magRef} onPrint={() => window.print()} disabled={!sp} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Analysis method" icon="settings">
            <div className="space-y-3">
              <SelectField
                label="Transform"
                value={method}
                onChange={(v) => setMethod(v as Method)}
                options={(Object.keys(METHODS) as Method[]).map((m) => ({ value: m, label: METHODS[m].label }))}
                hint={METHODS[method].help}
              />
              {(method === 'dft' || method === 'ctfft') && (
                <SegmentedControl
                  label="Spectrum range"
                  value={oneSided ? 'one' : 'two'}
                  onChange={(v) => setOneSided(v === 'one')}
                  options={[
                    { value: 'one', label: 'One-sided 0…fs/2' },
                    { value: 'two', label: 'Two-sided' },
                  ]}
                />
              )}
              {(method === 'dtft' || method === 'ctft') && (
                <NumberField label="Frequency grid points" value={points} onChange={setPoints} step={256} min={16} max={4000} hint="16–4000 numeric evaluation points." />
              )}
              <SegmentedControl
                label="Magnitude scale"
                value={scale}
                onChange={(v) => setScale(v)}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'db', label: 'dB' },
                ]}
              />
              {(method === 'dft' || method === 'ctfft') && (
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-[11.5px] text-muted">Use radix-2 / Bluestein FFT</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useFft}
                    onClick={() => setUseFft((v) => !v)}
                    className={`relative h-[14px] w-[26px] shrink-0 rounded-[3px] border transition-colors ${
                      useFft ? 'border-brand bg-brand' : 'border-line-strong bg-surface2'
                    }`}
                  >
                    <span
                      className={`absolute top-[1px] h-[10px] w-[10px] rounded-[2px] transition-all ${
                        useFft ? 'left-[13px] bg-white' : 'left-[1px] bg-muted'
                      }`}
                    />
                    <span className="sr-only">Toggle FFT</span>
                  </button>
                </div>
              )}
              {!useFft && (method === 'dft' || method === 'ctfft') && (
                <p className="hint">Direct O(N²) DFT selected — slower, but numerically independent of the FFT implementation (useful for verification).</p>
              )}
            </div>
          </Card>

          <Card title="Source signal" icon="wave">
            <SignalControls builder={builder} idPrefix="four" compact hideDomain />
            <p className="mt-2 text-[11px] text-muted">
              {requiredDomain === 'discrete'
                ? 'Discrete sequences are analysed as an N-point record; the index origin adds only a linear phase term.'
                : 'Continuous signals are analysed through their uniform sample grid; adjust the sample count to control Δt.'}
            </p>
          </Card>

          <Card title="Conventions" icon="book">
            <Equation display latex="X[k] = \\sum_{n=0}^{N-1} x[n]\\,e^{-j2\\pi kn/N}" />
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Bin k ↔ f = k·fs/N. The inverse is scaled by 1/N. One-sided amplitude doubles bins 1…N/2−1 so a sinusoid of amplitude A peaks at A (not A/2).
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {builder.signal && (
            <Card title="Time domain" icon="activity">
              <SignalPlot signal={builder.signal} title="Source signal" height={200} containerRef={plotRef} />
            </Card>
          )}

          <Card title="Magnitude spectrum" subtitle={sp ? `${sp.points.length} frequency points · ${unit}` : undefined} icon="fourier">
            {!sp ? (
              <Alert tone="error" title="Spectrum not computed">
                {!spectrum.ok ? spectrum.error : 'Check the source signal.'}
              </Alert>
            ) : (
              <>
                <Plot
                  traces={traces}
                  title="Magnitude spectrum"
                  summary={`Magnitude of the ${METHODS[method].label} on a ${scale} scale, ${sp.points.length} points between ${fmt(sp.points[0]?.freq ?? 0)} and ${fmt(sp.points[sp.points.length - 1]?.freq ?? 0)} ${unit}.`}
                  containerRef={magRef}
                  height={300}
                  xLabel={`Frequency (${unit})`}
                  yLabel={scale === 'db' ? 'Magnitude (dB)' : 'Magnitude'}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Samples analysed" value={String(sp.n)} />
                  <Metric label="Resolution" value={fmt(sp.resolution)} unit={unit} />
                  <Metric label={sp.continuous ? 'Sampling rate' : 'Nyquist'} value={sp.continuous ? fmt(sp.fs) : '0.5'} unit={sp.continuous ? 'Hz' : 'cyc/s'} />
                  <Metric label="Round-trip error" value={sp.reconstructionError ? sp.reconstructionError.toExponential(1) : 'n/a'} tone={sp.reconstructionError > 1e-6 ? 'warn' : 'ok'} />
                </div>
                {peak && (
                  <p className="mt-2 text-[11.5px] text-muted">
                    Largest magnitude {fmt(peak.magnitude)} at {fmt(peak.freq)} {unit}
                    {!sp.continuous && peak.freq > 0 ? ` (≈ ${fmt(peak.freq * 2)} Ω normalised)`.replace('Ω normalised', 'cycles/sample') : ''}.
                  </p>
                )}
                <div className="mt-3">
                  <NoteList notes={sp.notes} title="Sampling, leakage and accuracy" />
                </div>
              </>
            )}
          </Card>

          {sp && (
            <Card title="Phase spectrum" subtitle="Principal value in (−180°, +180°]; negligible bins are forced to 0" icon="activity">
              <Plot
                traces={phaseTraces}
                title="Phase spectrum"
                summary="Phase in degrees versus frequency. Bins with negligible magnitude are assigned zero phase to avoid meaningless angles."
                height={220}
                xLabel={`Frequency (${unit})`}
                yLabel="Phase (°)"
              />
            </Card>
          )}

          {sp && (
            <Card title="Spectral bins" subtitle="DFT bins with magnitude, phase and complex value" icon="table">
              <DataTable<SpectrumPoint>
                caption="Frequency-domain values"
                maxHeight={300}
                columns={[
                  { key: 'k', header: 'k', align: 'right', render: (_r, i) => String(i) },
                  { key: 'freq', header: `f (${unit})`, align: 'right', render: (r) => fmt(r.freq, 4) },
                  { key: 'magnitude', header: '|X|', align: 'right', render: (r) => fmt(r.magnitude) },
                  { key: 'phase', header: '∠X (°)', align: 'right', render: (r) => fmt((r.phase * 180) / Math.PI, 2) },
                  { key: 're', header: 'Re', align: 'right', render: (r) => fmt(r.re) },
                  { key: 'im', header: 'Im', align: 'right', render: (r) => fmt(r.im) },
                ]}
                rows={sp.points.slice(0, 80)}
              />
              {sp.points.length > 80 && <p className="mt-1 text-[11px] text-muted">Showing the first 80 of {sp.points.length} points — export CSV for all values.</p>}
            </Card>
          )}

          {builder.params.type === 'sine' || builder.params.type === 'cosine' ? (
            <Card title="Aliasing check" icon="alert">
              <p className="text-[12.5px] leading-relaxed text-muted">
                Source frequency f = {builder.params.frequency} {unit}.
                {!sp?.continuous && builder.params.frequency > 0.5
                  ? ` This exceeds the discrete-time Nyquist limit of 0.5 cycles/sample, so it appears at |f − 1| = ${aliasFrequency(builder.params.frequency).toPrecision(4)} cycles/sample.`
                  : ' This is inside the unambiguous range, so the peak should appear at the expected bin.'}
                {sp?.continuous && (
                  <>
                    {' '}
                    Nyquist is {fmt(sp.fs / 2)} Hz, so content up to that frequency is representable; anything faster folds back.
                  </>
                )}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
