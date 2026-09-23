import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Mail, MapPin, Phone, ShieldCheck, Store, User, type LucideIcon } from 'lucide-react-native';
import { Button, Card, Field, Input, Kicker, Screen, Select, Steps, Text, Touchable, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import { colors, fonts, radii } from '@/theme/tokens';
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
        {step > 0 ? <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} /> : null}
        <Button title={step === 0 ? 'Continue' : 'Continue'} iconRight={ArrowRight} style={{ flex: 1 }} disabled={!canNext} onPress={() => setStep(step + 1)} />
      </View>
    ) : (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Back" variant="ghost" onPress={() => setStep(2)} />
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

  return (
    <Screen
      back={step === 0}
      kicker={C.kicker}
      title={step === 0 ? C.sectorTitle : step === 1 ? C.nameTitle : step === 2 ? C.addrTitle : C.contactTitle}
      subtitle={step === 0 ? C.sectorSub : step === 1 ? C.nameSub : step === 2 ? C.addrSub : C.contactSub}
      footer={footer}
      keyboard
    >
      <Steps steps={[...C.steps]} current={step} />

      {step === 0 ? (
        <View style={{ gap: 10 }}>
          {types.isLoading ? (
            <Text variant="bodySm" color="ink4">
              Loading wholesale sectors…
            </Text>
          ) : (
            sectors.map((t) => {
              const meta = C.sectorMeta[t.slug] ?? C.defaultMeta;
              const selected = form.businessTypeSlug === t.slug;
              return (
                <Touchable
                  key={t.id}
                  onPress={() => setForm((f) => ({ ...f, businessTypeSlug: t.slug }))}
                  scaleTo={0.985}
                  style={{
                    borderRadius: radii.xl,
                    borderWidth: selected ? 1.5 : 1,
                    borderColor: selected ? colors.ink : colors.line,
                    backgroundColor: selected ? colors.pearl : colors.paper,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8, color: colors.volt, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>
                      {meta.tag}
                    </Text>
                    <View style={{ backgroundColor: selected ? colors.volt : 'rgba(250,247,240,0.12)', borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9.5, color: selected ? colors.ink : colors.paperMuted, textTransform: 'uppercase' }}>
                        {selected ? 'Selected ✓' : meta.badge}
                      </Text>
                    </View>
                  </View>
                  <View style={{ padding: 14, gap: 4 }}>
                    <Text variant="h3">{t.name}</Text>
                    <Text variant="caption" color="ink4">
                      {meta.subtitle}
                    </Text>
                  </View>
                </Touchable>
              );
            })
          )}
          <Button title={C.swapLabel} variant="ghost" size="sm" onPress={() => go(C.swapHref, true)} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <SelectedTypeCard name={selectedType?.name} tag={selectedType ? (C.sectorMeta[selectedType.slug] ?? C.defaultMeta).tag : undefined} onChange={() => setStep(0)} />
          <Field label={C.nameLabel} hint={C.nameHint} required>
            <Input icon={C.icon} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder={C.namePlaceholder} autoFocus />
          </Field>
          <Field label={C.descLabel} hint={C.descHint}>
            <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder={C.descPlaceholder} multiline />
          </Field>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 14 }}>
          <Field label={C.addrLabel} required>
            <Input icon={MapPin} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} placeholder={C.addrPlaceholder} autoFocus />
          </Field>
          <Field label="City / area" required>
            <Input value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder={C.cityPlaceholder} />
          </Field>
          <Field label="District" required>
            <Select value={form.district} options={SRI_LANKAN_DISTRICTS.map((d) => ({ value: d, label: `${d} District` }))} onChange={(v) => setForm((f) => ({ ...f, district: v }))} title="District" />
          </Field>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 14 }}>
          <Field label={C.contactLabel} required>
            <Input icon={User} value={form.contactPerson} onChangeText={(v) => setForm((f) => ({ ...f, contactPerson: v }))} placeholder={C.contactPlaceholder} autoFocus />
          </Field>
          <Field label={C.phoneLabel} hint={C.phoneHint} required>
            <Input icon={Phone} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder={C.phonePlaceholder} keyboardType="phone-pad" />
          </Field>
          <Field label={C.emailLabel} required>
            <Input icon={Mail} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder={C.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" />
          </Field>
          <VerificationCard C={C} form={form} sectorName={selectedType?.name} />
        </View>
      ) : null}
    </Screen>
  );
}

function SelectedTypeCard({ name, tag, onChange }: { name?: string; tag?: string; onChange: () => void }) {
  if (!name) return null;
  return (
    <Card padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Kicker>Selected sector</Kicker>
        <Text variant="body" weight="semibold">
          {name}
        </Text>
        {tag ? (
          <Text variant="caption" color="ink4">
            {tag}
          </Text>
        ) : null}
      </View>
      <Button title="Change" variant="ghost" size="sm" onPress={onChange} />
    </Card>
  );
}

function VerificationCard({ C, form, sectorName }: { C: Copy; form: { name: string; description: string; address: string; city: string; district: string; contactPerson: string; phone: string }; sectorName?: string }) {
  return (
    <Card kind="ink" padding={16} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.paperLine, paddingBottom: 10 }}>
        <Kicker color="volt">{C.cardKicker}</Kicker>
        <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperFaint, textTransform: 'uppercase' }}>{form.district}</Text>
      </View>
      {sectorName ? (
        <Text variant="caption" color="volt">
          {sectorName}
        </Text>
      ) : null}
      <View>
        <Text variant="overline" color="paperFaint">
          Entity name
        </Text>
        <Text variant="h2" color="paper">
          {form.name.trim() || 'Your trading name'}
        </Text>
      </View>
      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.paperLine, paddingTop: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MapPin size={13} color={colors.copper} style={{ marginTop: 1 }} />
          <Text variant="caption" color="paperMuted" style={{ flex: 1 }}>
            {form.address ? `${form.address}, ${form.city} (${form.district})` : 'Awaiting address…'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <User size={13} color={colors.volt} style={{ marginTop: 1 }} />
          <Text variant="caption" color="paperMuted" style={{ flex: 1 }}>
            {form.contactPerson ? `${form.contactPerson} · ${form.phone || 'No phone'}` : 'Awaiting contact person…'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.paperLine, paddingTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} color={colors.volt} />
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, color: colors.volt }}>SVAT invoicing ready</Text>
        </View>
        <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperFaint }}>25 LK districts</Text>
      </View>
    </Card>
  );
}
