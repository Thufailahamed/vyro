import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Input, Label, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { LayersIcon, PlusIcon, SaveIcon } from '@/components/icons';

export interface RfqItem {
  description: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  specifications: string;
  productId?: string;
}
interface Template {
  id: string;
  name: string;
  description?: string | null;
  itemCount?: number;
}

export function RfqTemplatesPanel({
  items,
  onLoadItems,
}: {
  items: RfqItem[];
  onLoadItems: (items: RfqItem[]) => void;
}) {
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ['rfq-templates', businessId],
    queryFn: () => api.get<{ templates: Template[] }>(`/rfqs/templates/list?businessId=${businessId}`),
    enabled: !!businessId,
  });

  async function load(id: string) {
    const res = await api.get<{
      items: Array<{
        description: string;
        quantity: number;
        unit: string;
        targetPriceCents?: number;
        specifications?: string;
        productId?: string;
      }>;
    }>(`/rfqs/templates/${id}`);
    onLoadItems(
      res.items.map((i) => ({
        description: i.description,
        quantity: String(i.quantity),
        unit: i.unit,
        targetPrice: i.targetPriceCents ? String(i.targetPriceCents / 100) : '',
        specifications: i.specifications ?? '',
        ...(i.productId ? { productId: i.productId } : {}),
      })),
    );
    toast.show(toast.success('Template loaded'));
  }

  async function save() {
    setSaveError(null);
    if (!saveName.trim() || !businessId) return;
    const valid = items.filter((i) => i.description.trim() && Number(i.quantity) > 0);
    if (!valid.length) {
      setSaveError('Add at least one valid item before saving a template');
      return;
    }
    setSaving(true);
    try {
      await api.post('/rfqs/templates', {
        businessId,
        name: saveName,
        items: valid.map((i) => ({
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit || 'kg',
          ...(i.targetPrice ? { targetPriceCents: Math.round(Number(i.targetPrice) * 100) } : {}),
          ...(i.specifications ? { specifications: i.specifications } : {}),
          ...(i.productId ? { productId: i.productId } : {}),
        })),
      });
      setSaveName('');
      void refetch();
      toast.show(toast.success('Template saved'));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function createNext(id: string) {
    await api.post(`/rfqs/templates/${id}/create`, {});
    toast.show(toast.success('New RFQ created from template'));
  }

  const validCount = items.filter((i) => i.description.trim() && Number(i.quantity) > 0).length;
  const templates = data?.templates ?? [];

  return (
    <Surface className="rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-paper-subtle/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-copper/10 text-copper flex items-center justify-center">
            <LayersIcon size={16} />
          </div>
          <div>
            <div className="text-sm font-bold text-ink-1">Reusable templates</div>
            <div className="text-[11px] text-ink-3">
              {templates.length === 0
                ? 'No templates yet — save your current list to reuse next time'
                : `${templates.length} template${templates.length === 1 ? '' : 's'} available`}
            </div>
          </div>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
          {open ? '− Collapse' : '+ Expand'}
        </div>
      </button>

      {open && (
        <div className="border-t border-ink/10 p-5 space-y-5 animate-fade-in">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Load templates */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                Load from template
              </div>
              {templates.length === 0 ? (
                <div className="p-4 border border-dashed border-ink/15 rounded-xl text-[11px] text-ink-4 text-center">
                  No templates yet. Save your current list on the right to reuse it next time.
                </div>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-auto pr-1 scrollbar-thin">
                  {templates.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-ink/10 bg-paper hover:border-ink/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-ink-1 truncate">{t.name}</div>
                        {t.description && (
                          <div className="text-[10px] text-ink-4 truncate">{t.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void load(t.id)}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-ink/10 hover:border-ink hover:bg-ink hover:text-volt transition-all"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => void createNext(t.id)}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-ink/10 hover:border-ink hover:bg-ink hover:text-volt transition-all"
                        >
                          New from
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Save current */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                Save current as template
              </div>
              {saveError && <ErrorBanner message={saveError} />}
              <div>
                <Label htmlFor="tpl-name" className="flex items-center gap-1.5">
                  <SaveIcon size={12} className="text-copper" />
                  <span>Template name</span>
                </Label>
                <Input
                  id="tpl-name"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Monthly restaurant supplies"
                  className="bg-paper"
                />
              </div>
              <Button
                onClick={() => void save()}
                disabled={!saveName.trim() || validCount === 0}
                loading={saving}
                className="w-full"
                icon={<PlusIcon size={14} />}
              >
                Save {validCount} item{validCount === 1 ? '' : 's'}
              </Button>
              {validCount === 0 && (
                <p className="text-[10px] text-ink-4">
                  Add at least one valid item (with a product name and quantity) to save.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Surface>
  );
}
