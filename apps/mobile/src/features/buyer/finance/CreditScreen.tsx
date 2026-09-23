import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Banknote, CalendarClock, Check, Clock, Package, ShieldCheck, ShoppingBag } from 'lucide-react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChipRow,
  ErrorState,
  InkHero,
  Kicker,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  Touchable,
} from '@/ui';
import { Gate } from '@/features/common/Gate';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate, formatLKR } from '@/lib/format';
import { colors, fonts, radii, tones } from '@/theme/tokens';
import {
  CREDIT_STARTING_LIMIT_CENTS,
  drawdownStatusLabel,
  go,
  remainingCents,
  termsLabel,
  unlockSlotState,
} from './shared';
import { UtilisationArc } from './UtilisationArc';

type FacilityPayload = {
  facility: { limitCents: number; usedCents: number; status: string; defaultTerms: string } | null;
  availableCents: number;
  eligible: boolean;
  reason: string | null;
  paidOrderCount: number;
  requiredPaidOrders: number;
  overdueCount: number;
};

type Drawdown = {
  id: string;
  purchaseOrderId: string;
  amountCents: number;
  repaidCents: number;
  terms: string;
  dueAt: number;
  status: string;
};

const DAY = 86_400_000;
const enter = (i: number) => FadeInDown.delay(Math.min(i, 8) * 55).duration(400);

export function CreditScreen() {
  return (
    <Gate need="business">
      <CreditInner />
    </Gate>
  );
}

function CreditInner() {
  const businessId = useBusinessId()!;
  const qc = useQueryClient();
  const facility = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<FacilityPayload>(`/credit/facility${qs({ businessId })}`),
  });
  const drawdowns = useQuery({
    queryKey: ['credit-drawdowns', businessId],
    queryFn: () => api.get<{ items: Drawdown[] }>(`/credit/drawdowns${qs({ businessId })}`),
  });

  const refresh = () =>
    Promise.all([qc.refetchQueries({ queryKey: ['credit-facility', businessId] }), qc.refetchQueries({ queryKey: ['credit-drawdowns', businessId] })]);

  const header = {
    back: true as const,
    kicker: 'Trade terms · Verified buyers',
    title: 'VYRO Credit',
    subtitle: 'Pay mill-gate lots on Net 14 or Net 30 after three settled purchase orders. No interest on v1 — overdue draws simply pause new credit.',
  };

  if (facility.isLoading) {
    return (
      <Screen {...header}>
        <Skeleton height={360} radius={16} />
        <Row gap={10}>
          <Skeleton height={80} radius={12} style={{ flex: 1 }} />
          <Skeleton height={80} radius={12} style={{ flex: 1 }} />
        </Row>
        <Skeleton height={120} radius={12} />
      </Screen>
    );
  }
  if (facility.isError) {
    return (
      <Screen {...header} onRefresh={refresh}>
        <ErrorState message={errorMessage(facility.error, 'Could not load credit facility.')} onRetry={() => facility.refetch()} />
      </Screen>
    );
  }

  const f = facility.data!;
  return (
    <Screen {...header} onRefresh={refresh}>
      {!f.facility ? (
        <UnlockCredit paid={f.paidOrderCount ?? 0} required={f.requiredPaidOrders ?? 3} />
      ) : (
        <ActiveFacility
          seed={businessId}
          facility={f.facility}
          availableCents={f.availableCents}
          overdueCount={f.overdueCount ?? 0}
          eligible={f.eligible}
          drawdowns={drawdowns.data?.items ?? []}
          drawdownsLoading={drawdowns.isLoading}
          drawdownsError={drawdowns.isError ? errorMessage(drawdowns.error) : null}
          retryDrawdowns={() => drawdowns.refetch()}
        />
      )}
    </Screen>
  );
}

/* ------------------------------ Active facility ----------------------------- */

type DdFilter = 'all' | 'active' | 'overdue' | 'repaid';

