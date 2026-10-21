import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { ThemeProvider } from '../hooks/useTheme';
import { SettingsProvider } from './AppContext';
import { ToastProvider, Spinner } from '../components/ui/feedback';
import { Dashboard } from '../features/dashboard/Dashboard';
import { ErrorBoundary } from './ErrorBoundary';

// Module code is split so the initial dashboard load stays small.
const SignalGenerator = lazy(() => import('../features/signals/SignalGenerator'));
const SignalOperations = lazy(() => import('../features/operations/SignalOperations'));
const ConvolutionLab = lazy(() => import('../features/convolution/ConvolutionLab'));
const FourierLab = lazy(() => import('../features/fourier/FourierLab'));
const LaplaceLab = lazy(() => import('../features/laplace/LaplaceLab'));
const ZTransformLab = lazy(() => import('../features/ztransform/ZTransformLab'));
const LtiAnalyzer = lazy(() => import('../features/lti/LtiAnalyzer'));
const Calculator = lazy(() => import('../features/calculator/Calculator'));
const Learning = lazy(() => import('../features/learning/Learning'));
const Reference = lazy(() => import('../features/learning/Reference'));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size={18} label={`Loading ${label}`} />
        Loading {label}…
      </div>
    </div>
  );
}

/**
 * The standalone single-file build (`npm run build:standalone`) is opened from
 * a blob/file URL where history-based routing has no server to fall back on, so
 * it uses hash routing. The normal build keeps clean URLs.
 */
const StandaloneRouter = import.meta.env.VITE_STANDALONE === '1' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SettingsProvider>
          <ToastProvider>
            <StandaloneRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route
                    path="signals"
                    element={
                      <Suspense fallback={<Loading label="Signal Generator" />}>
                        <SignalGenerator />
                      </Suspense>
                    }
                  />
                  <Route
                    path="operations"
                    element={
                      <Suspense fallback={<Loading label="Signal Operations" />}>
                        <SignalOperations />
                      </Suspense>
                    }
                  />
                  <Route
                    path="convolution"
                    element={
                      <Suspense fallback={<Loading label="Convolution Lab" />}>
                        <ConvolutionLab />
                      </Suspense>
                    }
                  />
                  <Route
                    path="fourier"
                    element={
                      <Suspense fallback={<Loading label="Fourier Lab" />}>
                        <FourierLab />
                      </Suspense>
                    }
                  />
                  <Route
                    path="laplace"
                    element={
                      <Suspense fallback={<Loading label="Laplace Lab" />}>
                        <LaplaceLab />
                      </Suspense>
                    }
                  />
                  <Route
                    path="z-transform"
                    element={
                      <Suspense fallback={<Loading label="Z-Transform Lab" />}>
                        <ZTransformLab />
                      </Suspense>
                    }
                  />
                  <Route
                    path="systems"
                    element={
                      <Suspense fallback={<Loading label="LTI System Analyzer" />}>
                        <LtiAnalyzer />
                      </Suspense>
                    }
                  />
                  <Route
                    path="calculator"
                    element={
                      <Suspense fallback={<Loading label="Engineering Calculator" />}>
                        <Calculator />
                      </Suspense>
                    }
                  />
                  <Route
                    path="learning"
                    element={
                      <Suspense fallback={<Loading label="Learning" />}>
                        <Learning />
                      </Suspense>
                    }
                  />
                  <Route
                    path="reference"
                    element={
                      <Suspense fallback={<Loading label="Formula reference" />}>
                        <Reference />
                      </Suspense>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </StandaloneRouter>
          </ToastProvider>
        </SettingsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
