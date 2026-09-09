export const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';
const BASE = apiBase;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...(hasBody ? { headers: { 'content-type': 'application/json', ...(init.headers || {}) } } : { headers: { ...(init.headers || {}) } }),
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown };
      code?: string;
      message?: string;
    };
    throw new ApiError(
      res.status,
      body?.error?.code ?? body?.code ?? 'UNKNOWN',
      body?.error?.message ?? body?.message ?? res.statusText,
      body?.error?.details,
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'Server returned non-JSON response');
  }
}

type JsonBody = Record<string, unknown> | unknown[] | null | undefined;

function withBody(method: string, body: JsonBody, extraHeaders?: Record<string, string>): RequestInit {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (extraHeaders) init.headers = extraHeaders;
  return init;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: JsonBody, opts?: { idempotencyKey?: string }) =>
    request<T>(
      path,
      withBody('POST', body, opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined),
    ),
  put: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PUT', body)),
  patch: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PATCH', body)),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};
