import { useCallback, useReducer, useRef } from 'react';
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { API_ORIGIN, API_URL } from '@/lib/config';
import { cookieHeader, loadCookies } from '@/lib/cookieJar';

/**
 * Ask VYRO SSE client — mobile port of apps/web/src/ask/hooks/useVyroAI.ts.
 * Uses expo/fetch for streaming response bodies on native.
 */

export interface VyroAIAction {
  type: string;
  label: string;
  href: string;
}

export interface ToolEntry {
  name: string;
  label: string;
  startedAt?: number;
  durationMs?: number;
  ok?: boolean;
}

export interface ComponentEnvelope {
  type: string;
  data: Record<string, unknown>;
}

export interface ChatTurn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  components: ComponentEnvelope[];
  actions: VyroAIAction[];
  tools: ToolEntry[];
  error?: { code: string; message: string };
  meta?: { provider: string; model: string; latencyMs: number; tokensIn: number; tokensOut: number; intent: string };
  requestId?: string;
}

export interface VyroAIState {
  turns: ChatTurn[];
  loading: boolean;
  status?: string | undefined;
  error?: { code: string; message: string } | undefined;
}

const initial: VyroAIState = { turns: [], loading: false };

type Action =
  | { type: 'user'; turn: ChatTurn }
  | { type: 'assistant_start'; turn: ChatTurn }
  | { type: 'status'; stage: string }
  | { type: 'component'; c: ComponentEnvelope }
  | { type: 'final'; summary: string; actions: VyroAIAction[] }
  | { type: 'tool_call'; entry: ToolEntry }
  | { type: 'tool_result'; name: string; durationMs?: number; ok: boolean }
  | { type: 'meta'; meta: NonNullable<ChatTurn['meta']> }
  | { type: 'turn_error'; code: string; message: string }
  | { type: 'done' }
  | { type: 'clear' };

function reducer(s: VyroAIState, a: Action): VyroAIState {
  switch (a.type) {
    case 'user':
      return { ...s, turns: [...s.turns, a.turn], loading: true, error: undefined, status: undefined };
    case 'assistant_start':
      return { ...s, turns: [...s.turns, a.turn] };
    case 'status':
      return { ...s, status: a.stage };
    case 'component': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') return s;
      turns[turns.length - 1] = { ...last, components: [...last.components, a.c] };
      return { ...s, turns };
    }
    case 'final': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') return s;
      turns[turns.length - 1] = { ...last, text: a.summary, actions: a.actions };
      return { ...s, turns, loading: false, status: undefined };
    }
    case 'tool_call': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') return s;
      turns[turns.length - 1] = { ...last, tools: [...last.tools, a.entry] };
      return { ...s, turns };
    }
    case 'tool_result': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') return s;
      const tools = last.tools.map((t) =>
        t.name === a.name && a.durationMs !== undefined ? { ...t, durationMs: a.durationMs, ok: a.ok } : t,
      );
      turns[turns.length - 1] = { ...last, tools };
      return { ...s, turns };
    }
    case 'meta': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') return s;
      turns[turns.length - 1] = { ...last, meta: a.meta };
      return { ...s, turns };
    }
    case 'turn_error': {
      const turns = s.turns.slice();
      const last = turns[turns.length - 1];
      const err = { code: a.code, message: a.message };
      if (last && last.role === 'assistant') {
        turns[turns.length - 1] = { ...last, error: err };
      }
      return { ...s, turns, loading: false, status: undefined, error: err };
    }
    case 'done':
      return { ...s, loading: false, status: undefined };
    case 'clear':
      return { ...initial };
  }
}

/** Parse an SSE stream into [type, data] tuples. */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<[string, string]> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let type = '';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) type = line.slice(7).trim();
          else if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (type && data) yield [type, data];
      }
    }
  } finally {
    reader.releaseLock();
  }
}

let turnId = 0;
const HISTORY_LIMIT = 10;

