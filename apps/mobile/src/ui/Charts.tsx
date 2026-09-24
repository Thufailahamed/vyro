import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { colors, fonts } from '@/theme/tokens';
import { Text } from './Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

/** One-shot 0→1 draw progress shared across a chart's parts. */
function useDrawOn(enabled = true) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!enabled) return;
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [enabled, reduced, t]);
  return t;
}

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next && next !== w) setW(next);
  };
  return { w, onLayout };
}

function buildPath(values: number[], w: number, h: number, pad = 4) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / range)] as const);
  // Smooth cubic path through the points.
  let d = '';
  pts.forEach(([x, y], i) => {
    if (i === 0) d = `M${x},${y}`;
    else {
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      d += ` C${cx},${py} ${cx},${y} ${x},${y}`;
    }
  });
  return { d, pts };
}

/** Tiny trend line for stat tiles. */
export function Sparkline({
  values,
  height = 36,
  color = colors.volt,
  fill = true,
}: {
  values: number[];
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const { w, onLayout } = useWidth(120);
  const t = useDrawOn(values.length > 0);
  // pathLength isn't exposed by react-native-svg — use a generous dash period
  // (path can never exceed w + per-segment vertical travel) and sweep the offset.
  const dashLen = (w + height * Math.max(2, values.length)) * 1.5;
  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - t.value) * dashLen }));
  const fadeProps = useAnimatedProps(() => ({ opacity: t.value }));
  if (!values.length) return <View style={{ height }} />;
  const data = values.length === 1 ? [values[0], values[0]] : values;
  const { d, pts } = buildPath(data, w, height);
  const last = pts[pts.length - 1];
  const id = `spark-${color.replace('#', '')}`;
  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {fill ? <AnimatedPath d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} animatedProps={fadeProps} /> : null}
        <AnimatedPath
          d={d}
          stroke={color}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashLen}
          animatedProps={drawProps}
        />
        <AnimatedG animatedProps={fadeProps}>
          <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
        </AnimatedG>
      </Svg>
    </View>
  );
}

