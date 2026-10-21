import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NumberField, SelectField, SegmentedControl, TextAreaField } from '../components/ui/fields';
import { Alert, NoteList, EmptyState } from '../components/ui/feedback';
import { DataTable } from '../components/common/DataTable';
import { Equation } from '../components/common/Equation';
import { SettingsProvider, useSettings } from '../app/AppContext';
import { ToastProvider } from '../components/ui/feedback';
import { ExportMenu } from '../components/common/ExportMenu';
import { SaveExperimentButton } from '../components/common/SaveExperimentButton';
import { CommandMenu } from '../app/CommandMenu';
import { Calculator } from '../features/calculator/CalculatorPage';

function withProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <ToastProvider>{ui}</ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

describe('form primitives', () => {
  it('renders an accessible label and reports validation errors', () => {
    render(<NumberField label="Amplitude" value="abc" onChange={() => undefined} error="Amplitude must be a number." />);
    const input = screen.getByLabelText('Amplitude');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Amplitude must be a number.');
  });

  it('calls onChange for every keystroke', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField label="Frequency" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Frequency'), '12');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('2');
  });

  it('links a select to its hint text', () => {
    render(<SelectField label="Waveform" value="sine" onChange={() => undefined} options={[{ value: 'sine', label: 'Sine' }]} hint="Choose a waveform" />);
    expect(screen.getByLabelText('Waveform')).toHaveAccessibleDescription('Choose a waveform');
  });

  it('exposes segmented options as pressed buttons', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SegmentedControl label="Domain" value="continuous" onChange={onChange} options={[{ value: 'continuous', label: 'CT' }, { value: 'discrete', label: 'DT' }]} />);
    expect(screen.getByRole('button', { name: 'CT' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'DT' }));
    expect(onChange).toHaveBeenCalledWith('discrete');
  });

  it('renders a textarea with a label', () => {
    render(<TextAreaField label="Coefficients" value="1, 2" onChange={() => undefined} />);
    expect(screen.getByLabelText('Coefficients')).toHaveValue('1, 2');
  });
});

