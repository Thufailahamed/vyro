import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Compass,
  FileText,
  Handshake,
  Megaphone,
  Scale,
  Search,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import { Badge, Card, EmptyState, IconTile, InkHero, Kicker, ListRow, ListSection, Loader, Screen, SkeletonList, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatDate } from '@/lib/format';
import { LEGAL_DOCS, LEGAL_META, type LegalKind } from './legalContent';
import { MonoTag } from '../buyer/orders/kit';

const hairline = { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft } as const;

/** Content card with a tinted IconTile head — the info pages' building block. */
function InfoCard({
  icon,
  tone = 'ink',
  kicker,
  title,
  step,
  children,
}: {
  icon: LucideIcon;
  tone?: 'ink' | 'volt' | 'copper' | 'paper' | 'success' | 'danger' | 'warning';
  kicker?: string;
  title: string;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <Card padding={18} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile icon={icon} tone={tone} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          <Text variant="h2">{title}</Text>
        </View>
        {step ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 22, letterSpacing: -0.8, color: colors.ink6 }}>{step}</Text> : null}
      </View>
      {children}
    </Card>
  );
}

/** Check-marked bullet line used inside info cards. */
function Point({ children, icon: Icon = CheckCircle2 }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Icon size={13} color={colors.mint} strokeWidth={2.2} />
      </View>
      <Text variant="bodySm" color="ink3" style={{ flex: 1, lineHeight: 20 }}>
        {children}
      </Text>
    </View>
  );
}

/** Minimal markdown renderer for the bundled legal docs (# / ## / > / - / paragraphs). */
function Markdown({ md }: { md: string }) {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={{ gap: 14 }}>
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) {
          return (
            <View key={i} style={{ gap: 14, marginTop: i ? 4 : 0 }}>
              {i ? <View style={hairline} /> : null}
              <Text variant="h2" style={{ fontSize: 17 }}>
                {b.slice(3)}
              </Text>
            </View>
          );
        }
        if (b.startsWith('# ')) {
          return (
            <Text key={i} variant="displaySm">
              {b.slice(2)}
            </Text>
          );
        }
        if (b.startsWith('> ')) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.amberSoft }}>
              <CircleAlert size={15} color={colors.amber} style={{ marginTop: 2 }} />
              <Text variant="bodySm" color="ink2" style={{ flex: 1, fontStyle: 'italic' }}>
                {b.replace(/^> /gm, '')}
              </Text>
            </View>
          );
        }
        if (b.startsWith('- ')) {
          return (
            <View key={i} style={{ gap: 8 }}>
              {b.split('\n').map((li, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.copper, marginTop: 9 }} />
                  <Text variant="body" color="ink3" style={{ flex: 1 }}>
                    {li.replace(/^- /, '')}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} variant="body" color="ink3">
            {b}
          </Text>
        );
      })}
    </View>
  );
}

