import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Mail, MapPin, Phone, ShieldCheck, Store, User, type LucideIcon } from 'lucide-react-native';
import { Button, Card, Field, IconTile, Input, Kicker, PillAction, Screen, Select, SkeletonList, Steps, Text, Touchable, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { go } from '@/features/buyer/orders/kit';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

interface Copy {
  kicker: string;
  steps: [string, string, string, string];
  sectorTitle: string;
  sectorSub: string;
  nameTitle: string;
  nameSub: string;
  nameLabel: string;
  namePlaceholder: string;
  nameHint: string;
  descLabel: string;
  descPlaceholder: string;
  descHint: string;
  addrTitle: string;
  addrSub: string;
  addrLabel: string;
  addrPlaceholder: string;
  cityPlaceholder: string;
  contactTitle: string;
  contactSub: string;
  contactLabel: string;
  contactPlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  phoneHint: string;
  submitLabel: string;
  endpoint: string;
  typesEndpoint: string;
  excludeSlugs: string[];
  cardKicker: string;
  benefits: string[];
  benefitsKicker: string;
  icon: LucideIcon;
  sectorMeta: Record<string, { tag: string; badge: string; subtitle: string }>;
  defaultMeta: { tag: string; badge: string; subtitle: string };
  dest: string;
  swapLabel: string;
  swapHref: string;
}

const BUYER: Copy = {
  kicker: 'Commercial buyer onboarding',
  steps: ['Sector', 'Identity', 'Delivery place', 'Lead contact'],
  sectorTitle: 'What kind of business are you?',
  sectorSub: 'Select your operating sector so mills and distributors can recommend the right catalog lines and pack sizes.',
  nameTitle: 'What is your business called?',
  nameSub: 'This official entity or trading name appears on all purchase orders, delivery manifests and SVAT tax invoices.',
  nameLabel: 'Registered business / trading name',
  namePlaceholder: 'e.g. Ceylon Table Dining (Pvt) Ltd',
  nameHint: 'Printed on delivery dock manifests, purchase contracts and electronic payments.',
  descLabel: 'Operations note / procurement scope (optional)',
  descPlaceholder: 'e.g. 150-seat casual dining restaurant operating daily in Colombo',
  descHint: 'Helps supplier sales desks anticipate delivery frequency and bulk lot packaging.',
  addrTitle: 'Where should goods arrive?',
  addrSub: 'Mills and logistics fleets calculate transit windows and freight charges to this receiving dock.',
  addrLabel: 'Street / delivery receiving address',
  addrPlaceholder: 'e.g. No. 42, Galle Road, Kollupitiya',
  cityPlaceholder: 'e.g. Colombo 03',
  contactTitle: 'Who should receive orders?',
  contactSub: 'PO confirmations, driver arrival alerts and invoices route to this contact.',
  contactLabel: 'Primary procurement officer / contact person',
  contactPlaceholder: 'e.g. Dinesh Silva',
  emailLabel: 'Work billing email',
  emailPlaceholder: 'procurement@ceylontable.lk',
  phoneLabel: 'Direct phone / WhatsApp',
  phonePlaceholder: 'e.g. +94 77 123 4567',
  phoneHint: 'Used by delivery fleet drivers for dock arrival and gate clearance.',
  submitLabel: 'Complete registration',
  endpoint: '/businesses/onboard',
  typesEndpoint: '/businesses/types',
  excludeSlugs: ['grocery-wholesaler', 'beverage-distributor'],
  cardKicker: 'Commercial buyer entity',
  benefitsKicker: 'Workspace permissions included',
  benefits: ['Direct mill-gate wholesale prices (0% markup)', 'Automated split-PO checkout & tax billing', 'Digital dockside goods receipt notes (GRN)'],
  icon: Building2,
  sectorMeta: {
    restaurant: { tag: 'Kitchen staples & bulk oils', badge: 'High frequency', subtitle: 'Commercial kitchen staples, bulk cooking oils, Keeri Samba rice, dairy & daily produce.' },
    hotel: { tag: 'Full-property hospitality F&B', badge: 'Institutional', subtitle: 'Bulk F&B dining lots, guest amenities, estate tea & housekeeping supplies.' },
    cafe: { tag: 'Barista & bakery line', badge: 'Weekly cycles', subtitle: 'Specialty coffee, Ceylon BOPF tea, barista syrups, dairy & pastry inputs.' },
    retail: { tag: 'Packaged grocery restock', badge: 'Bulk pallets', subtitle: 'Packaged dry groceries, branded commodities, FMCG restock & wholesale cartons.' },
    bakery: { tag: 'Baking raw commodities', badge: 'Raw bulk', subtitle: 'Wheat flour 50kg bags, refined sugar, baking fats, yeast, eggs & packaging.' },
    catering: { tag: 'Large-batch event lots', badge: 'Scheduled lots', subtitle: 'High-capacity food lots, bulk seasonings, trays, disposables & event freight.' },
  },
  defaultMeta: { tag: 'Wholesale trade', badge: 'Commercial', subtitle: 'Commercial wholesale purchasing entity.' },
  dest: '/buyer',
  swapLabel: 'Not a buyer? Register as a supplier instead',
  swapHref: '/onboarding/supplier',
};

const SUPPLIER: Copy = {
  kicker: 'Wholesale supplier onboarding',
  steps: ['Supply line', 'Trade identity', 'Dispatch base', 'Key contact'],
  sectorTitle: 'What do you supply?',
  sectorSub: 'Select your primary wholesale sector so commercial buyers can locate your inventory.',
  nameTitle: 'Name your wholesale business.',
  nameSub: 'This verified facility name is displayed across the commercial catalog and on delivery manifests.',
  nameLabel: 'Trading / commercial facility name',
  namePlaceholder: 'e.g. Lanka Agro Mills & Processing (Pvt) Ltd',
  nameHint: 'Official trade name shown to hotels, restaurants and retail grocers.',
  descLabel: 'Catalog capabilities & operations (optional)',
  descPlaceholder: 'e.g. Direct importer of grain commodities, 3 temperature-controlled warehouses, 24-hour Colombo dispatch.',
  descHint: 'Summarize milling capacity, storage specs or your delivery fleet.',
  addrTitle: 'Where do you dispatch from?',
  addrSub: 'Your primary warehouse, mill or logistics hub — used for pickup routing and dock receiving.',
  addrLabel: 'Warehouse / depot physical address',
  addrPlaceholder: 'e.g. Mill Gate No. 12, Dambulla Industrial Zone',
  cityPlaceholder: 'e.g. Dambulla',
  contactTitle: 'Who manages incoming orders?',
  contactSub: 'PO alerts, pickup manifests and settlement statements route to this account manager.',
  contactLabel: 'Account manager / key contact person',
  contactPlaceholder: 'e.g. Sunil Bandara',
  emailLabel: 'Order notification & PO email',
  emailPlaceholder: 'sales@lankaagromills.lk',
  phoneLabel: 'Direct phone / WhatsApp',
  phonePlaceholder: 'e.g. +94 37 222 9876',
  phoneHint: 'Direct line for buyer procurement officers and dispatch coordinators.',
  submitLabel: 'Publish supplier profile',
  endpoint: '/suppliers/onboard',
  typesEndpoint: '/suppliers/types',
  excludeSlugs: ['restaurant', 'hotel', 'cafe', 'retail', 'bakery', 'catering'],
  cardKicker: 'Authorized wholesale supplier',
  benefitsKicker: 'Supplier hub capabilities',
  benefits: ['Receive direct POs from hotels, restaurants & grocers', 'Automated dispatch manifests & driver assignments', 'Transparent settlement — zero hidden broker fees'],
  icon: Store,
  sectorMeta: {
    'grocery-wholesaler': { tag: 'Mill gate & dry provisions', badge: 'Staples', subtitle: 'Rice millers, sugar importers, wheat flour & wholesale cooking oil.' },
    'beverage-distributor': { tag: 'Estate tea & beverage lines', badge: 'Beverages', subtitle: 'Ceylon BOPF estates, single-origin coffees, mineral water & syrups.' },
    'dairy-producer': { tag: 'Cold chain dairy supply', badge: 'Refrigerated', subtitle: 'Fresh milk, cheddar blocks, butter & culinary yogurts.' },
    'packaging-supplier': { tag: 'Export & corrugated shipping', badge: 'Packaging', subtitle: '5-ply cartons, takeout containers, cling film & bulk sacks.' },
    'spices-commodities': { tag: 'Export grade commodities', badge: 'Spices', subtitle: 'Ceylon Alba cinnamon, peppercorns, cardamoms & agricultural lots.' },
    'meat-seafood': { tag: 'Fresh coastal & cold storage', badge: 'Cold storage', subtitle: 'Poultry, beef portions, fresh fish, prawns & frozen proteins.' },
  },
  defaultMeta: { tag: 'Primary distribution', badge: 'Direct mill', subtitle: 'Wholesale producer and regional distributor.' },
  dest: '/supplier',
  swapLabel: 'Not a supplier? Register a buyer business instead',
  swapHref: '/onboarding/business',
};

export function OnboardingFlow({ kind }: { kind: 'business' | 'supplier' }) {
  const C = kind === 'business' ? BUYER : SUPPLIER;
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    businessTypeSlug: '',
    description: '',
    address: '',
    city: '',
    district: 'Colombo',
    contactPerson: '',
    phone: '',
    email: user?.email ?? '',
  });

  const [emailSynced, setEmailSynced] = useState(false);
  if (user?.email && !emailSynced) {
    setEmailSynced(true);
    setForm((f) => (f.email ? f : { ...f, email: user.email! }));
  }

  const types = useQuery({
    queryKey: ['onboarding-types', kind],
    queryFn: () => api.get<{ types: BusinessType[] }>(C.typesEndpoint),
    staleTime: 10 * 60_000,
  });
  const sectors = useMemo(() => {
    const all = types.data?.types ?? [];
    const filtered = all.filter((t) => !C.excludeSlugs.includes(t.slug));
    return filtered.length ? filtered : all;
  }, [types.data, C.excludeSlugs]);

  const selectedType = sectors.find((t) => t.slug === form.businessTypeSlug);

  const submit = useMutation({
    mutationFn: () =>
      api.post(C.endpoint, {
        name: form.name.trim(),
        businessTypeSlug: form.businessTypeSlug,
        description: form.description.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim(),
        district: form.district.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        email: (form.email || user?.email || '').trim().toLowerCase(),
        ...(kind === 'supplier' ? { categories: [form.businessTypeSlug || 'wholesale'] } : {}),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(kind === 'business' ? 'Business registered' : 'Supplier profile published');
      router.replace(C.dest as never);
    },
    onError: (e) => toast.error('Registration failed', errorMessage(e)),
  });

  const canNext =
    step === 0 ? !!form.businessTypeSlug : step === 1 ? !!form.name.trim() : step === 2 ? !!form.address.trim() && !!form.city.trim() : true;


  const footer =
    step < 3 ? (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} /> : null}
        <Button title="Continue" iconRight={ArrowRight} style={{ flex: 1 }} disabled={!canNext} onPress={() => setStep(step + 1)} />
      </View>
    ) : (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Back" variant="secondary" onPress={() => setStep(2)} />
        <Button
          title={C.submitLabel}
          icon={ShieldCheck}
          variant={kind === 'supplier' ? 'copper' : 'volt'}
          style={{ flex: 1 }}
          loading={submit.isPending}
          disabled={!form.contactPerson.trim() || !form.phone.trim() || !form.email.trim()}
          onPress={() => submit.mutate()}
        />
      </View>
    );

  const stepIcon = [C.icon, C.icon, MapPin, User][step] ?? C.icon;

  return (
    <Screen
      back={step === 0}
      kicker={C.kicker}
      title={step === 0 ? C.sectorTitle : step === 1 ? C.nameTitle : step === 2 ? C.addrTitle : C.contactTitle}
      subtitle={step === 0 ? C.sectorSub : step === 1 ? C.nameSub : step === 2 ? C.addrSub : C.contactSub}
      footer={footer}
      keyboard
      gap={18}
    >
      <Card padding={16} style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon={stepIcon} tone={step === 3 ? 'volt' : 'ink'} size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="overline" color="ink4">
              Step {step + 1} of {C.steps.length}
            </Text>
            <Text variant="h3" numberOfLines={1}>
              {C.steps[step]}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink4 }}>{Math.round(((step + 1) / C.steps.length) * 100)}%</Text>
        </View>
        <Steps steps={[...C.steps]} current={step} />
      </Card>

      {step === 0 ? (
        <View style={{ gap: 12 }}>
          {types.isLoading ? (
            <SkeletonList rows={4} height={92} />
          ) : (
            sectors.map((t) => {
              const meta = C.sectorMeta[t.slug] ?? C.defaultMeta;
              const selected = form.businessTypeSlug === t.slug;
              return (
                <Touchable
                  key={t.id}
                  onPress={() => setForm((f) => ({ ...f, businessTypeSlug: t.slug }))}
                  hapticOnPress
                  scaleTo={0.985}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      padding: 16,
                      borderRadius: radii.xl,
                      borderCurve: 'continuous',
                      backgroundColor: colors.paper,
                      borderWidth: 1.5,
                      borderColor: selected ? colors.ink : 'transparent',
                    },
                    selected ? shadow.md : shadow.card,
                  ]}
                >
                  <IconTile icon={C.icon} tone={selected ? 'ink' : 'paper'} size={44} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8, color: colors.copperDeep, textTransform: 'uppercase', flexShrink: 1 }} numberOfLines={1}>
                        {meta.tag}
                      </Text>
                      <View style={{ backgroundColor: selected ? colors.volt : colors.bone, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9.5, color: selected ? colors.ink : colors.ink4, textTransform: 'uppercase' }}>
                          {selected ? 'Selected' : meta.badge}
                        </Text>
                      </View>
                    </View>
                    <Text variant="h3">{t.name}</Text>
                    <Text variant="caption" color="ink4" numberOfLines={2}>
                      {meta.subtitle}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: selected ? 6 : 1.5,
                      borderColor: selected ? colors.ink : colors.lineStrong,
                      backgroundColor: selected ? colors.volt : 'transparent',
                    }}
                  />
                </Touchable>
              );
            })
          )}
          <Button title={C.swapLabel} variant="ghost" size="sm" onPress={() => go(C.swapHref, true)} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <SelectedTypeCard name={selectedType?.name} tag={selectedType ? (C.sectorMeta[selectedType.slug] ?? C.defaultMeta).tag : undefined} icon={C.icon} onChange={() => setStep(0)} />
          <Card padding={18} style={{ gap: 18 }}>
            <Field label={C.nameLabel} hint={C.nameHint} required>
              <Input icon={C.icon} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder={C.namePlaceholder} autoFocus />
            </Field>
            <Field label={C.descLabel} hint={C.descHint}>
              <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder={C.descPlaceholder} multiline />
            </Field>
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <Card padding={18} style={{ gap: 18 }}>
          <Field label={C.addrLabel} required>
            <Input icon={MapPin} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} placeholder={C.addrPlaceholder} autoFocus />
          </Field>
          <Field label="City / area" required>
            <Input value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder={C.cityPlaceholder} />
          </Field>
          <Field label="District" required>
            <Select value={form.district} options={SRI_LANKAN_DISTRICTS.map((d) => ({ value: d, label: `${d} District` }))} onChange={(v) => setForm((f) => ({ ...f, district: v }))} title="District" />
          </Field>
        </Card>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 16 }}>
          <Card padding={18} style={{ gap: 18 }}>
            <Field label={C.contactLabel} required>
              <Input icon={User} value={form.contactPerson} onChangeText={(v) => setForm((f) => ({ ...f, contactPerson: v }))} placeholder={C.contactPlaceholder} autoFocus />
            </Field>
            <Field label={C.phoneLabel} hint={C.phoneHint} required>
              <Input icon={Phone} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder={C.phonePlaceholder} keyboardType="phone-pad" />
            </Field>
            <Field label={C.emailLabel} required>
              <Input icon={Mail} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder={C.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" />
            </Field>
          </Card>
          <VerificationCard C={C} form={form} sectorName={selectedType?.name} />
        </View>
      ) : null}
    </Screen>
  );
}

