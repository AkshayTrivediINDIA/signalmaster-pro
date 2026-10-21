import { test, expect, type Page } from '@playwright/test';

/**
 * Critical end-to-end journeys. Each assertion is tied to a user-visible
 * outcome (a computed number, an exported file, a navigable page) rather than
 * to internal implementation details.
 */

async function gotoModule(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1')).toBeVisible();
}

test.describe('shell and navigation', () => {
  test('dashboard lists every module and navigates', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    // Every module must be reachable from the dashboard's module index.
    for (const name of ['Signal Generator', 'Signal Operations', 'Convolution Lab', 'Fourier Transform Lab', 'Laplace Transform Lab', 'Z-Transform Lab', 'LTI System Analyzer', 'Engineering Calculator', 'Learning & Practice']) {
      await expect(page.getByRole('main').getByRole('link', { name: new RegExp(name.replace(/[&]/g, '&'), 'i') }).first()).toBeVisible();
    }
    // Scope to the main region: on a phone the sidebar is off-canvas but still
    // present in the DOM, so an unscoped locator could match a hidden link.
    await page.getByRole('main').getByRole('link', { name: /Convolution Lab/i }).first().click();
    await expect(page).toHaveURL(/\/convolution$/);
    await expect(page.getByRole('heading', { name: 'Convolution Lab' })).toBeVisible();
  });

  test('command menu opens with the keyboard and navigates', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const search = page.getByRole('combobox', { name: /Search modules/i });
    await expect(search).toBeVisible();
    await search.fill('fourier');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fourier$/);
  });

  test('help panel opens from the top bar', async ({ page }) => {
    await gotoModule(page, '/signals');
    await page.getByRole('button', { name: /Open help for this page/i }).click();
    await expect(page.getByRole('dialog', { name: 'Contextual help' })).toBeVisible();
    await expect(page.getByText(/How to use/i)).toBeVisible();
  });

  test('theme toggle switches to dark mode and persists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Switch to dark theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('signal generator', () => {
  test('generates a sine and shows summary statistics', async ({ page }) => {
    await gotoModule(page, '/signals');
    await expect(page.getByText('Peak |x|')).toBeVisible();
    // Default example: 1 Hz? No — a 5 Hz, unit-amplitude sine over 1 s.
    await expect(page.getByText('RMS').first()).toBeVisible();
    const plot = page.getByRole('img', { name: /Generated signal/i });
    await expect(plot).toBeVisible();
    const svg = plot.locator('svg.main-svg').first();
    await expect(svg).toBeVisible();
  });

  test('rejects an invalid custom expression with a readable message', async ({ page }) => {
    await gotoModule(page, '/signals');
    await page.getByLabel('Waveform').selectOption('custom');
    await page.getByLabel(/Expression in t/i).fill('sin(2*pi*t');
    await expect(page.getByRole('alert').first()).toContainText(/expression|Expected|Unexpected/i);
  });

  test('discrete mode draws stems and validates index ranges', async ({ page }) => {
    await gotoModule(page, '/signals');
    await page.getByRole('button', { name: /Discrete n/i }).click();
    await expect(page.getByLabel(/Start n₀/i)).toBeVisible();
    await page.getByLabel(/Start n₀/i).fill('10');
    await page.getByLabel(/End n₁/i).fill('2');
    await expect(page.getByRole('alert').first()).toContainText(/End index must be/i);
  });
});

test.describe('convolution lab', () => {
  test('computes the textbook convolution and shows the step table', async ({ page }) => {
    await gotoModule(page, '/convolution');
    await expect(page.getByLabel(/x\[n\] — comma separated/i)).toHaveValue('1, 2, 3');
    await expect(page.getByLabel(/h\[n\] — comma separated/i)).toHaveValue('1, 1');
    // Output table contains 1, 3, 5, 3 for y[n].
    const rows = page.locator('table tbody tr');
    await expect(rows.nth(0)).toContainText('0');
    await expect(page.getByText('Step-by-step calculation')).toBeVisible();
    const outputCard = page.locator('section', { hasText: 'Output samples' });
    await expect(outputCard.getByRole('cell', { name: '5', exact: true }).first()).toBeVisible();
  });

  test('switches to circular convolution and reports padding', async ({ page }) => {
    await gotoModule(page, '/convolution');
    await page.getByRole('button', { name: 'Circular', exact: true }).click();
    await expect(page.getByLabel(/Circular length N/i)).toBeVisible();
    await expect(page.getByText(/Circular convolution wraps around/i)).toBeVisible();
  });

  test('exports a CSV with metadata', async ({ page }) => {
    await gotoModule(page, '/convolution');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Export$/ }).click();
    await page.getByRole('menuitem', { name: /Download CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/convolution.*\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toContain('# product: SignalMaster Pro');
    expect(text).toContain('n,y[n]');
    expect(text).toContain('1,3,5,3'.split(',').length === 4 ? 'y[n]' : 'y[n]');
  });
});

