import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Banknote, CalendarClock, Check, Clock, Package, PauseCircle, Receipt, ShieldCheck, ShoppingBag, Wallet } from 'lucide-react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChipRow,
  ErrorState,
  IconTile,
  InkHero,
  Kicker,
  ListRow,
  ListSection,
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
import { formatCompactLKR, formatDate, formatLKR, formatRs } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
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
    title: 'VYRO Credit',
    subtitle: 'Buy now, settle on Net 14 or Net 30 — interest-free.',
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

  const pct = Math.round(used * 100);
  return (
    <View style={{ gap: 20 }}>
      {overdueCount > 0 ? (
        <Banner tone="danger" title="Credit paused" message={`${overdueCount} drawdown${overdueCount === 1 ? '' : 's'} overdue. Repay open POs to unlock new credit draws.`} />
      ) : null}
      {facility.status !== 'active' ? <Banner tone="warning" message={`Facility is ${facility.status}. Contact VYRO support to restore terms.`} /> : null}

      {/* Credit card */}
      <Animated.View entering={enter(0)}>
        <View style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink, overflow: 'hidden' }, shadow.ink]}>
          <LinearGradient
            pointerEvents="none"
            colors={['#2F3524', '#171A13', colors.ink]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[danger ? 'rgba(196,90,74,0.22)' : 'rgba(198,220,74,0.16)', 'rgba(198,220,74,0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.35, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: 22, gap: 18 }}>
            <Row justify="space-between">
              <Row gap={8}>
                <Wallet size={16} color={colors.volt} strokeWidth={2} />
                <Text variant="bodySm" weight="medium" color="paperMuted">
                  Available credit
                </Text>
              </Row>
              <Badge label={paused ? 'Paused' : 'Active'} tone={paused ? (danger ? 'danger' : 'warning') : 'volt'} dot size="sm" />
            </Row>

            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 48, letterSpacing: -1.3, color: paused ? colors.paperMuted : colors.paper, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
                {formatRs(availableCents)}
              </Text>
              <Text variant="bodySm" color="paperFaint">
                {paused ? 'New draws paused' : eligible ? `${termsLabel(facility.defaultTerms)} by default · interest-free` : 'Not eligible right now'}
              </Text>
            </View>

            {/* Utilisation meter */}
            <View style={{ gap: 8 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(250,247,240,0.1)', overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(used * 100, used > 0 ? 3 : 0)}%`, height: '100%', borderRadius: 4, backgroundColor: danger ? colors.rose : colors.volt }} />
              </View>
              <Row justify="space-between">
                <Text variant="caption" color="paperMuted">
                  {formatRs(facility.usedCents)} used · {pct}%
                </Text>
                <Text variant="caption" color="paperMuted">
                  Limit {formatRs(facility.limitCents)}
                </Text>
              </Row>
            </View>
          </View>

          <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.paperLine }}>
            <HeroCell label="Terms" value={termsLabel(facility.defaultTerms)} />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
            <HeroCell label="Outstanding" value={outstanding < 100_000 ? formatRs(outstanding) : formatCompactLKR(outstanding)} />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
            <HeroCell label="Open draws" value={String(schedule.length)} />
          </View>
        </View>
      </Animated.View>

      {/* Actions */}
      <Animated.View entering={enter(1)}>
        <Row gap={10}>
          <Button title="Shop on terms" icon={ShoppingBag} disabled={paused} onPress={() => go('/buyer/catalog')} style={{ flex: 1 }} />
          <Button title="Orders" icon={Receipt} variant="secondary" onPress={() => go('/buyer/orders')} style={{ flex: 1 }} />
        </Row>
      </Animated.View>

      {next ? (
        <Animated.View entering={enter(2)}>
          <NextDue drawdown={next} outstanding={outstanding} openCount={schedule.length} />
        </Animated.View>
      ) : null}

      {schedule.length > 1 ? (
        <Animated.View entering={enter(3)}>
          <SectionHeader title="Repayment schedule" />
          <Card>
            {schedule.map((d, i) => (
              <ScheduleRow key={d.id} d={d} last={i === schedule.length - 1} />
            ))}
          </Card>
        </Animated.View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeader title="Drawdowns" style={{ marginBottom: 0, marginTop: 8 }} />
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
          <Card padding={22} radius={radii['2xl']} style={{ alignItems: 'center', gap: 10 }}>
            <IconTile icon={Banknote} tone="paper" size={48} />
            <Text variant="h3" align="center">
              No credit draws yet
            </Text>
            <Text variant="bodySm" color="ink4" align="center">
              At checkout, choose Pay on terms to draw against this facility.
            </Text>
          </Card>
        ) : shown.length === 0 ? (
          <Card>
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

      <ListSection label="How terms work">
        <ListRow icon={CalendarClock} iconTone="paper" title="Net 14 or Net 30" subtitle="Pick your terms at checkout" />
        <ListRow icon={ShieldCheck} iconTone="paper" title="Interest-free" subtitle="Settle the PO by its due date" />
        <ListRow icon={PauseCircle} iconTone="paper" title="Overdue pauses credit" subtitle="Repay to resume new draws" last />
      </ListSection>
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
    <Card kind={overdue ? 'flat' : 'volt'} radius={radii['2xl']} style={overdue ? { backgroundColor: colors.roseSoft } : undefined}>
      <Row gap={12} align="flex-start">
        <View style={{ width: 46, height: 46, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarClock size={21} color={overdue ? colors.rose : colors.volt} strokeWidth={1.7} />
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
      <View style={{ height: 1, backgroundColor: 'rgba(12,14,11,0.1)', marginVertical: 14 }} />
      <Row justify="space-between">
        <Text variant="caption" color="ink3">
          {openCount} open draw{openCount === 1 ? '' : 's'} · {formatLKR(outstanding)} outstanding
        </Text>
        <Touchable
          onPress={() => go(`/buyer/order/${d.purchaseOrderId}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.ink }}
        >
          <Text variant="caption" weight="semibold" color="paper">
            View PO
          </Text>
          <ArrowRight size={13} color={colors.volt} />
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
        <View style={{ width: 46, paddingVertical: 7, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: overdue ? colors.roseSoft : colors.bone, alignItems: 'center' }}>
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
    <Card padding={14} style={{ gap: 12 }}>
      <Row justify="space-between" gap={12}>
        <IconTile icon={Banknote} tone={d.status === 'overdue' ? 'danger' : d.status === 'active' ? 'success' : 'paper'} size={42} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="h3">{termsLabel(d.terms)}</Text>
          <Badge label={drawdownStatusLabel(d.status)} tone={tone} dot size="sm" />
        </View>
        <MoneyMono cents={d.amountCents} />
      </Row>
      <ProgressBar value={d.repaidCents} max={Math.max(d.amountCents, 1)} tone={d.status === 'overdue' ? 'danger' : 'ink'} height={6} track={colors.bone} />
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
  return <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, letterSpacing: -0.4, color: colors.ink }}>{formatLKR(cents)}</Text>;
}

function HeroCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 3 }}>
      <Text variant="caption" color="paperFaint" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="h3" color="paper" numberOfLines={1} adjustsFontSizeToFit tabular>
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
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: radii.xl,
                      borderCurve: 'continuous',
                      backgroundColor: state === 'done' ? colors.mintSoft : state === 'current' ? colors.voltSoft : colors.pearl,
                    },
                    state === 'current' ? shadow.sm : null,
                  ]}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: state === 'done' ? colors.mint : state === 'current' ? colors.ink : colors.paper,
                    }}
                  >
                    {state === 'done' ? (
                      <Check size={14} color={colors.paper} strokeWidth={3} />
                    ) : (
                      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: state === 'current' ? colors.volt : colors.ink4 }}>{i + 1}</Text>
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
        <SectionHeader title="How it works" style={{ marginBottom: 0 }} />
        {[
          { icon: Package, title: 'Buy as usual', body: 'Place mill-gate POs from the catalog. The first three must be paid in full — not on terms.' },
          { icon: ShieldCheck, title: 'Facility unlocks', body: `After three settled orders, VYRO grants a ${formatLKR(CREDIT_STARTING_LIMIT_CENTS)} limit on this workspace automatically.` },
          { icon: Clock, title: 'Checkout on terms', body: 'Choose Net 14 or Net 30 at checkout. Settle the PO by the due date to keep the line open.' },
        ].map((s, i) => (
          <Card key={s.title} style={{ flexDirection: 'row', gap: 14 }}>
            <IconTile icon={s.icon} tone="copper" size={42} />
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
          <Card style={{ flex: 1, gap: 6 }}>
            <IconTile icon={CalendarClock} tone="paper" size={34} />
            <Text variant="h3">Net 14</Text>
            <Text variant="caption" color="ink3">
              Full PO balance due 14 days after you draw. Use it when stock turns quickly.
            </Text>
          </Card>
          <Card kind="ink" style={{ flex: 1, gap: 6 }}>
            <IconTile icon={CalendarClock} tone="glass" size={34} />
            <Text variant="h3" color="paper">Net 30</Text>
            <Text variant="caption" color="paperMuted">
              Full PO balance due in 30 days. Default terms on a new facility.
            </Text>
          </Card>
        </Row>
      </Animated.View>
    </View>
  );
}
