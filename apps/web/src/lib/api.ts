export const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';
const BASE = apiBase;

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
  put: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PUT', body)),
  patch: <T,>(path: string, body?: JsonBody) => request<T>(path, withBody('PATCH', body)),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};