function ActiveFacility({
  seed,
  facility,
  availableCents,
  overdueCount,
  eligible,
  drawdowns,
  drawdownsLoading,
  drawdownsError,
  retryDrawdowns,
}: {
  seed: string;
  facility: NonNullable<FacilityPayload['facility']>;
  availableCents: number;
  overdueCount: number;
  eligible: boolean;
  drawdowns: Drawdown[];
  drawdownsLoading: boolean;
  drawdownsError: string | null;
  retryDrawdowns: () => void;
}) {
  const [filter, setFilter] = useState<DdFilter>('all');
  const used = facility.limitCents > 0 ? Math.min(1, facility.usedCents / facility.limitCents) : 0;
  const paused = facility.status !== 'active' || overdueCount > 0;
  const danger = overdueCount > 0;

  const schedule = useMemo(
    () => drawdowns.filter((d) => d.status !== 'repaid' && remainingCents(d.amountCents, d.repaidCents) > 0).sort((a, b) => a.dueAt - b.dueAt),
    [drawdowns],
  );
  const next = schedule[0];
  const outstanding = schedule.reduce((s, d) => s + remainingCents(d.amountCents, d.repaidCents), 0);
  const shown = filter === 'all' ? drawdowns : drawdowns.filter((d) => d.status === filter);
  const count = (s: DdFilter) => (s === 'all' ? drawdowns.length : drawdowns.filter((d) => d.status === s).length);

  return (
    <View style={{ gap: 16 }}>
      {overdueCount > 0 ? (
        <Banner tone="danger" title="Credit paused" message={`${overdueCount} drawdown${overdueCount === 1 ? '' : 's'} overdue. Repay open POs to unlock new credit draws.`} />
      ) : null}
      {facility.status !== 'active' ? <Banner tone="warning" message={`Facility is ${facility.status}. Contact VYRO support to restore terms.`} /> : null}

      <Animated.View entering={enter(0)}>
        <InkHero seed={`credit-${seed}`} style={{ paddingBottom: 22 }}>
          <Row justify="space-between">
            <Kicker color="volt">Credit line</Kicker>
            <Badge label={paused ? 'Paused' : 'Active'} tone={paused ? (danger ? 'danger' : 'warning') : 'volt'} dot size="sm" />
          </Row>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <UtilisationArc value={used} label="Limit used" caption={danger ? 'Overdue — repay to resume' : `${formatCompactLKR(facility.usedCents)} drawn`} danger={danger} />
          </View>
          <View style={{ alignItems: 'center', marginTop: -8, gap: 2 }}>
            <Text variant="overline" color="paperMuted">
              Available now
            </Text>
            <Text variant="metric" color="volt" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(availableCents)}
            </Text>
            <Text variant="caption" color="paperMuted">
              {paused ? 'Paused' : eligible ? `${termsLabel(facility.defaultTerms)} default terms` : 'Not eligible'}
            </Text>
          </View>
          <Row gap={10} style={{ marginTop: 18 }}>
            <HeroCell label="Credit limit" value={formatLKR(facility.limitCents)} />
            <HeroCell label="Drawn" value={formatLKR(facility.usedCents)} />
          </Row>
        </InkHero>
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <Card style={{ gap: 12 }}>
          <Row justify="space-between">
            <Text variant="overline" color="ink4">
              Limit used
            </Text>
            <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>
              {Math.round(used * 100)}%
            </Text>
          </Row>
          <ProgressBar value={used} max={1} tone={danger ? 'danger' : 'ink'} height={8} track={colors.bone} />
          <Text variant="bodySm" color="ink3">
            Default terms {termsLabel(facility.defaultTerms)}. Choose Net 14 or Net 30 when you check out on credit.
          </Text>
          <Row gap={10}>
            <Button title="Shop on terms" icon={ShoppingBag} size="sm" disabled={paused} onPress={() => go('/buyer/catalog')} style={{ flex: 1 }} />
            <Button title="Purchase orders" variant="secondary" size="sm" onPress={() => go('/buyer/orders')} style={{ flex: 1 }} />
          </Row>
        </Card>
      </Animated.View>

      {next ? (
        <Animated.View entering={enter(2)}>
          <NextDue drawdown={next} outstanding={outstanding} openCount={schedule.length} />
        </Animated.View>
      ) : null}

      {schedule.length > 1 ? (
        <Animated.View entering={enter(3)}>
          <SectionHeader kicker="Repayment schedule" title="What's due, in order" />
          <Card>
            {schedule.map((d, i) => (
              <ScheduleRow key={d.id} d={d} last={i === schedule.length - 1} />
            ))}
          </Card>
        </Animated.View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeader kicker="Drawdowns" title="Open and settled draws" style={{ marginBottom: 0 }} />
        {drawdowns.length > 0 ? (
          <View style={{ marginHorizontal: -20 }}>
            <ChipRow
              style={{ paddingHorizontal: 20 }}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'active', label: 'Open', count: count('active') },
                { value: 'overdue', label: 'Overdue', count: count('overdue') },
                { value: 'repaid', label: 'Repaid', count: count('repaid') },
              ]}
            />
          </View>
        ) : null}
        {drawdownsLoading ? (
          <Skeleton height={96} radius={12} />
        ) : drawdownsError ? (
          <ErrorState message={drawdownsError} onRetry={retryDrawdowns} />
        ) : drawdowns.length === 0 ? (
          <Card kind="bone">
            <Text variant="bodySm" color="ink3">
              No credit draws yet. At checkout, choose Pay on terms to draw against this facility.
            </Text>
          </Card>
        ) : shown.length === 0 ? (
          <Card kind="bone">
            <Text variant="bodySm" color="ink3">
              No {drawdownStatusLabel(filter).toLowerCase()} draws.
            </Text>
          </Card>
        ) : (
          shown.map((d, i) => (
            <Animated.View key={d.id} entering={enter(i)}>
              <DrawdownCard d={d} />
            </Animated.View>
          ))
        )}
      </View>
    </View>
  );
}

