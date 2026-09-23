import { Platform } from 'react-native';
import { API_ORIGIN, API_URL } from './config';
import { cookieHeader, loadCookies, storeSetCookie } from './cookieJar';

/**
 * Same contract as apps/web/src/lib/api.ts: `api.get('/cart?businessId=…')`
 * with paths relative to `/api`. Errors surface as `ApiError` carrying the
 * server's `{ error: { code, message, details } }` envelope.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Notified whenever an authenticated call comes back 401 (session expired). */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

function randomKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function request<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
  await loadCookies();
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (Platform.OS !== 'web') {
    headers.origin = API_ORIGIN;
    const cookie = cookieHeader();
    if (cookie) headers.cookie = cookie;
  }

  const url = path.startsWith('http') ? path : API_URL + (path.startsWith('/') ? path : `/${path}`);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      credentials: Platform.OS === 'web' ? 'include' : 'omit',
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK', 'Network unavailable. Check your connection and try again.', e);
  }

  await storeSetCookie(res.headers.get('set-cookie'));

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown } | string;
      code?: string;
      message?: string;
    };
    const errObj = typeof body.error === 'object' ? body.error : undefined;
    const message =
      errObj?.message ?? body.message ?? (typeof body.error === 'string' ? body.error : undefined) ?? res.statusText ?? 'Request failed';
    if (res.status === 401 && !path.startsWith('/auth/sign-in')) {
      unauthorizedListeners.forEach((fn) => fn());
    }
    throw new ApiError(res.status, errObj?.code ?? body.code ?? 'UNKNOWN', message, errObj?.details);
  }
  if (init.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'Server returned a non-JSON response');
  }
}

type JsonBody = Record<string, unknown> | unknown[] | null | undefined;

function withBody(method: string, body: JsonBody, extra?: Record<string, string>): RequestInit {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (extra) init.headers = extra;
  return init;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: JsonBody, opts?: { idempotencyKey?: string | true }) =>
    request<T>(
      path,
      withBody(
        'POST',
        body,
        opts?.idempotencyKey
          ? { 'Idempotency-Key': opts.idempotencyKey === true ? randomKey() : opts.idempotencyKey }
          : undefined,
      ),
    ),
  put: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PUT', body)),
  patch: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PATCH', body)),
  del: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('DELETE', body)),
  /** Multipart upload. Build the FormData with `fileField()` from lib/upload. */
  upload: <T,>(path: string, form: FormData, method: 'POST' | 'PUT' = 'POST') =>
    request<T>(path, { method, body: form }),
  /** Raw Response — for PDFs/CSVs you want to hand to the share sheet. */
  raw: (path: string, init?: RequestInit) => request<Response>(path, { ...init, raw: true }),
};

/** Human-readable message for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

/** Absolute URL for an API-relative asset path (R2 images, invoice PDFs). */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  if (path.startsWith('/api/')) return API_ORIGIN + path;
  if (path.startsWith('/')) return API_ORIGIN + path;
  return `${API_URL}/${path}`;
}

/** Build `?a=1&b=2`, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
