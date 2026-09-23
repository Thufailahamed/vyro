import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { CheckCircle2, CircleAlert, CircleX, Compass, FileText, Handshake, Search, ShieldCheck, Truck } from 'lucide-react-native';
import { Card, EmptyState, Gutter, InkHero, Loader, Screen, ScreenHeader, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { colors, fonts } from '@/theme/tokens';
import { formatDate } from '@/lib/format';
import { LEGAL_DOCS, LEGAL_META, type LegalKind } from './legalContent';
import { MonoTag, Section } from '../buyer/orders/kit';

/** Minimal markdown renderer for the bundled legal docs (# / ## / > / - / paragraphs). */
function Markdown({ md }: { md: string }) {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) return <Text key={i} variant="h3">{b.slice(3)}</Text>;
        if (b.startsWith('# ')) return <Text key={i} variant="h2">{b.slice(2)}</Text>;
        if (b.startsWith('> ')) {
          return (
            <Card key={i} kind="bone" padding={10}>
              <Text variant="caption" color="ink3" style={{ fontStyle: 'italic' }}>
                {b.replace(/^> /gm, '')}
              </Text>
            </Card>
          );
        }
        if (b.startsWith('- ')) {
          return (
            <View key={i} style={{ gap: 6 }}>
              {b.split('\n').map((li, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text variant="bodySm" color="copper">
                    •
                  </Text>
                  <Text variant="bodySm" color="ink3" style={{ flex: 1 }}>
                    {li.replace(/^- /, '')}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} variant="bodySm" color="ink3">
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
    <Screen>
      <ScreenHeader back kicker={meta.kicker} title={meta.title} subtitle={meta.summary} />
      <Gutter style={{ gap: 14 }}>
        <Card kind="flat" style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MonoTag label={`Effective ${meta.effective}`} tone="copper" />
            <MonoTag label={meta.jurisdiction} tone="ink" />
          </View>
          {meta.acts.map((a) => (
            <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={13} color={colors.mint} />
              <Text variant="caption" color="ink3">
                {a}
              </Text>
            </View>
          ))}
        </Card>
        <Markdown md={LEGAL_DOCS[k]} />
        <Text variant="caption" color="ink4">
          Questions? Contact {meta.contact}.
        </Text>
      </Gutter>
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
    <Screen>
      <ScreenHeader back kicker="VYRO Commerce OS" title="How it works" subtitle="From mill-gate discovery to confirmed delivery — one accountable trade lane." />
      <Gutter style={{ gap: 14 }}>
        {HIW_STEPS.map((s) => (
          <Section key={s.num} step={s.num} kicker={s.kicker} title={s.title} icon={s.icon}>
            <Text variant="bodySm" color="ink3">
              {s.description}
            </Text>
            {s.points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
                <CheckCircle2 size={13} color={colors.mint} />
                <Text variant="caption" color="ink3" style={{ flex: 1 }}>
                  {p}
                </Text>
              </View>
            ))}
          </Section>
        ))}
      </Gutter>
    </Screen>
  );
}

/** /about — condensed port of the marketing About page. */
export function AboutScreen() {
  return (
    <Screen>
      <ScreenHeader back kicker="B2B Commercial Operating Layer" title="Built as infrastructure, not a storefront" />
      <Gutter style={{ gap: 14 }}>
        <InkHero seed="about">
          <Text variant="body" color="paper">
            VYRO is the operating layer connecting Sri Lankan commercial buyers, primary agricultural mills, authorized distributors and logistics depots into one continuous, accountable commerce network.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <MonoTag label="25 districts" tone="paper" />
            <MonoTag label="Mill-direct pricing" tone="volt" />
            <MonoTag label="Escrowed settlement" tone="paper" />
          </View>
        </InkHero>
        <Section kicker="Principles" title="What we guarantee" icon={Handshake}>
          {[
            'Verified suppliers — every mill and depot passes KYC and fulfilment audits.',
            'Transparent pricing — live market spreads, never hidden broker margins.',
            'Escrowed settlement — funds release only on confirmed delivery.',
            'Accountable records — POs, invoices and GRNs form an auditable trail.',
          ].map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
              <ShieldCheck size={13} color={colors.mint} />
              <Text variant="bodySm" color="ink3" style={{ flex: 1 }}>
                {t}
              </Text>
            </View>
          ))}
        </Section>
      </Gutter>
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
  operational: { Icon: CheckCircle2, color: colors.mint, label: 'Operational' },
  degraded: { Icon: CircleAlert, color: colors.amber, label: 'Degraded' },
  down: { Icon: CircleX, color: colors.rose, label: 'Down' },
  unknown: { Icon: CircleAlert, color: colors.ink5, label: 'Unknown' },
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
  return (
    <Screen>
      <ScreenHeader back kicker="Platform telemetry" title="Vyro status" subtitle={data ? `Version ${data.version}` : undefined} />
      <Gutter style={{ gap: 12 }}>
        {q.isLoading ? <Loader label="Checking components…" /> : null}
        {q.isError ? <EmptyState icon={CircleAlert} title="Status unavailable" message={errorMessage(q.error)} /> : null}
        {data
          ? COMPONENTS.map((c) => {
              const entry = data.components[c];
              const s = STATUS_ICON[entry?.status ?? 'unknown'];
              return (
                <Card key={c} padding={14} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <s.Icon size={16} color={s.color} />
                    <Text variant="body" weight="medium" style={{ textTransform: 'capitalize' }}>
                      {c}
                    </Text>
                  </View>
                  <Text variant="caption" color="ink4">
                    {s.label}
                  </Text>
                </Card>
              );
            })
          : null}
        {data?.incidents?.length ? (
          <Section kicker="Incidents" title="Recent incidents" icon={CircleAlert}>
            {data.incidents.slice(0, 5).map((i) => (
              <View key={i.id} style={{ gap: 2 }}>
                <Text variant="bodySm" weight="semibold">
                  {i.title}
                </Text>
                <Text variant="caption" color="ink4">
                  {i.severity} · started {formatDate(i.startedAt)}
                  {i.resolvedAt ? ` · resolved ${formatDate(i.resolvedAt)}` : ' · ongoing'}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}
      </Gutter>
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
    <Screen>
      <ScreenHeader back kicker="Advertising transparency" title={d?.title ?? 'Sponsored disclosure'} />
      <Gutter style={{ gap: 12 }}>
        {q.isLoading ? <Loader label="Loading…" /> : null}
        {q.isError ? <EmptyState icon={CircleAlert} title="Could not load disclosure" message={errorMessage(q.error)} /> : null}
        {d ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MonoTag label={`v${d.version}`} tone="copper" />
              <MonoTag label={`Updated ${formatDate(d.lastUpdated)}`} tone="ink" />
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.ink3 }}>{d.body}</Text>
          </>
        ) : null}
      </Gutter>
    </Screen>
  );
}
