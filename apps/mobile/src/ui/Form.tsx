import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch as RNSwitch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Check, ChevronDown, Eye, EyeOff, Minus, Plus, Search, X, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { Touchable } from './Button';
import { Sheet } from './Sheet';

export function Field({
  label,
  hint,
  error,
  children,
  right,
  style,
  required,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  required?: boolean;
}) {
  return (
    <View style={[{ gap: 7 }, style]}>
      {label || right ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          {label ? (
            <Text variant="caption" color="ink3" style={{ fontFamily: fonts.sansSemi, letterSpacing: 0.3, fontSize: 12.5, marginLeft: 2 }}>
              {label}
              {required ? <Text variant="caption" color="copper"> *</Text> : null}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" color="rose">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="ink4">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends TextInputProps {
  icon?: LucideIcon;
  suffix?: string;
  prefix?: string;
  invalid?: boolean;
  dark?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { icon: Icon, suffix, prefix, invalid, dark, secureTextEntry, containerStyle, style, multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const border = invalid ? colors.rose : focused ? (dark ? colors.volt : colors.ink) : dark ? colors.paperLine : 'rgba(12,14,11,0.09)';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          minHeight: multiline ? 116 : 54,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          borderRadius: radii.lg + 2,
          borderCurve: 'continuous',
          backgroundColor: dark ? 'rgba(250,247,240,0.06)' : colors.paper,
          borderWidth: 1.5,
          borderColor: border,
        },
        focused && !invalid ? shadow.focus : !dark ? shadow.sm : null,
        containerStyle,
      ]}
    >
      {Icon ? <Icon size={17} color={focused ? (dark ? colors.volt : colors.ink) : colors.ink5} strokeWidth={1.8} /> : null}
      {prefix ? (
        <Text variant="mono" color="ink4">
          {prefix}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={dark ? colors.paperFaint : colors.ink5}
        selectionColor={colors.copper}
        cursorColor={colors.ink}
        secureTextEntry={hidden}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            flex: 1,
            fontFamily: fonts.sans,
            fontSize: 15.5,
            color: dark ? colors.paper : colors.ink,
            paddingVertical: multiline ? 0 : 12,
            minHeight: multiline ? 86 : undefined,
          },
          style,
        ]}
        {...rest}
      />
      {suffix ? (
        <Text variant="mono" color="ink4">
          {suffix}
        </Text>
      ) : null}
      {secureTextEntry ? (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
          {hidden ? <Eye size={18} color={colors.ink4} /> : <EyeOff size={18} color={colors.ink4} />}
        </Pressable>
      ) : null}
    </View>
  );
});

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  autoFocus,
  dark,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 50,
          paddingHorizontal: 16,
          borderRadius: radii.pill,
          backgroundColor: dark ? 'rgba(250,247,240,0.08)' : colors.paper,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: dark ? colors.paperLine : 'rgba(12,14,11,0.08)',
        },
        dark ? null : shadow.card,
        style,
      ]}
    >
      <Search size={18} color={dark ? colors.volt : colors.ink4} strokeWidth={1.8} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? colors.paperFaint : colors.ink5}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={colors.copper}
        style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: dark ? colors.paper : colors.ink }}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityLabel="Clear search"
          style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(250,247,240,0.14)' : colors.ink6 }}
        >
          <X size={13} color={dark ? colors.paper : colors.ink3} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

/** Field-looking button that opens a bottom sheet list of options. */
export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  title,
  disabled,
}: {
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Touchable
        disabled={disabled}
        onPress={() => {
          haptic.tap();
          setOpen(true);
        }}
        scaleTo={0.99}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 54,
            paddingHorizontal: 16,
            borderRadius: radii.lg + 2,
            borderCurve: 'continuous',
            backgroundColor: colors.paper,
            borderWidth: 1.5,
            borderColor: 'rgba(12,14,11,0.09)',
            opacity: disabled ? 0.5 : 1,
          },
          shadow.sm,
        ]}
      >
        <Text variant="body" color={current ? 'ink' : 'ink5'} numberOfLines={1} style={{ flex: 1 }}>
          {current?.label ?? placeholder}
        </Text>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronDown size={16} color={colors.ink3} />
        </View>
      </Touchable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? placeholder} scroll>
        <View style={{ paddingBottom: 8 }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Touchable
                key={o.value}
                onPress={() => {
                  haptic.tap();
                  onChange(o.value);
                  setOpen(false);
                }}
                scaleTo={0.99}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  marginBottom: i === options.length - 1 ? 0 : 6,
                  borderRadius: radii.lg,
                  backgroundColor: on ? colors.paper : 'transparent',
                  borderWidth: 1,
                  borderColor: on ? colors.ink : 'transparent',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight={on ? 'semibold' : 'regular'}>
                    {o.label}
                  </Text>
                  {o.hint ? (
                    <Text variant="caption" color="ink4">
                      {o.hint}
                    </Text>
                  ) : null}
                </View>
                {on ? (
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={15} color={colors.ink} strokeWidth={2.4} />
                  </View>
                ) : null}
              </Touchable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

export function Switch({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        haptic.tap();
        onValueChange(v);
      }}
      trackColor={{ false: colors.ink6, true: colors.ink }}
      thumbColor={value ? colors.volt : colors.paper}
      ios_backgroundColor={colors.ink6}
    />
  );
}

