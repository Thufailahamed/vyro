import { useReducer, useCallback } from 'react';
import {
  ComponentEnvelopeSchema,
  FinalEventSchema,
  ErrorEventSchema,
  ToolCallEventSchema,
  StatusEventSchema,
  type ComponentEnvelope,
} from '@vyro/ai';

export interface VyroAIAction {
  type: string;
  label: string;
  href: string;
}

export interface VyroAIState {
  loading: boolean;
  components: ComponentEnvelope[];
  summary?: string;
  actions: VyroAIAction[];
  error?: { code: string; message: string };
  toolCall?: { name: string; slots: Record<string, unknown> };
  status?: string;
}

const initial: VyroAIState = { loading: false, components: [], actions: [] };

type Action =
  | { type: 'reset' }
  | { type: 'loading'; loading: boolean }
  | { type: 'status'; stage: string }
  | { type: 'tool_call'; name: string; slots: Record<string, unknown> }
  | { type: 'component'; c: ComponentEnvelope }
  | { type: 'final'; summary: string; actions: VyroAIAction[] }
  | { type: 'error'; code: string; message: string };

function reducer(s: VyroAIState, a: Action): VyroAIState {
  switch (a.type) {
    case 'reset': return { ...initial };
    case 'loading': return { ...s, loading: a.loading };
    case 'status': return { ...s, status: a.stage };
    case 'tool_call': return { ...s, toolCall: { name: a.name, slots: a.slots } };
    case 'component': return { ...s, components: [...s.components, a.c] };
    case 'final': return { ...s, summary: a.summary, actions: a.actions, loading: false };
    case 'error': return { ...s, error: { code: a.code, message: a.message }, loading: false };
  }
}

/** Parse a raw SSE stream into [type, data] tuples. Exported for testing. */
export async function* parseSSE(res: Response): AsyncGenerator<[string, string]> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = frame.split('\n');
      let type = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) type = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (type && data) yield [type, data];
    }
  }
}

export function useVyroAI() {
  const [state, dispatch] = useReducer(reducer, initial);
  const send = useCallback(async (prompt: string, opts?: { businessId?: string }) => {
    dispatch({ type: 'reset' });
    dispatch({ type: 'loading', loading: true });
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ prompt, businessId: opts?.businessId }),
      });
      if (!res.ok || !res.body) {
        dispatch({ type: 'error', code: 'HTTP_ERROR', message: `HTTP ${res.status}` });
        return;
      }
      for await (const [type, data] of parseSSE(res)) {
        try {
          const json = JSON.parse(data);
          switch (type) {
            case 'status': {
              const v = StatusEventSchema.parse(json);
              dispatch({ type: 'status', stage: v.stage });
              break;
            }
            case 'tool_call': {
              const v = ToolCallEventSchema.parse(json);
              dispatch({ type: 'tool_call', name: v.name, slots: v.slots });
              break;
            }
            case 'component': {
              const v = ComponentEnvelopeSchema.parse(json);
              dispatch({ type: 'component', c: v });
              break;
            }
            case 'final': {
              const v = FinalEventSchema.parse(json);
              dispatch({ type: 'final', summary: v.summary, actions: v.actions });
              break;
            }
            case 'error': {
              const v = ErrorEventSchema.parse(json);
              dispatch({ type: 'error', code: v.code, message: v.message });
              break;
            }
          }
        } catch {
          // skip malformed frames
        }
      }
    } catch (err) {
      dispatch({ type: 'error', code: 'NETWORK', message: err instanceof Error ? err.message : 'network error' });
    }
  }, []);
  return { state, send };
}
