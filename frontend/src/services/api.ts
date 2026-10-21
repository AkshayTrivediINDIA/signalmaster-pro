/**
 * Client for the optional FastAPI symbolic engine.
 *
 * The frontend is fully functional without the backend: every numerical module
 * runs in the browser. The backend only adds SymPy-based *symbolic* transforms,
 * so when it is unreachable the UI reports "symbolic engine offline" and keeps
 * the exact numerical/table results available — nothing is faked.
 */

export interface SymbolicLaplaceResponse {
  input: string;
  result: string | null;
  sympy_pretty?: string | null;
  free_symbols: string[];
  assumptions: string[];
  error: string | null;
}

export interface SymbolicZResponse {
  input: string;
  result: string | null;
  free_symbols: string[];
  assumptions: string[];
  error: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  sympy: string;
}

const BASE = import.meta.env?.VITE_API_BASE ?? '';
const TIMEOUT_MS = 12_000;

export class ApiUnavailableError extends Error {
  constructor(message = 'The symbolic engine is not reachable. Numerical and table-based results are still available.') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const msg = (detail && (detail.detail as string)) || `The symbolic engine returned HTTP ${res.status}.`;
      throw new Error(msg);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiUnavailableError('The symbolic engine timed out.');
    if (e instanceof TypeError) throw new ApiUnavailableError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Short health probe with a small timeout, used to show engine status in the UI. */
export async function getHealth(signalTimeoutMs = 3000): Promise<HealthResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), signalTimeoutMs);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function symbolicLaplace(expression: string, inverse = false): Promise<SymbolicLaplaceResponse> {
  return request<SymbolicLaplaceResponse>(inverse ? '/symbolic/laplace/inverse' : '/symbolic/laplace/forward', {
    method: 'POST',
    body: JSON.stringify({ expression }),
  });
}

export async function symbolicZ(expression: string, inverse = false): Promise<SymbolicZResponse> {
  return request<SymbolicZResponse>(inverse ? '/symbolic/z/inverse' : '/symbolic/z/forward', {
    method: 'POST',
    body: JSON.stringify({ expression }),
  });
}

export interface SymbolicSimplifyResponse {
  input: string;
  result: string | null;
  error: string | null;
}

export async function simplifyExpression(expression: string): Promise<SymbolicSimplifyResponse> {
  return request<SymbolicSimplifyResponse>('/symbolic/simplify', { method: 'POST', body: JSON.stringify({ expression }) });
}