function daysUntil(ts: number) {
  return Math.ceil((ts - Date.now()) / DAY);
}

function dueCopy(ts: number, status: string) {
  const d = daysUntil(ts);
  if (status === 'overdue' || d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d} days`;
}

function NextDue({ drawdown: d, outstanding, openCount }: { drawdown: Drawdown; outstanding: number; openCount: number }) {
  const overdue = d.status === 'overdue' || daysUntil(d.dueAt) < 0;
  const left = remainingCents(d.amountCents, d.repaidCents);
  return (
    <Card kind={overdue ? 'flat' : 'volt'} style={overdue ? { borderColor: tones.danger.border, backgroundColor: colors.roseSoft } : undefined}>
      <Row gap={12} align="flex-start">
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarClock size={20} color={overdue ? colors.rose : colors.volt} strokeWidth={1.7} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="overline" color={overdue ? 'rose' : 'ink3'}>
            Next repayment
          </Text>
          <Text variant="h2">{dueCopy(d.dueAt, d.status)}</Text>
          <Text variant="caption" color="ink3">
            {formatDate(d.dueAt)} · {termsLabel(d.terms)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: colors.ink }}>{formatCompactLKR(left)}</Text>
          <Text variant="caption" color="ink3">
            remaining
          </Text>
        </View>
      </Row>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />
      <Row justify="space-between">
        <Text variant="caption" color="ink3">
          {openCount} open draw{openCount === 1 ? '' : 's'} · {formatLKR(outstanding)} outstanding
        </Text>
        <Touchable onPress={() => go(`/buyer/order/${d.purchaseOrderId}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" weight="semibold">
            View PO
          </Text>
          <ArrowRight size={13} color={colors.ink} />
        </Touchable>
      </Row>
    </Card>
  );
}

