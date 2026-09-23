import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Camera, Check, CheckCircle2, GraduationCap, ImageIcon, Plus, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii, tones } from '@/theme/tokens';
import { useSupplierId } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { Card, Kicker, ListRow, ProductImage, Row, Sheet, Skeleton, Text, Touchable } from '@/ui';
import { AVAIL_LABEL, AVAIL_ORDER, AVAIL_TONE, go, productMeta, useOnboardingGate, type Availability, type CatalogProduct } from './api';

/** Staggered entrance used by every list in this area. */
export function FadeInItem({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 45).duration(380)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Stock pill — mint / amber / rose with a status dot, optional quantity. */
export function StockChip({ status, qty, unit }: { status: Availability; qty?: number | null; unit?: string | null }) {
  const t = tones[AVAIL_TONE[status]];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        height: 24,
        borderRadius: radii.pill,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />
      <Text style={{ fontFamily: fonts.sansSemi, fontSize: 11, color: t.fg }}>{AVAIL_LABEL[status]}</Text>
      {qty !== undefined && qty !== null ? (
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: t.fg }}>
          · {qty.toLocaleString()}
          {unit ? ` ${unit}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

/** Small neutral chip with icon + mono label (MOQ, lead time, radius…). */
export function MetaChip({ icon: Icon, label, tone = 'bone' }: { icon?: LucideIcon; label: string; tone?: 'bone' | 'volt' | 'copper' | 'ink' }) {
  const bg = tone === 'volt' ? colors.voltSoft : tone === 'copper' ? colors.copperSoft : tone === 'ink' ? colors.ink : colors.pearl;
  const fg = tone === 'volt' ? colors.voltDeep : tone === 'copper' ? colors.copperDeep : tone === 'ink' ? colors.paper : colors.ink3;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        height: 24,
        borderRadius: radii.md,
        backgroundColor: bg,
        borderWidth: tone === 'bone' ? 1 : 0,
        borderColor: colors.lineSoft,
      }}
    >
      {Icon ? <Icon size={11} color={tone === 'ink' ? colors.volt : fg} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Three-way stock toggle (in / low / out) with semantic colours. */
export function AvailabilityToggle({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: Availability;
  onChange: (v: Availability) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.mist, borderRadius: radii.lg + 2, padding: 3, gap: 3, opacity: disabled ? 0.6 : 1 }}>
      {AVAIL_ORDER.map((s) => {
        const on = s === value;
        const t = tones[AVAIL_TONE[s]];
        return (
          <Touchable
            key={s}
            disabled={disabled || on}
            onPress={() => {
              haptic.tap();
              onChange(s);
            }}
            scaleTo={0.95}
            style={{
              flex: 1,
              height: compact ? 30 : 36,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
              backgroundColor: on ? t.dot : 'transparent',
            }}
          >
            {!on ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} /> : null}
            <Text style={{ fontFamily: on ? fonts.sansSemi : fonts.sansMedium, fontSize: compact ? 11.5 : 12.5, color: on ? colors.paper : colors.ink3 }} numberOfLines={1}>
              {AVAIL_LABEL[s]}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** Wrapping preset chips (units, MOQ, lead time, radius). */
export function PresetChips({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.label + o.value}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            scaleTo={0.94}
            style={{
              paddingHorizontal: 10,
              height: 30,
              justifyContent: 'center',
              borderRadius: radii.md + 1,
              backgroundColor: on ? colors.ink : colors.paper,
              borderWidth: 1,
              borderColor: on ? colors.ink : colors.line,
            }}
          >
            <Text style={{ fontFamily: on ? fonts.monoMedium : fonts.mono, fontSize: 12, color: on ? colors.volt : colors.ink3 }}>{o.label}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** Numbered form section card, the web's SectionCard. */
export function StepSection({
  step,
  kicker,
  title,
  sub,
  complete,
  right,
  children,
}: {
  step?: number;
  kicker: string;
  title: string;
  sub?: string;
  complete?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card kind="flat" padding={16} style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        {step !== undefined ? (
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: complete ? colors.mint : colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {complete ? <Check size={15} color={colors.paper} strokeWidth={2.6} /> : <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.volt }}>{step}</Text>}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 3 }}>
          <Kicker>{kicker}</Kicker>
          <Text variant="h2">{title}</Text>
          {sub ? (
            <Text variant="caption" color="ink4">
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** The web's LearningCta: surfaces missing onboarding lessons. */
export function TrainingBanner({ variant = 'banner' }: { variant?: 'banner' | 'inline' }) {
  const supplierId = useSupplierId();
  const gate = useOnboardingGate(supplierId);
  const data = gate.data;
  if (!data?.required) return null;
  if (variant === 'inline') {
    return (
      <Touchable onPress={() => go('/supplier/learning')} hapticOnPress>
        <Row gap={8} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.lg, backgroundColor: colors.amberSoft }}>
          <GraduationCap size={15} color={colors.amber} />
          <Text variant="caption" style={{ flex: 1, color: tones.warning.fg }}>
            Complete training to publish ({data.missing.length} pending)
          </Text>
          <ArrowRight size={14} color={colors.ink} />
        </Row>
      </Touchable>
    );
  }
  return (
    <Card kind="flat" padding={14} style={{ backgroundColor: colors.amberSoft, borderColor: tones.warning.border, gap: 10 }}>
      <Row gap={10} align="flex-start">
        <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(196,132,58,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={17} color={colors.amber} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodySm" weight="semibold">
            Complete training to publish ({data.missing.length} pending)
          </Text>
          {data.missing.slice(0, 3).map((m) => (
            <Text key={m.slug} variant="caption" color="copperDeep" onPress={() => go(`/supplier/learning/${m.slug}`)} style={{ textDecorationLine: 'underline' }}>
              {m.title}
            </Text>
          ))}
          {data.missing.length > 3 ? (
            <Text variant="caption" color="ink4">
              + {data.missing.length - 3} more
            </Text>
          ) : null}
        </View>
      </Row>
      <Touchable onPress={() => go('/supplier/learning')} hapticOnPress style={{ alignSelf: 'flex-start' }}>
        <Row gap={6} style={{ backgroundColor: colors.ink, paddingHorizontal: 12, height: 32, borderRadius: radii.lg }}>
          <Text variant="caption" color="paper" weight="semibold">
            Open training
          </Text>
          <ArrowRight size={12} color={colors.volt} />
        </Row>
      </Touchable>
    </Card>
  );
}

/** Three-step explainer used on empty launchpads. */
export function HowItWorks({ title, steps }: { title: string; steps: { title: string; body: string }[] }) {
  return (
    <View style={{ gap: 10 }}>
      <Kicker color="ink4">{title}</Kicker>
      {steps.map((s, i) => (
        <FadeInItem key={s.title} index={i}>
          <Card kind="bone" padding={14}>
            <Row gap={12} align="flex-start">
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.volt }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="bodySm" weight="semibold">
                  {s.title}
                </Text>
                <Text variant="caption" color="ink4">
                  {s.body}
                </Text>
              </View>
            </Row>
          </Card>
        </FadeInItem>
      ))}
    </View>
  );
}

/** Unlisted master commodities → pre-filled listing form. */
export function QuickStartGrid({ title, hint, products, cta }: { title: string; hint: string; products: CatalogProduct[]; cta: string }) {
  if (!products.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Row justify="space-between" align="flex-end">
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{title}</Text>
          <Text variant="caption" color="ink4">
            {hint}
          </Text>
        </View>
        <Text variant="caption" color="copper" weight="semibold" onPress={() => go('/supplier/products/new')}>
          Full catalog →
        </Text>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {products.map((p, i) => (
          <FadeInItem key={p.id} index={i} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <Card kind="flat" padding={0} onPress={() => go(`/supplier/products/new?productId=${encodeURIComponent(p.id)}`)} style={{ overflow: 'hidden' }}>
              <ProductImage src={p.imageUrl} seed={p.id} style={{ height: 92 }} />
              <View style={{ padding: 10, gap: 6 }}>
                <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text variant="caption" color="ink4" numberOfLines={1}>
                  {productMeta(p) || 'Standard SKU'}
                </Text>
                <Row gap={4}>
                  <Plus size={12} color={colors.copper} />
                  <Text variant="caption" color="copper" weight="semibold" numberOfLines={1}>
                    {cta}
                  </Text>
                </Row>
              </View>
            </Card>
          </FadeInItem>
        ))}
      </View>
    </View>
  );
}

/** Ink tip card closing list screens. */
export function InkTip({ kicker, text, icon: Icon }: { kicker: string; text: string; icon: LucideIcon }) {
  return (
    <Card kind="ink" flow={kicker} padding={16}>
      <Row gap={12} align="flex-start">
        <Icon size={19} color={colors.volt} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 4 }}>
          <Kicker color="volt">{kicker}</Kicker>
          <Text variant="bodySm" color="paperMuted">
            {text}
          </Text>
        </View>
      </Row>
    </Card>
  );
}

/** Camera vs. library choice before calling pickImage. */
export function ImageSourceSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (camera: boolean) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Add product photo" subtitle="JPG, PNG or WEBP up to 5 MB. Show the packaging as it leaves your depot.">
      <ListRow icon={Camera} iconTone="volt" title="Take a photo" subtitle="Use the camera" onPress={() => onPick(true)} />
      <ListRow icon={ImageIcon} title="Choose from library" subtitle="Pick an existing photo" onPress={() => onPick(false)} last />
    </Sheet>
  );
}

/** Loading placeholder shaped like an offer card. */
export function OfferCardSkeleton() {
  return (
    <Card kind="flat" padding={12}>
      <Row gap={12} align="flex-start">
        <Skeleton width={88} height={88} radius={radii.lg} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="80%" height={16} />
          <Skeleton width="50%" height={12} />
          <Skeleton width="40%" height={20} />
          <Row gap={6}>
            <Skeleton width={70} height={22} radius={radii.pill} />
            <Skeleton width={60} height={22} radius={radii.md} />
          </Row>
        </View>
      </Row>
    </Card>
  );
}

export function SkeletonCards({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <OfferCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Readiness checklist row. */
export function CheckRow({ done, label, optional }: { done: boolean; label: string; optional?: boolean }) {
  return (
    <Row gap={10}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? colors.mintSoft : colors.bone,
          borderWidth: 1,
          borderColor: done ? tones.success.border : colors.line,
        }}
      >
        {done ? <CheckCircle2 size={13} color={colors.mint} /> : null}
      </View>
      <Text variant="bodySm" color={done ? 'mint' : optional ? 'ink4' : 'ink3'} weight={done ? 'semibold' : 'regular'} style={{ flex: 1 }}>
        {label}
        {optional ? <Text variant="caption" color="ink5">{'  '}optional</Text> : null}
      </Text>
    </Row>
  );
}