describe('feedback components', () => {
  it('uses role=alert for errors and role=status otherwise', () => {
    const { rerender } = render(<Alert tone="error">Broken input</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken input');
    rerender(<Alert tone="info">For your information</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('For your information');
  });

  it('collapses and expands the assumptions list', async () => {
    const user = userEvent.setup();
    render(<NoteList notes={['u(0) = 1', 'Values are sampled']} />);
    expect(screen.queryByText('u(0) = 1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Assumptions & limitations/i }));
    expect(screen.getByText('u(0) = 1')).toBeInTheDocument();
    expect(screen.getByText('Values are sampled')).toBeInTheDocument();
  });

  it('shows an empty state with an action', () => {
    render(<EmptyState title="Nothing here" description="Try again" action={<button type="button">Create</button>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});

describe('data table', () => {
  it('renders a caption, headers and rows', () => {
    render(
      <DataTable
        caption="Convolution output"
        columns={[
          { key: 'n', header: 'n' },
          { key: 'y', header: 'y[n]', align: 'right' },
        ]}
        rows={[
          { n: 0, y: 1 },
          { n: 1, y: 3 },
        ]}
      />,
    );
    expect(screen.getByRole('table', { name: 'Convolution output' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'y[n]' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('renders the empty message when there are no rows', () => {
    render(<DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} emptyMessage="Nothing computed yet" />);
    expect(screen.getByText('Nothing computed yet')).toBeInTheDocument();
  });
});

describe('math rendering', () => {
  it('renders LaTeX through KaTeX and exposes an accessible label', () => {
    const { container } = render(<Equation latex="X[k] = \\sum_{n=0}^{N-1} x[n]e^{-j2\\pi kn/N}" display />);
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(screen.getByLabelText(/X\[k\]/)).toBeInTheDocument();
  });

  it('degrades gracefully on invalid LaTeX instead of throwing', () => {
    // KaTeX is configured with throwOnError: false, so malformed input renders
    // an inline error marker rather than breaking the module.
    const { container } = render(<Equation latex="\\frac{1}{" />);
    expect(container.textContent).toBeTruthy();
    expect(container.querySelector('.katex, code, .katex-error')).toBeTruthy();
  });
});

describe('export menu', () => {
  it('shows only the actions that are available and calls them', async () => {
    const onCsv = vi.fn();
    const onJson = vi.fn();
    const user = userEvent.setup();
    withProviders(<ExportMenu baseName="test" onCsv={onCsv} onJson={onJson} />);
    await user.click(screen.getByRole('button', { name: /Export/i }));
    expect(screen.getByRole('menuitem', { name: /Download CSV/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Download plot PNG/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Download CSV/i }));
    expect(onCsv).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/CSV downloaded/i)).toBeInTheDocument();
  });

  it('renders nothing at all when no export is supported', () => {
    const { container } = withProviders(<ExportMenu baseName="none" />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('save experiment dialog', () => {
  beforeEach(() => localStorage.clear());

  it('validates an empty name and stores a valid one', async () => {
    const user = userEvent.setup();
    withProviders(<SaveExperimentButton module="signals" config={{ params: {}, spec: {} }} defaultName="Sine" />);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Save experiment/i });
    const field = within(dialog).getByLabelText('Experiment name');
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: /Save locally/i }));
    expect(await screen.findByText(/Give the experiment a name/i)).toBeInTheDocument();

    await user.type(field, 'My sine');
    await user.click(within(dialog).getByRole('button', { name: /Save locally/i }));
    // The dialog closes on success and the toast announces the save.
    // The dialog closes on success and the value is persisted.
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: /Save experiment/i })).toBeNull());
    expect(localStorage.getItem('smp.v1.experiments')).toContain('My sine');
  });
});

describe('command menu', () => {
  it('filters modules by keyword and closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    withProviders(<CommandMenu open onClose={onClose} />);
    await user.type(screen.getByRole('combobox', { name: /Search modules/i }), 'stability');
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('reports when nothing matches', async () => {
    const user = userEvent.setup();
    withProviders(<CommandMenu open onClose={() => undefined} />);
    await user.type(screen.getByRole('combobox', { name: /Search modules/i }), 'zzzz');
    expect(screen.getByText(/No module matches/i)).toBeInTheDocument();
  });
});

describe('settings context', () => {
  it('persists precision changes to localStorage', async () => {
    const Probe = () => {
      const { settings, update } = useSettings();
      return (
        <div>
          <span data-testid="precision">{settings.precision}</span>
          <button type="button" onClick={() => update({ precision: 7 })}>
            set
          </button>
        </div>
      );
    };
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'set' }));
    expect(screen.getByTestId('precision')).toHaveTextContent('7');
    expect(localStorage.getItem('smp.v1.settings')).toContain('"precision":7');
  });
});

describe('calculator module', () => {
  it('evaluates the default preset to 20 dB and switches to a division-by-zero error', async () => {
    const user = userEvent.setup();
    withProviders(<Calculator />);
    // The value (20) and its unit (dB) are rendered as separate nodes inside the result banner.
    const values = await screen.findAllByText('20');
    expect(values.length).toBeGreaterThan(0);
    expect(screen.getAllByText('dB').length).toBeGreaterThan(0);
    const field = screen.getByLabelText(/Mathematical expression/i);
    await user.clear(field);
    await user.type(field, '1/0');
    expect(await screen.findByText(/Division by zero/i)).toBeInTheDocument();
    expect(screen.getByText(/Cannot evaluate/i)).toBeInTheDocument();
  });

  it('asks for a value for every free variable', async () => {
    const user = userEvent.setup();
    withProviders(<Calculator />);
    const field = screen.getByLabelText(/Mathematical expression/i);
    await user.clear(field);
    await user.type(field, 'x^2');
    expect(await screen.findByText(/Variable “x” needs a numeric value/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^x\b/), '3');
    const results = await screen.findAllByText('9');
    expect(results.length).toBeGreaterThan(0);
  });
});
