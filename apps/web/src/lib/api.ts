const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText, body?.error?.details);
  }
  return res.json() as Promise<T>;
}

type JsonBody = Record<string, unknown> | unknown[] | null | undefined;

function withBody(method: string, body: JsonBody): RequestInit {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  return init;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('POST', body)),
  patch: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PATCH', body)),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};