function ScheduleRow({ d, last }: { d: Drawdown; last: boolean }) {
  const overdue = d.status === 'overdue' || daysUntil(d.dueAt) < 0;
  const date = new Date(d.dueAt);
  return (
    <Touchable onPress={() => go(`/buyer/order/${d.purchaseOrderId}`)} scaleTo={0.985} style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center', width: 44 }}>
        <View style={{ width: 44, paddingVertical: 6, borderRadius: radii.lg, backgroundColor: overdue ? colors.roseSoft : colors.bone, alignItems: 'center' }}>
          <Text variant="overline" color={overdue ? 'rose' : 'ink4'} style={{ letterSpacing: 1 }}>
            {date.toLocaleDateString('en-GB', { month: 'short' })}
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 21, color: overdue ? colors.rose : colors.ink }}>{date.getDate()}</Text>
        </View>
        {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: colors.line, marginVertical: 4 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 14, paddingTop: 4, gap: 2 }}>
        <Row justify="space-between">
          <Text variant="bodySm" weight="semibold">
            {dueCopy(d.dueAt, d.status)}
          </Text>
          <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>
            {formatLKR(remainingCents(d.amountCents, d.repaidCents))}
          </Text>
        </Row>
        <Text variant="caption" color="ink4">
          {termsLabel(d.terms)} · PO {d.purchaseOrderId.slice(0, 8)}
        </Text>
      </View>
    </Touchable>
  );
}

