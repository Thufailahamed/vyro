import { runMockEval, writeEvalReport } from '../apps/api/src/modules/ai/evalRunner';
import { formatMarkdown } from '@vyro/ai/eval/scoring';
import path from 'node:path';

async function main() {
  const r = await runMockEval({});
  console.log(formatMarkdown(r));
  const rootDir = process.env.VYRO_EVAL_ROOT ?? path.resolve(process.cwd(), '..', '..');
  const file = await writeEvalReport(rootDir, r);
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