/** /legal/[kind] — terms, privacy, cookies. */
export function LegalScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const k = (kind === 'privacy' || kind === 'cookies' ? kind : 'terms') as LegalKind;
  const meta = LEGAL_META[k];
  return (
    <Screen back kicker={meta.kicker} title={meta.title}>
      <InkHero seed={`legal-${k}`}>
        <IconTile icon={Scale} tone="glass" size={44} />
        <Text variant="body" color="paper" style={{ marginTop: 14 }}>
          {meta.summary}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          <MonoTag label={`Effective ${meta.effective}`} tone="volt" />
          <MonoTag label={meta.jurisdiction} tone="paper" />
        </View>
        {meta.acts.length ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {meta.acts.map((a) => (
              <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={14} color={colors.volt} />
                <Text variant="caption" color="paperMuted" style={{ flex: 1 }}>
                  {a}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </InkHero>
      <Card padding={20} radius={radii['2xl']}>
        <Markdown md={LEGAL_DOCS[k]} />
      </Card>
      <Text variant="caption" color="ink4" align="center">
        Questions? Contact {meta.contact}.
      </Text>
    </Screen>
  );
}

const HIW_STEPS = [
  {
    num: '01',
    title: 'Discover',
    kicker: 'Catalog Layer',
    icon: Search,
    description:
      'Browse active wholesale lines across 25 Sri Lankan districts without account gatekeeping. Compare real-time LKR unit prices, pack sizes, MOQs and delivery availability.',
    points: ['Open public catalog with live wholesale prices', 'Mill-gate pricing — zero broker markup', 'MOQs and depot locations listed upfront'],
  },
  {
    num: '02',
    title: 'Decide',
    kicker: 'Comparison Engine',
    icon: Compass,
    description:
      'Every product ranks competing offers across best unit price, fastest dispatch and best price-time value — the optimal decision is immediate.',
    points: ['Transparent multi-supplier scoring', 'Verified mills with trust signals and reviews', 'Volume tiers and lead times side by side'],
  },
  {
    num: '03',
    title: 'Order',
    kicker: 'Trade Desk',
    icon: FileText,
    description:
      'Issue supplier-grouped purchase orders with delivery notes, credit terms or escrowed online payment. Every PO generates a tax-ready invoice trail.',
    points: ['Net 14 / Net 30 trade credit for verified buyers', 'Escrowed payments released on delivery', 'Automated 3-way invoice reconciliation'],
  },
  {
    num: '04',
    title: 'Receive',
    kicker: 'Fulfilment',
    icon: Truck,
    description:
      'Track dispatch to delivery confirmation. Payments settle against confirmed GRNs, and disputes route to structured resolution.',
    points: ['Live dispatch and delivery milestones', 'Proof-of-delivery before settlement', 'Structured dispute resolution with evidence'],
  },
];

/** /how-it-works — condensed port of the marketing explainer. */
export function HowItWorksScreen() {
  return (
    <Screen back kicker="VYRO Commerce OS" title="How it works">
      <InkHero seed="how-it-works">
        <Text variant="h1" color="paper">
          From mill-gate discovery to confirmed delivery — one accountable trade lane.
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 20, gap: 6 }}>
          {HIW_STEPS.map((s, i) => (
            <View key={s.num} style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: i === 0 ? colors.volt : 'rgba(250,247,240,0.18)' }} />
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.paperFaint }}>{s.num}</Text>
              <Text variant="caption" weight="semibold" color="paper" numberOfLines={1}>
                {s.title}
              </Text>
            </View>
          ))}
        </View>
      </InkHero>
      {HIW_STEPS.map((s, i) => (
        <InfoCard key={s.num} step={s.num} kicker={s.kicker} title={s.title} icon={s.icon} tone={i === 0 ? 'volt' : 'ink'}>
          <Text variant="body" color="ink3">
            {s.description}
          </Text>
          <View style={hairline} />
          <View style={{ gap: 10 }}>
            {s.points.map((p) => (
              <Point key={p}>{p}</Point>
            ))}
          </View>
        </InfoCard>
      ))}
    </Screen>
  );
}

/** /about — condensed port of the marketing About page. */
export function AboutScreen() {
  return (
    <Screen back kicker="B2B Commercial Operating Layer" title="Built as infrastructure, not a storefront">
      <InkHero seed="about">
        <IconTile icon={Handshake} tone="glass" size={44} />
        <Text variant="bodyLg" color="paper" style={{ marginTop: 16 }}>
          VYRO is the operating layer connecting Sri Lankan commercial buyers, primary agricultural mills, authorized distributors and logistics depots into one
          continuous, accountable commerce network.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <MonoTag label="25 districts" tone="paper" />
          <MonoTag label="Mill-direct pricing" tone="volt" />
          <MonoTag label="Escrowed settlement" tone="paper" />
        </View>
      </InkHero>
      <InfoCard kicker="Principles" title="What we guarantee" icon={BadgeCheck} tone="volt">
        <View style={{ gap: 12 }}>
          {[
            'Verified suppliers — every mill and depot passes KYC and fulfilment audits.',
            'Transparent pricing — live market spreads, never hidden broker margins.',
            'Escrowed settlement — funds release only on confirmed delivery.',
            'Accountable records — POs, invoices and GRNs form an auditable trail.',
          ].map((t) => (
            <Point key={t} icon={ShieldCheck}>
              {t}
            </Point>
          ))}
        </View>
      </InfoCard>
    </Screen>
  );
}

const COMPONENTS = ['api', 'payments', 'queues', 'cron', 'web'] as const;

type StatusPayload = {
  components: Record<string, { status: 'operational' | 'degraded' | 'down' | 'unknown'; updatedAt: number; detail?: string }>;
  incidents: { id: string; title: string; severity: string; startedAt: number; resolvedAt?: number }[];
  updatedAt: number;
  version: string;
};

const STATUS_ICON = {
  operational: { Icon: CheckCircle2, tile: 'success', badge: 'success', label: 'Operational' },
  degraded: { Icon: CircleAlert, tile: 'warning', badge: 'warning', label: 'Degraded' },
  down: { Icon: CircleX, tile: 'danger', badge: 'danger', label: 'Down' },
  unknown: { Icon: CircleAlert, tile: 'paper', badge: 'neutral', label: 'Unknown' },
} as const;

