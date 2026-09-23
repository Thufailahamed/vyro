import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, fonts } from '@/theme/tokens';
import { Text } from './Text';

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
        {fill ? <Path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} /> : null}
        <Path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
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
        <Path d={`${d} L${last[0]},${chartH} L${pts[0][0]},${chartH} Z`} fill={`url(#${gid})`} />
        <Path d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" />
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
            <Rect
              key={i}
              x={i * (bw + gap)}
              y={chartH - bh}
              width={bw}
              height={bh}
              rx={Math.min(4, bw / 2)}
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
            <View style={{ width: `${(d.value / max) * 100}%`, height: 6, borderRadius: 3, backgroundColor: i === 0 ? colors.volt : dark ? colors.paperMuted : colors.ink }} />
          </View>
        </View>
      ))}
    </View>
  );
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
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={d.color ?? palette[i % palette.length]}
                strokeWidth={thickness}
                fill="none"
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-acc}
              />
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