function SelectedTypeCard({ name, tag, icon, onChange }: { name?: string; tag?: string; icon: LucideIcon; onChange: () => void }) {
  if (!name) return null;
  return (
    <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconTile icon={icon} tone="volt" size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <Kicker>Selected sector</Kicker>
        <Text variant="body" weight="semibold" numberOfLines={1}>
          {name}
        </Text>
        {tag ? (
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {tag}
          </Text>
        ) : null}
      </View>
      <PillAction label="Change" onPress={onChange} />
    </Card>
  );
}

function VerificationCard({ C, form, sectorName }: { C: Copy; form: { name: string; description: string; address: string; city: string; district: string; contactPerson: string; phone: string }; sectorName?: string }) {
  return (
    <Card kind="ink" padding={18} radius={radii['2xl']} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <IconTile icon={C.icon} tone="glass" size={34} />
          <Kicker color="volt" style={{ flex: 1 }}>
            {C.cardKicker}
          </Kicker>
        </View>
        <View style={{ backgroundColor: 'rgba(250,247,240,0.09)', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperMuted, textTransform: 'uppercase' }}>{form.district}</Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        {sectorName ? (
          <Text variant="caption" color="volt">
            {sectorName}
          </Text>
        ) : null}
        <Text variant="overline" color="paperFaint">
          Entity name
        </Text>
        <Text variant="displaySm" color="paper" numberOfLines={2}>
          {form.name.trim() || 'Your trading name'}
        </Text>
      </View>
      <View style={{ gap: 10, backgroundColor: 'rgba(250,247,240,0.05)', borderRadius: radii.lg, borderCurve: 'continuous', padding: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <MapPin size={14} color={colors.copper} style={{ marginTop: 1 }} />
          <Text variant="caption" color="paperMuted" style={{ flex: 1 }}>
            {form.address ? `${form.address}, ${form.city} (${form.district})` : 'Awaiting address…'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <User size={14} color={colors.volt} style={{ marginTop: 1 }} />
          <Text variant="caption" color="paperMuted" style={{ flex: 1 }}>
            {form.contactPerson ? `${form.contactPerson} · ${form.phone || 'No phone'}` : 'Awaiting contact person…'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} color={colors.volt} />
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, color: colors.volt }}>SVAT invoicing ready</Text>
        </View>
        <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperFaint }}>25 LK districts</Text>
      </View>
    </Card>
  );
}
