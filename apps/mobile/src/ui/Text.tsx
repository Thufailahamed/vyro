import { Text as RNText, type TextProps as RNTextProps, type TextStyle, type StyleProp } from 'react-native';
import { colors, type as typeScale, type TypeVariant, type ColorName } from '@/theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: ColorName;
  align?: TextStyle['textAlign'];
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
}

const SANS_WEIGHT: Record<NonNullable<TextProps['weight']>, string> = {
  regular: 'Sans-Regular',
  medium: 'Sans-Medium',
  semibold: 'Sans-Semi',
  bold: 'Sans-Bold',
};

/**
 * All copy goes through this. Variants map to the web type scale:
 * display* / h1 / h2 use Plus Jakarta Sans, body and figures use Inter (tabular).
 */
export function Text({ variant = 'body', color = 'ink', align, weight, tabular, style, ...rest }: TextProps) {
  const base = typeScale[variant] as TextStyle;
  const isSans = base.fontFamily?.startsWith('Sans-');
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: colors[color] },
        align ? { textAlign: align } : null,
        weight && isSans ? { fontFamily: SANS_WEIGHT[weight] } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}

/** Uppercase copper kicker — the web's `.vyro-kicker`. */
export function Kicker({ children, color = 'copper', style }: { children: React.ReactNode; color?: ColorName; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant="overline" color={color} style={style}>
      {children}
    </Text>
  );
}
