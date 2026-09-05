import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../src/lib/logger';

let logBuffer: string[] = [];
let errBuffer: string[] = [];

beforeEach(() => {
  logBuffer = [];
  errBuffer = [];
  vi.spyOn(console, 'log').mockImplementation((line) => logBuffer.push(String(line)));
  vi.spyOn(console, 'error').mockImplementation((line) => errBuffer.push(String(line)));
});

function last(buffer: string[]): any {
  return JSON.parse(buffer[buffer.length - 1]!);
}

describe('logger', () => {
  it('emits JSON line with required fields', () => {
    logger.info('hello', { requestId: 'r1' });
    const l = last(logBuffer);
    expect(l.msg).toBe('hello');
    expect(l.level).toBe('info');
    expect(l.requestId).toBe('r1');
    expect(typeof l.ts).toBe('string');
    expect(new Date(l.ts).getTime()).toBeGreaterThan(0);
  });

  it('error uses console.error', () => {
    logger.error('boom', { requestId: 'r2' });
    expect(errBuffer.length).toBe(1);
    const l = last(errBuffer);
    expect(l.level).toBe('error');
  });

  it('warn uses console.error', () => {
    logger.warn('careful', { requestId: 'r3' });
    expect(errBuffer.length).toBe(1);
  });

  it('debug uses console.log', () => {
    logger.debug('detail', { requestId: 'r4' });
    expect(logBuffer.length).toBe(1);
  });

  it('merges arbitrary context fields', () => {
    logger.info('evt', { foo: 'bar', n: 42 });
    const l = last(logBuffer);
    expect(l.foo).toBe('bar');
    expect(l.n).toBe(42);
  });
});
