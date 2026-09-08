import { GOLDEN } from '@vyro/ai/eval/golden';
import { runEval, formatMarkdown, type ScoreReport } from '@vyro/ai/eval/scoring';

export interface MockClassifyOptions {
  /** Map of prompt-substring → forced intent. */
  overrides?: Record<string, string>;
  /** Drop these slot keys for any prompt (to simulate weak extraction). */
  dropSlots?: string[];
}

export async function runMockEval(opts: MockClassifyOptions = {}): Promise<ScoreReport> {
  const drop = new Set(opts.dropSlots ?? []);
  const classify = async (prompt: string) => {
    const e = GOLDEN.find((g) => g.prompt === prompt);
    let intent = e?.expectedIntent ?? 'clarify';
    for (const [k, v] of Object.entries(opts.overrides ?? {})) {
      if (prompt.includes(k)) intent = v;
    }
    const slots: Record<string, string> = {};
    for (const k of e?.expectedSlotKeys ?? []) if (!drop.has(k)) slots[k] = 'x';
    return { intent, slots } as any;
  };
  return runEval(classify, GOLDEN);
}

export async function writeEvalReport(rootDir: string, r: ScoreReport): Promise<string> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(rootDir, 'docs/superpowers/evals');
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${today}.md`);
  await fs.writeFile(file, formatMarkdown(r), 'utf8');
  return file;
}
