import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, X } from 'lucide-react-native';
import { api, qs } from '@/lib/api';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { formatLKR } from '@/lib/format';
import { ProductImage, Text, Touchable } from '@/ui';
import { go, productHref } from '../data';
import type { SearchHit } from '../types';

/**
 * Port of components/CatalogSearch.tsx: a search field with live typeahead
 * (debounced `/search/products?limit=8`) that jumps straight to a product,
 * or submits the term to the catalog.
 */
export function CatalogSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search rice, sugar, tea, oil, packaging…',
  autoFocus,
  variant = 'bar',
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (term: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  variant?: 'bar' | 'hero';
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 220);
    return () => clearTimeout(t);
  }, [value]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['catalog-typeahead', debounced],
    queryFn: () => api.get<{ hits: SearchHit[] }>('/search/products' + qs({ q: debounced, limit: 8 })),
    enabled,
    staleTime: 30_000,
  });
  const hits = enabled ? (data?.hits ?? []) : [];
  const open = focused && enabled;
  const hero = variant === 'hero';

  function submit() {
    Keyboard.dismiss();
    setFocused(false);
    onSubmit(value.trim());
  }

  return (
    <View style={style}>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            height: hero ? 56 : 50,
            paddingLeft: 14,
            paddingRight: hero ? 6 : 12,
            borderRadius: radii.xl,
            backgroundColor: colors.paper,
            borderWidth: focused ? 1.5 : 1,
            borderColor: focused ? (hero ? colors.volt : colors.ink) : colors.line,
          },
          hero ? shadow.lg : null,
        ]}
      >
        <Search size={18} color={focused ? colors.ink : colors.ink4} strokeWidth={1.8} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.ink5}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onSubmitEditing={submit}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          selectionColor={colors.copper}
          accessibilityLabel="Search wholesale catalog"
          style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: colors.ink }}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={17} color={colors.ink4} />
          </Pressable>
        ) : null}
        {hero ? (
          <Touchable
            onPress={submit}
            hapticOnPress
            scaleTo={0.94}
            style={{ height: 44, paddingHorizontal: 16, borderRadius: radii.lg, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 14, color: colors.paper }}>Search</Text>
          </Touchable>
        ) : null}
      </View>

      {open ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={[{ marginTop: 6, backgroundColor: colors.paper, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }, shadow.md]}
        >
          {isFetching && hits.length === 0 ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14 }}>
              <ActivityIndicator size="small" color={colors.ink} />
              <Text variant="caption" color="ink4">
                Searching lots…
              </Text>
            </View>
          ) : hits.length === 0 ? (
            <Text variant="bodySm" color="ink3" style={{ padding: 14 }}>
              No lots match “{debounced}”. Tap search to browse the catalog.
            </Text>
          ) : (
            hits.map((hit, i) => (
              <Touchable
                key={hit.product.id}
                scaleTo={0.99}
                onPress={() => {
                  Keyboard.dismiss();
                  setFocused(false);
                  go(productHref(hit.product.id));
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderBottomWidth: i === hits.length - 1 ? 0 : 1,
                  borderBottomColor: colors.lineSoft,
                }}
              >
                <ProductImage src={hit.product.imageUrl} seed={hit.product.id} style={{ width: 40, height: 40, borderRadius: radii.md }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                    {hit.product.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink4 }} numberOfLines={1}>
                    {hit.product.brand ? `${hit.product.brand} · ` : ''}
                    {hit.bestOffer?.supplier.name ?? hit.product.unit}
                  </Text>
                </View>
                {hit.bestOffer ? (
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink }}>{formatLKR(hit.bestOffer.priceCents)}</Text>
                ) : (
                  <Text variant="caption" color="ink4">
                    Quote
                  </Text>
                )}
                <ArrowUpRight size={14} color={colors.ink5} />
              </Touchable>
            ))
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}
