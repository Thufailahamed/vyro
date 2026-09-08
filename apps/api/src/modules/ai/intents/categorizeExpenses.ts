import type { IntentContext, HandlerResult } from './catalog';

interface ExpenseRepos {
  expenseCategoryBreakdown(
    businessId: string,
    months: number,
  ): Promise<Array<{ slug: string | null; total: number }>>;
}

export async function categorizeExpensesHandler(
  ctx: IntentContext,
  repos: ExpenseRepos,
): Promise<HandlerResult> {
  const rawMonths = Number((ctx.classify.slots as { months?: number }).months ?? 1);
  const months = Math.max(1, Math.min(12, Number.isFinite(rawMonths) ? rawMonths : 1));

  const rows = await repos.expenseCategoryBreakdown(ctx.businessId, months);
  if (!rows.length) {
    return {
      components: [
        {
          type: 'clarification_card',
          data: {
            question: 'No categorized spend yet. Upload an invoice to get started.',
            options: [],
          },
        },
      ],
      actions: [{ type: 'view_invoices', label: 'Upload invoice', href: '/invoices/upload' }],
      rawSummary: { months },
    };
  }

  const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const byCategory = rows
    .map((r) => {
      const t = Number(r.total ?? 0);
      return {
        slug: r.slug ?? 'other',
        totalCents: t,
        pct: total > 0 ? Math.round((t / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    components: [
      {
        type: 'spend_summary_card',
        data: {
          title: `Categorized spend (last ${months} month${months === 1 ? '' : 's'})`,
          totalCents: total,
          byCategory,
        },
      },
    ],
    actions: [{ type: 'view_invoices', label: 'View invoices', href: '/invoices' }],
    rawSummary: { months, byCategory, totalCents: total },
  };
}