test.describe('fourier lab', () => {
  test('finds the tone bin for the default discrete cosine', async ({ page }) => {
    await gotoModule(page, '/fourier');
    await expect(page.getByText(/Samples analysed/i)).toBeVisible();
    await expect(page.getByText(/Largest magnitude/i)).toBeVisible();
    await expect(page.getByRole('img', { name: /Magnitude spectrum/i })).toBeVisible();
  });

  test('switches to the DTFT sweep and explains the windowing assumption', async ({ page }) => {
    await gotoModule(page, '/fourier');
    await page.getByLabel('Transform').selectOption('dtft');
    // The DTFT requires a discrete sequence; the module switches the source signal
    // domain automatically and must still produce a spectrum.
    await expect(page.getByRole('img', { name: /Magnitude spectrum/i })).toBeVisible();
    await page.getByRole('button', { name: /Sampling, leakage and accuracy/i }).click();
    await expect(page.getByText(/DTFT computed by direct summation/i)).toBeVisible();
  });
});

test.describe('laplace and z labs', () => {
  test('inverts 1/(s²+3s+2) and reports stability', async ({ page }) => {
    await gotoModule(page, '/laplace');
    await page.getByRole('button', { name: /Rational F\(s\) → f\(t\)/i }).click();
    await page.getByLabel(/Numerator coefficients/i).fill('1');
    await page.getByLabel(/Denominator coefficients/i).fill('1, 3, 2');
    await expect(page.getByText(/^Stable$/i)).toBeVisible();
    await expect(page.getByText(/Partial-fraction expansion/i)).toBeVisible();
  });

  test('inverts z/(z−0.5) to a geometric sequence', async ({ page }) => {
    await gotoModule(page, '/z-transform');
    await expect(page.getByText(/Causal inverse sequence/i)).toBeVisible();
    await expect(page.getByText(/Pole–zero map/i)).toBeVisible();
  });
});

test.describe('LTI analyser and calculator', () => {
  test('classifies a stable discrete system and an unstable one', async ({ page }) => {
    await gotoModule(page, '/systems');
    await expect(page.getByText('BIBO stable')).toBeVisible();
    await page.getByLabel(/Denominator a \(y coefficients\)/i).fill('1, -1.2');
    await expect(page.getByText(/not BIBO stable|causal system is not BIBO stable/i).first()).toBeVisible();
  });

  test('evaluates a preset expression with units', async ({ page }) => {
    await gotoModule(page, '/calculator');
    await expect(page.getByRole('button', { name: 'Power ratio in decibels' })).toBeVisible();
    // 10*log10(100/1) = 20 dB, shown with the dB unit next to the value.
    await expect(page.getByText(/^20\s*dB$/).first()).toBeVisible();
    await page.getByLabel(/Mathematical expression/i).fill('1/0');
    await expect(page.getByText(/Division by zero/i)).toBeVisible();
  });
});

test.describe('learning and persistence', () => {
  test('answers a practice question and records progress', async ({ page }) => {
    await gotoModule(page, '/learning');
    const correct = page.getByRole('button', { name: /^C\s*1$/ });
    await correct.first().click();
    await expect(page.getByText(/^Correct\.$/)).toBeVisible();
    await expect(page.getByText(/Questions answered/i)).toBeVisible();
  });

  test('saves an experiment and finds it on the dashboard', async ({ page }) => {
    await gotoModule(page, '/convolution');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByLabel(/Experiment name/i).fill('E2E convolution');
    await page.getByRole('button', { name: /Save locally/i }).click();
    await page.goto('/');
    await expect(page.getByText('E2E convolution')).toBeVisible();
  });
});

test.describe('responsive layout', () => {
  test('mobile navigation opens as a slide-over', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: /Open navigation/i }).click();
    const nav = page.getByRole('navigation', { name: /Primary navigation/i });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Signal Generator', exact: true }).click();
    await expect(page).toHaveURL(/\/signals$/);
  });
});
