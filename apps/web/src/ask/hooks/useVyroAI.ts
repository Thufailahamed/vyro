import { useReducer, useCallback, useRef } from 'react';
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

export interface ChatTurn {
  id: number;
  role: 'user' | 'assistant';
  /** User text, or the assistant's final summary. */
  text: string;
  components: ComponentEnvelope[];
  actions: VyroAIAction[];
  error?: { code: string; message: string };
}

export interface VyroAIState {
  turns: ChatTurn[];
  loading: boolean;
  /** Friendly working stage streamed from the server ("Comparing suppliers…"). */
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

let turnId = 0;

/** Friendly labels for in-flight work. Unknown stages render verbatim. */
export function stageLabel(stage: string): string {
  return stage;
}

const HISTORY_LIMIT = 10;

export function useVyroAI() {
  const [state, dispatch] = useReducer(reducer, initial);
  // Compact server-stateless history: last N user/assistant texts.
  const history = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const send = useCallback(async (prompt: string, opts?: { businessId?: string }) => {
    const text = prompt.trim();
    if (!text) return;
    dispatch({ type: 'user', turn: { id: ++turnId, role: 'user', text, components: [], actions: [] } });
    dispatch({ type: 'assistant_start', turn: { id: ++turnId, role: 'assistant', text: '', components: [], actions: [] } });
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          prompt: text,
          businessId: opts?.businessId,
          conversation: history.current.slice(-HISTORY_LIMIT),
        }),
      });
      if (!res.ok || !res.body) {
        dispatch({ type: 'turn_error', code: 'HTTP_ERROR', message: `HTTP ${res.status}` });
        return;
      }
      let sawFinal = false;
      let sawError = false;
      for await (const [type, data] of parseSSE(res)) {
        try {
          const json = JSON.parse(data);
          switch (type) {
            case 'status': {
              const v = StatusEventSchema.parse(json);
              dispatch({ type: 'status', stage: stageLabel(v.stage) });
              break;
            }
            case 'tool_call': {
              ToolCallEventSchema.parse(json);
              break;
            }
            case 'component': {
              const v = ComponentEnvelopeSchema.parse(json);
              dispatch({ type: 'component', c: v });
              break;
            }
            case 'final': {
              const v = FinalEventSchema.parse(json);
              sawFinal = true;
              dispatch({ type: 'final', summary: v.summary, actions: v.actions });
              history.current.push({ role: 'user', content: text });
              history.current.push({ role: 'assistant', content: v.summary });
              history.current = history.current.slice(-HISTORY_LIMIT);
              break;
            }
            case 'error': {
              const v = ErrorEventSchema.parse(json);
              sawError = true;
              dispatch({ type: 'turn_error', code: v.code, message: v.message });
              break;
            }
          }
        } catch {
          // skip malformed frames
        }
      }
      if (!sawFinal && !sawError) dispatch({ type: 'done' });
    } catch (err) {
      dispatch({ type: 'turn_error', code: 'NETWORK', message: err instanceof Error ? err.message : 'network error' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    history.current = [];
    dispatch({ type: 'clear' });
  }, []);

  return { state, send, clear };
}
