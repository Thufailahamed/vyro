import {
  StatusEventSchema,
  ToolCallEventSchema,
  ToolResultEventSchema,
  ComponentEnvelopeSchema,
  FinalEventSchema,
  ErrorEventSchema,
  MetaEventSchema,
  type ComponentEnvelope,
  type FinalEvent,
  type MetaEvent,
} from '@vyro/ai';

export type StreamEvent =
  | { type: 'status'; payload: { stage: string } }
  | { type: 'tool_call'; payload: { name: string; slots: Record<string, unknown> } }
  | { type: 'tool_result'; payload: { name: string; ok: boolean; summary: string } }
  | { type: 'component'; payload: ComponentEnvelope }
  | { type: 'final'; payload: FinalEvent }
  | { type: 'meta'; payload: MetaEvent }
  | { type: 'error'; payload: { code: string; message: string } };

const SCHEMAS = {
  status: StatusEventSchema,
  tool_call: ToolCallEventSchema,
  tool_result: ToolResultEventSchema,
  component: ComponentEnvelopeSchema,
  final: FinalEventSchema,
  meta: MetaEventSchema,
  error: ErrorEventSchema,
} as const;

export function encodeEvent(type: StreamEvent['type'], payload: unknown): string {
  const schema = SCHEMAS[type];
  const parsed = schema.parse(payload);
  return `event: ${type}\ndata: ${JSON.stringify(parsed)}\n\n`;
}

export function validateEvent(type: StreamEvent['type'], data: string): unknown {
  const parsed = JSON.parse(data);
  return SCHEMAS[type].parse(parsed);
}

export function sseHeaders(): Headers {
  const h = new Headers();
  h.set('content-type', 'text/event-stream');
  h.set('cache-control', 'no-cache, no-transform');
  h.set('x-accel-buffering', 'no');
  h.set('connection', 'keep-alive');
  return h;
}
