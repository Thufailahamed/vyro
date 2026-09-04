const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

type Body = unknown;
const init = (method: string, body?: Body): RequestInit => {
  const o: RequestInit = { method };
  if (body !== undefined) o.body = JSON.stringify(body);
  return o;
};

export const api = {
  get: <T,>(p: string) => request<T>(p),
  post: <T,>(p: string, b?: Body) => request<T>(p, init('POST', b)),
};