export function useVyroAI() {
  const [state, dispatch] = useReducer(reducer, initial);
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const send = useCallback(async (prompt: string, opts?: { businessId?: string | undefined; context?: unknown }) => {
    const text = prompt.trim();
    if (!text) return;
    const requestId =
      globalThis.crypto?.randomUUID?.() ?? `vyro-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    dispatch({ type: 'user', turn: { id: ++turnId, role: 'user', text, components: [], actions: [], tools: [] } });
    dispatch({
      type: 'assistant_start',
      turn: { id: ++turnId, role: 'assistant', text: '', components: [], actions: [], tools: [], requestId },
    });
    try {
      await loadCookies();
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      };
      if (Platform.OS !== 'web') {
        headers.origin = API_ORIGIN;
        const cookie = cookieHeader();
        if (cookie) headers.cookie = cookie;
      }
      const res = await expoFetch(`${API_URL}/ai/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: text,
          ...(opts?.businessId ? { businessId: opts.businessId } : {}),
          ...(opts?.context ? { context: opts.context } : {}),
          conversation: history.current.slice(-HISTORY_LIMIT),
          requestId,
        }),
      });

      if (!res.ok || !res.body) {
        let code = 'HTTP_ERROR';
        let message = `Server returned HTTP ${res.status}`;
        try {
          const errData = (await res.json()) as { error?: { code?: string; message?: string } } | null;
          if (errData?.error?.message) {
            message = errData.error.message;
            code = errData.error.code || code;
          }
        } catch {
          if (res.status === 404) {
            code = 'ENGINE_UNAVAILABLE';
            message = 'AI engine could not be reached. Please try again later.';
          } else if (res.status === 401) {
            code = 'UNAUTHORIZED';
            message = 'Your session has expired. Please sign in again.';
          } else if (res.status === 403) {
            code = 'FORBIDDEN';
            message = 'You are not authorized to query procurement intelligence for this business.';
          } else if (res.status === 503) {
            code = 'AI_DISABLED';
            message = 'VYRO AI is temporarily offline. Please try again shortly.';
          }
        }
        dispatch({ type: 'turn_error', code, message });
        return;
      }

      let sawFinal = false;
      let sawError = false;
      for await (const [type, data] of parseSSE(res.body)) {
        try {
          const json = JSON.parse(data);
          switch (type) {
            case 'status': {
              if (typeof json.stage === 'string') dispatch({ type: 'status', stage: json.stage });
              break;
            }
            case 'tool_call': {
              dispatch({
                type: 'tool_call',
                entry: {
                  name: String(json.name ?? 'tool'),
                  label: String(json.label ?? json.name ?? 'Working'),
                  startedAt: typeof json.startedAt === 'number' ? json.startedAt : Date.now(),
                },
              });
              break;
            }
            case 'tool_result': {
              dispatch({
                type: 'tool_result',
                name: String(json.name ?? ''),
                ...(typeof json.durationMs === 'number' ? { durationMs: json.durationMs } : {}),
                ok: json.ok !== false,
              });
              break;
            }
            case 'component': {
              if (typeof json.type === 'string') {
                dispatch({ type: 'component', c: { type: json.type, data: (json.data ?? {}) as Record<string, unknown> } });
              }
              break;
            }
            case 'final': {
              sawFinal = true;
              const summary = String(json.summary ?? '');
              const actions = Array.isArray(json.actions) ? (json.actions as VyroAIAction[]) : [];
              dispatch({ type: 'final', summary, actions });
              history.current.push({ role: 'user', content: text });
              history.current.push({ role: 'assistant', content: summary });
              history.current = history.current.slice(-HISTORY_LIMIT);
              break;
            }
            case 'error': {
              sawError = true;
              dispatch({ type: 'turn_error', code: String(json.code ?? 'ERROR'), message: String(json.message ?? 'Something went wrong.') });
              break;
            }
            case 'meta': {
              if (typeof json.provider === 'string' && typeof json.model === 'string') {
                dispatch({
                  type: 'meta',
                  meta: {
                    provider: json.provider,
                    model: json.model,
                    latencyMs: Number(json.latencyMs ?? 0),
                    tokensIn: Number(json.tokensIn ?? 0),
                    tokensOut: Number(json.tokensOut ?? 0),
                    intent: String(json.intent ?? ''),
                  },
                });
              }
              break;
            }
          }
        } catch {
          // skip malformed frames
        }
      }
      if (!sawFinal && !sawError) dispatch({ type: 'done' });
    } catch (err) {
      dispatch({ type: 'turn_error', code: 'NETWORK', message: err instanceof Error ? err.message : 'Network error' });
    }
  }, []);  

  const clear = useCallback(() => {
    history.current = [];
    dispatch({ type: 'clear' });
  }, []);

  const regenerate = useCallback(async () => {
    for (let i = state.turns.length - 1; i >= 0; i--) {
      const t = state.turns[i]!;
      if (t.role === 'user') {
        await send(t.text);
        return;
      }
    }
  }, [state.turns, send]);

  return { state, send, clear, regenerate };
}
