import { useId, type ReactNode } from 'react';
import { Icon } from './icons';

/**
 * Accessible form primitives. Every control renders a real <label> tied to its
 * input via id/aria-describedby, plus optional hint and error text announced
 * with aria-live so validation is not visual-only.
 */

interface BaseProps {
  label: string;
  hint?: string;
  error?: string | null;
  id?: string;
  disabled?: boolean;
  className?: string;
}

function FieldShell({
  label,
  hint,
  error,
  id,
  children,
  className = '',
  inline = false,
}: BaseProps & { children: ReactNode; inline?: boolean }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={inline ? 'mb-1 flex items-center gap-1.5 text-xs font-medium text-muted' : 'label'}>
        {label}
      </label>
      {children}
      {(hint || error) && (
        <p id={id ? `${id}-desc` : undefined} className={error ? 'mt-1 text-[11px] font-medium text-err' : 'hint'} aria-live={error ? 'polite' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export interface NumberFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  suffix?: string;
}

export function NumberField({ value, onChange, label, hint, error, id, step, min, max, placeholder, disabled, className, suffix }: NumberFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className}>
      <div className="relative">
        <input
          id={fieldId}
          type="number"
          inputMode="decimal"
          className={`input font-mono ${error ? 'input-invalid' : ''} ${suffix ? 'pr-12' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${fieldId}-desc` : undefined}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

export interface TextFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
  type?: string;
  autoFocus?: boolean;
}

export function TextField({ value, onChange, label, hint, error, id, placeholder, monospace, disabled, className, type = 'text', autoFocus }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className}>
      <input
        id={fieldId}
        type={type}
        className={`input ${monospace ? 'font-mono' : ''} ${error ? 'input-invalid' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${fieldId}-desc` : undefined}
      />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  monospace?: boolean;
}

export function TextAreaField({ value, onChange, label, hint, error, id, rows = 3, placeholder, monospace = true, className }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className}>
      <textarea
        id={fieldId}
        rows={rows}
        className={`input resize-y ${monospace ? 'font-mono' : ''} ${error ? 'input-invalid' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${fieldId}-desc` : undefined}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}

export function SelectField({ value, onChange, options, label, hint, error, id, disabled, className }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className}>
      <select
        id={fieldId}
        className={`select ${error ? 'input-invalid' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={hint || error ? `${fieldId}-desc` : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      <div className="seg w-full sm:w-auto" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`seg-item flex items-center gap-1.5 ${value === o.value ? 'seg-item-active' : ''}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <Icon name={o.icon} size={13} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckboxField({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex items-start gap-2">
      <input
        id={fieldId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line text-brand accent-[rgb(var(--c-brand))]"
      />
      <div>
        <label htmlFor={fieldId} className="text-xs font-medium text-ink">
          {label}
        </label>
        {hint && <p className="hint">{hint}</p>}
      </div>
    </div>
  );
}
