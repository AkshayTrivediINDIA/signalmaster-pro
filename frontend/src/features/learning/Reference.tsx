import { useMemo, useState } from 'react';
import { PageHeader, Card } from '../../components/ui/layout';
import { Equation } from '../../components/common/Equation';
import { FORMULA_SHEET } from './content';
import { TextField } from '../../components/ui/fields';
import { EmptyState } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/icons';

/** Searchable formula sheet covering every convention used in the application. */
export default function Reference() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FORMULA_SHEET;
    return FORMULA_SHEET.map((section) => ({
      ...section,
      items: section.items.filter((i) => i.latex.toLowerCase().includes(q) || i.note.toLowerCase().includes(q) || section.category.toLowerCase().includes(q)),
    })).filter((s) => s.items.length > 0);
  }, [query]);

  const total = FORMULA_SHEET.reduce((n, s) => n + s.items.length, 0);

  return (
    <div>
      <PageHeader
        title="Formula Reference"
        description={`${total} formulas covering the exact conventions used throughout SignalMaster Pro. Search by symbol or description.`}
        icon="book"
        actions={
          <button type="button" className="btn-secondary btn-sm no-print" onClick={() => window.print()}>
            <Icon name="print" size={13} /> Print
          </button>
        }
      />

      <div className="mb-4 max-w-md">
        <TextField label="Search formulas" value={query} onChange={setQuery} placeholder="e.g. convolution, aliasing, ROC, z^{-1}" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="search" title="No formulas match your search" description="Try a shorter term such as “DFT”, “pole” or “energy”." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((section) => (
            <Card key={section.category} title={section.category} icon="book">
              <div className="divide-y divide-line">
                {section.items.map((item, i) => (
                  <div key={i} className="py-2">
                    <div className="overflow-x-auto">
                      <Equation latex={item.latex} display />
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{item.note}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card title="Conventions used across the application" icon="info" className="mt-4">
        <ul className="grid gap-1.5 text-[12px] leading-relaxed text-muted sm:grid-cols-2">
          <li>• Coefficients of s or z polynomials are entered highest power first.</li>
          <li>• DFT forward sign is e<sup>−j2πkn/N</sup>, inverse scaled by 1/N.</li>
          <li>• Step convention: u(0) = 1 (right-continuous).</li>
          <li>• Continuous impulse is a distribution: only its area is plotted.</li>
          <li>• Laplace and Z inverses are causal (right-sided) unless stated.</li>
          <li>• Frequencies: Hz for continuous time, cycles/sample for discrete time.</li>
          <li>• Angles are in radians inside expressions; plots may show degrees.</li>
          <li>• Stability is BIBO, evaluated from pole locations under the causal ROC.</li>
        </ul>
      </Card>
    </div>
  );
}