/** /status — live component health from /status.json. */
export function StatusScreen() {
  const q = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await api.raw(`${WEB_URL}/status.json`);
      return (await res.json()) as StatusPayload;
    },
    refetchInterval: 60_000,
    retry: 1,
  });
  const data = q.data;
  const states = data ? COMPONENTS.map((c) => data.components[c]?.status ?? 'unknown') : [];
  const allOk = states.length > 0 && states.every((st) => st === 'operational');
  const anyDown = states.includes('down');
  return (
    <Screen back kicker="Platform telemetry" title="Vyro status" subtitle={data ? `Version ${data.version}` : undefined}>
      {q.isLoading ? <SkeletonList rows={3} height={64} /> : null}
      {q.isError ? <EmptyState icon={CircleAlert} title="Status unavailable" message={errorMessage(q.error)} /> : null}
      {data ? (
        <>
          <InkHero seed="status">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconTile icon={allOk ? Activity : CircleAlert} tone={allOk ? 'volt' : 'glass'} size={48} />
              <View style={{ flex: 1, gap: 3 }}>
                <Kicker color="volt">Live</Kicker>
                <Text variant="h1" color="paper">
                  {allOk ? 'All systems operational' : anyDown ? 'Service disruption' : 'Partial degradation'}
                </Text>
              </View>
            </View>
            {data.updatedAt ? (
              <Text variant="caption" color="paperFaint" style={{ marginTop: 14 }}>
                Updated {formatDate(data.updatedAt)}
              </Text>
            ) : null}
          </InkHero>
          <ListSection label="Components">
            {COMPONENTS.map((c, i) => {
              const entry = data.components[c];
              const st = STATUS_ICON[entry?.status ?? 'unknown'];
              return (
                <ListRow
                  key={c}
                  leading={<IconTile icon={st.Icon} tone={st.tile} size={38} />}
                  title={c.charAt(0).toUpperCase() + c.slice(1)}
                  subtitle={entry?.detail}
                  trailing={<Badge label={st.label} tone={st.badge} size="sm" dot />}
                  last={i === COMPONENTS.length - 1}
                />
              );
            })}
          </ListSection>
        </>
      ) : null}
      {data?.incidents?.length ? (
        <InfoCard kicker="Incidents" title="Recent incidents" icon={CircleAlert} tone="warning">
          {data.incidents.slice(0, 5).map((i, idx) => (
            <View key={i.id} style={{ gap: 12 }}>
              {idx ? <View style={hairline} /> : null}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="body" weight="semibold" style={{ flex: 1 }}>
                    {i.title}
                  </Text>
                  <Badge label={i.resolvedAt ? 'Resolved' : 'Ongoing'} tone={i.resolvedAt ? 'success' : 'warning'} size="sm" />
                </View>
                <Text variant="caption" color="ink4">
                  {i.severity} · started {formatDate(i.startedAt)}
                  {i.resolvedAt ? ` · resolved ${formatDate(i.resolvedAt)}` : ' · ongoing'}
                </Text>
              </View>
            </View>
          ))}
        </InfoCard>
      ) : null}
    </Screen>
  );
}

/** /sponsored-disclosure — platform advertising disclosure. */
export function SponsoredDisclosureScreen() {
  const q = useQuery({
    queryKey: ['sponsored-disclosure'],
    queryFn: () => api.get<{ version: string; title: string; body: string; lastUpdated: number }>('/sponsored/disclosure'),
  });
  const d = q.data;
  return (
    <Screen back kicker="Advertising transparency" title={d?.title ?? 'Sponsored disclosure'}>
      {q.isLoading ? <Loader label="Loading…" /> : null}
      {q.isError ? <EmptyState icon={CircleAlert} title="Could not load disclosure" message={errorMessage(q.error)} /> : null}
      {d ? (
        <>
          <InkHero seed="sponsored">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconTile icon={Megaphone} tone="glass" size={44} />
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <MonoTag label={`v${d.version}`} tone="volt" />
                <MonoTag label={`Updated ${formatDate(d.lastUpdated)}`} tone="paper" />
              </View>
            </View>
            <Text variant="body" color="paperMuted" style={{ marginTop: 14 }}>
              How sponsored placements are disclosed on VYRO.
            </Text>
          </InkHero>
          <Card padding={20} radius={radii['2xl']} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconTile icon={FileText} tone="paper" size={34} />
              <Kicker color="ink4">Disclosure</Kicker>
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 15.5, lineHeight: 25, color: colors.ink3 }}>{d.body}</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