function DrawdownCard({ d }: { d: Drawdown }) {
  const left = remainingCents(d.amountCents, d.repaidCents);
  const tone = d.status === 'overdue' ? 'danger' : d.status === 'active' ? 'success' : 'neutral';
  return (
    <Card padding={14} style={{ gap: 10 }}>
      <Row justify="space-between">
        <Row gap={8}>
          <Text variant="h3">{termsLabel(d.terms)}</Text>
          <Badge label={drawdownStatusLabel(d.status)} tone={tone} dot size="sm" />
        </Row>
        <MoneyMono cents={d.amountCents} />
      </Row>
      <ProgressBar value={d.repaidCents} max={Math.max(d.amountCents, 1)} tone={d.status === 'overdue' ? 'danger' : 'ink'} height={5} track={colors.bone} />
      <Row justify="space-between">
        <Text variant="caption" color="ink3" style={{ flex: 1 }}>
          Due {formatDate(d.dueAt)} · Remaining {formatLKR(left)} of {formatLKR(d.amountCents)}
        </Text>
        <Touchable onPress={() => go(`/buyer/order/${d.purchaseOrderId}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
          <Text variant="caption" weight="semibold">
            View PO
          </Text>
          <ArrowRight size={13} color={colors.ink} />
        </Touchable>
      </Row>
    </Card>
  );
}

function MoneyMono({ cents }: { cents: number }) {
  return <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink }}>{formatLKR(cents)}</Text>;
}

function HeroCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: 'rgba(250,247,240,0.06)', borderWidth: 1, borderColor: colors.paperLine, gap: 4 }}>
      <Text variant="overline" color="paperMuted">
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.paper }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/* --------------------------------- Unlock ---------------------------------- */

function UnlockCredit({ paid, required }: { paid: number; required: number }) {
  const pct = Math.min(1, paid / Math.max(required, 1));
  return (
    <View style={{ gap: 16 }}>
      <Animated.View entering={enter(0)}>
        <InkHero seed="credit-unlock">
          <Kicker color="volt">Starting facility</Kicker>
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <UtilisationArc value={pct} label="Unlock path" centerValue={`${paid}/${required}`} caption={paid === 0 ? 'No settled POs yet' : `${Math.max(required - paid, 0)} remaining`} />
          </View>
          <View style={{ alignItems: 'center', marginTop: -8, gap: 2 }}>
            <Text variant="caption" color="paperMuted">
              Once unlocked, this workspace receives
            </Text>
            <Text variant="metric" color="volt" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(CREDIT_STARTING_LIMIT_CENTS)}
            </Text>
          </View>
          <View style={{ gap: 10, marginTop: 18 }}>
            {[
              { icon: Clock, text: 'Default terms Net 30 · Net 14 at checkout' },
              { icon: ShieldCheck, text: 'Overdue draws freeze new credit until repaid' },
              { icon: Banknote, text: 'VYRO can raise the limit after clean repayment' },
            ].map((it) => (
              <Row key={it.text} gap={10} align="flex-start">
                <it.icon size={16} color={colors.volt} strokeWidth={1.8} style={{ marginTop: 2 }} />
                <Text variant="bodySm" color="paperMuted" style={{ flex: 1 }}>
                  {it.text}
                </Text>
              </Row>
            ))}
          </View>
        </InkHero>
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Kicker>Unlock path</Kicker>
            <Text variant="h2">Complete {required} paid orders</Text>
            <Text variant="bodySm" color="ink3">
              Credit is granted automatically once this workspace has {required} fully paid purchase orders. Paying on terms does not count toward the unlock.
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <ProgressBar value={pct} max={1} tone="ink" height={8} track={colors.bone} />
            <Text variant="overline" color="ink4">
              {paid === 0 ? 'No settled POs yet' : `${paid} settled · ${Math.max(required - paid, 0)} remaining`}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {Array.from({ length: required }, (_, i) => {
              const state = unlockSlotState(i, paid);
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: radii.xl,
                    borderWidth: state === 'current' ? 1.5 : 1,
                    borderColor: state === 'done' ? tones.success.border : state === 'current' ? colors.ink : colors.lineSoft,
                    backgroundColor: state === 'done' ? colors.mintSoft : state === 'current' ? colors.voltSoft : colors.paper,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: state === 'done' ? colors.mint : 'transparent',
                      borderWidth: state === 'done' ? 0 : 1.5,
                      borderColor: state === 'current' ? colors.ink : colors.line,
                    }}
                  >
                    {state === 'done' ? (
                      <Check size={14} color={colors.paper} strokeWidth={3} />
                    ) : (
                      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: state === 'current' ? colors.ink : colors.ink4 }}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="overline" color="ink4">
                      Order {i + 1}
                    </Text>
                    <Text variant="bodySm" weight="semibold">
                      {state === 'done' ? 'Paid in full' : state === 'current' ? 'Next to complete' : 'Waiting'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Row gap={10}>
            <Button title="Browse catalog" size="sm" onPress={() => go('/buyer/catalog')} style={{ flex: 1 }} />
            <Button title="Purchase orders" size="sm" variant="secondary" onPress={() => go('/buyer/orders')} style={{ flex: 1 }} />
          </Row>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(2)} style={{ gap: 12 }}>
        <SectionHeader kicker="How it works" title="Trade credit, not a loan form" style={{ marginBottom: 0 }} />
        {[
          { icon: Package, title: 'Buy as usual', body: 'Place mill-gate POs from the catalog. The first three must be paid in full — not on terms.' },
          { icon: ShieldCheck, title: 'Facility unlocks', body: `After three settled orders, VYRO grants a ${formatLKR(CREDIT_STARTING_LIMIT_CENTS)} limit on this workspace automatically.` },
          { icon: Clock, title: 'Checkout on terms', body: 'Choose Net 14 or Net 30 at checkout. Settle the PO by the due date to keep the line open.' },
        ].map((s, i) => (
          <Card key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.copperSoft, alignItems: 'center', justifyContent: 'center' }}>
              <s.icon size={17} color={colors.copperDeep} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Row justify="space-between">
                <Text variant="h3">{s.title}</Text>
                <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                  0{i + 1}
                </Text>
              </Row>
              <Text variant="bodySm" color="ink3">
                {s.body}
              </Text>
            </View>
          </Card>
        ))}
        <Row gap={10} align="stretch">
          <Card kind="bone" style={{ flex: 1, gap: 4 }}>
            <Text variant="h3">Net 14</Text>
            <Text variant="caption" color="ink3">
              Full PO balance due 14 days after you draw. Use it when stock turns quickly.
            </Text>
          </Card>
          <Card kind="bone" style={{ flex: 1, gap: 4 }}>
            <Text variant="h3">Net 30</Text>
            <Text variant="caption" color="ink3">
              Full PO balance due in 30 days. Default terms on a new facility.
            </Text>
          </Card>
        </Row>
      </Animated.View>
    </View>
  );
}
