import { View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Text } from '@/ui';
import { colors, radii } from '@/theme/tokens';

export interface UploadRow {
  id: string;
  originalFilename: string;
  status: string;
  ocrConfidence: number | null;
  createdAt: number;
  totalCents: number | null;
}

export interface LineItem {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  categorySlug: string | null;
  categorySource: 'rule' | 'default' | 'manual';
}

export interface Upload {
  id: string;
  status: string;
  ocrConfidence: number | null;
  originalFilename: string;
  totalCents: number | null;
  items: LineItem[];
  rawExtractionJson: string | null;
}

export const SLUGS = ['food', 'packaging', 'cleaning', 'office', 'equipment', 'other'] as const;
export type Slug = (typeof SLUGS)[number];

export const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Queued', color: colors.ink3, bg: colors.mist },
  processing: { label: 'Reading…', color: colors.copperDeep, bg: colors.copperSoft },
  ready: { label: 'Awaiting review', color: colors.amber, bg: colors.amberSoft },
  reviewed: { label: 'Reviewed', color: colors.mint, bg: colors.mintSoft },
  failed: { label: 'Could not read', color: colors.rose, bg: colors.roseSoft },
  manual_required: { label: 'Manual entry required', color: colors.amber, bg: colors.amberSoft },
};

export function UploadStatus({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: s.bg, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: s.color }} />
      <Text variant="overline" style={{ color: s.color, letterSpacing: 1 }}>
        {s.label}
      </Text>
    </View>
  );
}

const CAT: Record<string, { fg: string; bg: string; border: string; label: string }> = {
  food: { fg: colors.mint, bg: colors.mintSoft, border: 'rgba(61,139,110,0.35)', label: 'Food' },
  packaging: { fg: colors.copperDeep, bg: colors.copperSoft, border: 'rgba(184,122,78,0.35)', label: 'Packaging' },
  cleaning: { fg: colors.ink, bg: colors.voltSoft, border: 'rgba(122,143,34,0.35)', label: 'Cleaning' },
  office: { fg: colors.ink, bg: colors.bone, border: colors.line, label: 'Office' },
  equipment: { fg: colors.volt, bg: colors.ink, border: colors.ink, label: 'Equipment' },
  other: { fg: colors.ink3, bg: colors.paper, border: colors.line, label: 'Other' },
};

export function categoryLabel(slug: string | null) {
  return CAT[slug ?? 'other']?.label ?? slug ?? 'Other';
}

export function CategoryBadge({ slug, source }: { slug: string | null; source: LineItem['categorySource'] | null }) {
  const c = CAT[slug ?? 'other'] ?? CAT.other;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: c.bg }}>
      <Sparkles size={10} color={c.fg} />
      <Text variant="overline" style={{ color: c.fg, letterSpacing: 1 }}>
        {c.label}
      </Text>
      {source === 'manual' ? (
        <Text variant="overline" color="rose" style={{ letterSpacing: 1 }}>
          ·edited
        </Text>
      ) : null}
    </View>
  );
}