/** Area chart with axis labels — revenue/spend over time. */
export function AreaChart({
  data,
  height = 180,
  dark,
  formatValue = (v) => String(Math.round(v)),
  color,
}: {
  data: { label: string; value: number }[];
  height?: number;
  dark?: boolean;
  formatValue?: (v: number) => string;
  color?: string;
}) {
  const { w, onLayout } = useWidth();
  const stroke = color ?? (dark ? colors.volt : colors.ink);
  const [active, setActive] = useState<number | null>(null);
  const t = useDrawOn(data.length > 0);
  const chartHForDash = height - 26;
  const dashLen = (w + chartHForDash * Math.max(2, data.length)) * 1.5;
  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - t.value) * dashLen }));
  const fadeProps = useAnimatedProps(() => ({ opacity: t.value }));
  if (!data.length) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'}>
          No data for this period yet
        </Text>
      </View>
    );
  }
  const values = data.length === 1 ? [data[0].value, data[0].value] : data.map((d) => d.value);
  const chartH = height - 26;
  const { d, pts } = buildPath(values, w, chartH, 8);
  const last = pts[pts.length - 1];
  const max = Math.max(...values);
  const idx = active ?? data.length - 1;
  const shown = data[Math.min(idx, data.length - 1)];
  const gid = dark ? 'area-dark' : 'area-light';
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));
  return (
    <View onLayout={onLayout}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text variant="caption" color={dark ? 'paperMuted' : 'ink4'}>
          {shown?.label}
        </Text>
        <Text variant="mono" color={dark ? 'volt' : 'ink'} style={{ fontFamily: fonts.monoMedium }}>
          {formatValue(shown?.value ?? 0)}
        </Text>
      </View>
      <Svg
        width={w}
        height={chartH}
        onPress={() => setActive(null)}
      >
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={dark ? colors.volt : colors.volt} stopOpacity={dark ? 0.3 : 0.5} />
            <Stop offset="1" stopColor={dark ? colors.volt : colors.volt} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={0} x2={w} y1={chartH * f} y2={chartH * f} stroke={dark ? colors.paperLine : colors.lineSoft} strokeDasharray="3 5" />
        ))}
        <AnimatedPath d={`${d} L${last[0]},${chartH} L${pts[0][0]},${chartH} Z`} fill={`url(#${gid})`} animatedProps={fadeProps} />
        <AnimatedPath
          d={d}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashLen}
          animatedProps={drawProps}
        />
        {pts.map(([x, y], i) => (
          <G key={i}>
            <Rect x={x - w / pts.length / 2} y={0} width={w / pts.length} height={chartH} fill="transparent" onPressIn={() => setActive(i)} />
            {i === idx ? (
              <>
                <Line x1={x} x2={x} y1={0} y2={chartH} stroke={dark ? colors.paperFaint : colors.line} />
                <Circle cx={x} cy={y} r={5} fill={colors.volt} stroke={dark ? colors.ink : colors.ink} strokeWidth={2} />
              </>
            ) : null}
          </G>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {data.map((p, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <Text key={i} variant="caption" color={dark ? 'paperFaint' : 'ink5'} style={{ fontSize: 10 }}>
              {p.label}
            </Text>
          ) : null,
        )}
      </View>
      {max === 0 ? null : null}
    </View>
  );
}

/** Vertical bar chart — top categories, orders per day, etc. */
export function BarChart({
  data,
  height = 160,
  dark,
  formatValue = (v) => String(Math.round(v)),
  highlightMax = true,
}: {
  data: { label: string; value: number }[];
  height?: number;
  dark?: boolean;
  formatValue?: (v: number) => string;
  highlightMax?: boolean;
}) {
  const { w, onLayout } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const t = useDrawOn(data.length > 0);
  if (!data.length) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'}>
          Nothing to chart yet
        </Text>
      </View>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const chartH = height - 22;
  const gap = 6;
  const bw = Math.max(4, (w - gap * (data.length - 1)) / data.length);
  const maxIdx = data.findIndex((d) => d.value === max);
  return (
    <View onLayout={onLayout}>
      {active !== null ? (
        <Text variant="mono" color={dark ? 'volt' : 'ink'} style={{ marginBottom: 6 }}>
          {data[active].label} · {formatValue(data[active].value)}
        </Text>
      ) : null}
      <Svg width={w} height={chartH}>
        {data.map((d, i) => {
          const bh = Math.max(2, (d.value / max) * (chartH - 4));
          const on = active === i || (active === null && highlightMax && i === maxIdx);
          return (
            <GrowBar
              key={i}
              t={t}
              i={i}
              x={i * (bw + gap)}
              bh={bh}
              chartH={chartH}
              bw={bw}
              fill={on ? colors.volt : dark ? 'rgba(250,247,240,0.18)' : colors.ink}
              opacity={on ? 1 : dark ? 1 : 0.85}
              onPressIn={() => setActive(i)}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 6, gap }}>
        {data.map((d, i) => (
          <Text key={i} variant="caption" color={dark ? 'paperFaint' : 'ink5'} numberOfLines={1} style={{ width: bw, fontSize: 9.5, textAlign: 'center' }}>
            {data.length > 8 && i % 2 ? '' : d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function GrowBar({
  t,
  i,
  x,
  bh,
  chartH,
  bw,
  fill,
  opacity,
  onPressIn,
}: {
  t: SharedValue<number>;
  i: number;
  x: number;
  bh: number;
  chartH: number;
  bw: number;
  fill: string;
  opacity: number;
  onPressIn: () => void;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, t.value * 1.4 - i * 0.06));
    const h = bh * local;
    return { y: chartH - h, height: h };
  });
  return <AnimatedRect x={x} y={chartH - bh} width={bw} height={bh} rx={Math.min(4, bw / 2)} fill={fill} opacity={opacity} onPressIn={onPressIn} animatedProps={props} />;
}

/** Horizontal ranked bars with labels — "top suppliers", "top products". */
export function RankBars({
  data,
  formatValue = (v) => String(Math.round(v)),
  dark,
}: {
  data: { label: string; value: number; hint?: string }[];
  formatValue?: (v: number) => string;
  dark?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ gap: 12 }}>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text variant="bodySm" weight="medium" color={dark ? 'paper' : 'ink'} numberOfLines={1} style={{ flex: 1 }}>
              {d.label}
            </Text>
            <Text variant="mono" color={dark ? 'paperMuted' : 'ink3'}>
              {formatValue(d.value)}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: dark ? colors.paperLine : colors.mist, overflow: 'hidden' }}>
            <RankFill pct={d.value / max} i={i} color={i === 0 ? colors.volt : dark ? colors.paperMuted : colors.ink} />
          </View>
        </View>
      ))}
    </View>
  );
}

function RankFill({ pct, i, color }: { pct: number; i: number; color: string }) {
  const reduced = useReducedMotion();
  const w = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      w.value = pct;
      return;
    }
    w.value = withDelay(i * 70, withTiming(pct, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [pct, i, reduced, w]);
  const anim = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, anim]} />;
}

/** Donut with centred total and a legend. */
export function Donut({
  data,
  size = 140,
  thickness = 16,
  centerLabel,
  centerValue,
  dark,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  dark?: boolean;
}) {
  const palette = [colors.volt, colors.copper, dark ? colors.paper : colors.ink, colors.mint, colors.amber, colors.ink5];
  const t = useDrawOn(data.length > 0);
  const spinProps = useAnimatedProps(() => ({ opacity: t.value }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? colors.paperLine : colors.mist} strokeWidth={thickness} fill="none" />
          {data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <AnimatedG key={i} animatedProps={spinProps}>
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={d.color ?? palette[i % palette.length]}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                  strokeDashoffset={-acc}
                />
              </AnimatedG>
            );
            // eslint-disable-next-line react-hooks/immutability -- local accumulator for dash offsets within this render pass
            acc += len;
            return el;
          })}
        </Svg>
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          {centerValue ? (
            <Text variant="metricSm" color={dark ? 'paper' : 'ink'} style={{ fontSize: 19 }}>
              {centerValue}
            </Text>
          ) : null}
          {centerLabel ? (
            <Text variant="caption" color={dark ? 'paperMuted' : 'ink4'}>
              {centerLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: d.color ?? palette[i % palette.length] }} />
            <Text variant="caption" color={dark ? 'paperMuted' : 'ink3'} style={{ flex: 1 }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text variant="caption" color={dark ? 'paper' : 'ink'} style={{ fontFamily: fonts.monoMedium }}>
              {Math.round((d.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