/** Label + description + switch in one row. */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  last,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.lineSoft,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="ink4">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onChange(!checked);
      }}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          marginTop: 1,
          borderWidth: 1.5,
          borderColor: checked ? colors.ink : colors.lineStrong,
          backgroundColor: checked ? colors.ink : colors.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check size={14} color={colors.volt} strokeWidth={3} /> : null}
      </View>
      {label ? (
        <View style={{ flex: 1 }}>
          <Text variant="body">{label}</Text>
          {description ? (
            <Text variant="caption" color="ink4">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** −  qty  + stepper for cart lines and MOQ-aware inputs. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  size = 'md',
  dark,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
  dark?: boolean;
}) {
  const h = size === 'sm' ? 34 : 42;
  const set = (v: number) => {
    const next = Math.max(min, max !== undefined ? Math.min(max, v) : v);
    if (next !== value) {
      haptic.tap();
      onChange(next);
    }
  };
  const btn = (Icon: LucideIcon, fn: () => void, disabled: boolean, label: string) => (
    <Touchable
      onPress={fn}
      disabled={disabled}
      scaleTo={0.88}
      accessibilityLabel={label}
      style={{
        width: h - 4,
        height: h - 4,
        borderRadius: (h - 4) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? 'rgba(250,247,240,0.08)' : colors.bone,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Icon size={16} color={dark ? colors.paper : colors.ink} strokeWidth={2.2} />
    </Touchable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: dark ? colors.paperLine : 'rgba(12,14,11,0.08)',
        backgroundColor: dark ? 'rgba(250,247,240,0.06)' : colors.paper,
        padding: 2,
        ...(dark ? null : shadow.sm),
      }}
    >
      {btn(Minus, () => set(value - step), value <= min, 'Decrease quantity')}
      <TextInput
        value={String(value)}
        keyboardType="number-pad"
        onChangeText={(t) => {
          const n = parseInt(t.replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) set(n);
        }}
        style={{ minWidth: 36, textAlign: 'center', fontFamily: fonts.monoMedium, fontSize: size === 'sm' ? 14 : 16, color: dark ? colors.paper : colors.ink }}
        selectTextOnFocus
      />
      {btn(Plus, () => set(value + step), max !== undefined && value >= max, 'Increase quantity')}
    </View>
  );
}

/** Group of options as selectable cards — radio style. */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description?: string; icon?: LucideIcon; disabled?: boolean }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Touchable
            key={o.value}
            disabled={o.disabled}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            scaleTo={0.985}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: radii.xl,
                borderCurve: 'continuous',
                borderWidth: 1.5,
                borderColor: on ? colors.ink : 'rgba(12,14,11,0.07)',
                backgroundColor: colors.paper,
                opacity: o.disabled ? 0.45 : 1,
              },
              on ? shadow.md : shadow.sm,
            ]}
          >
            {Icon ? (
              <View style={{ width: 40, height: 40, borderRadius: 13, borderCurve: 'continuous', backgroundColor: on ? colors.ink : colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={on ? colors.volt : colors.ink} strokeWidth={1.7} />
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="semibold">
                {o.label}
              </Text>
              {o.description ? (
                <Text variant="caption" color="ink4">
                  {o.description}
                </Text>
              ) : null}
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: on ? 6 : 1.5,
                borderColor: on ? colors.ink : colors.lineStrong,
                backgroundColor: on ? colors.volt : 'transparent',
              }}
            />
          </Touchable>
        );
      })}
    </View>
  );
}
