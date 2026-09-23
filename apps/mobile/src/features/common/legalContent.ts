/** Legal document bodies — mirrors apps/web/src/content/legal/*.md */
export const LEGAL_DOCS = {
  terms: `# VYRO Terms of Service

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Acceptance

By creating a VYRO account you agree to these terms.

## 2. Eligibility

You must be 18+ and operating a Sri Lankan-registered business or authorized distributor.

## 3. Accounts

You are responsible for your login credentials and for activity under your account.

## 4. Orders and payment

VYRO records purchase orders between buyers and suppliers. No payment is processed by VYRO in v1.

## 5. Liability

VYRO provides platform software "as is". We are not liable for losses arising from orders between users.

## 6. Governing law

These terms are governed by the laws of Sri Lanka.

## 7. Contact

Email: legal@vyro.example
`,
  privacy: `# VYRO Privacy Policy

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Data we collect

- Account profile (name, email, phone)
- Business or supplier records (name, district, address)
- Order and payment history
- IP address (Cloudflare CDN)
- Browser fingerprint (session cookies only)

## 2. Why we collect it

- Provide the platform (matching, ordering)
- Prevent fraud and abuse
- Comply with legal obligations

## 3. Where it is stored

Cloudflare Workers and D1 database (Singapore region). Backed up per Cloudflare's SLA.

## 4. Who we share it with

No third parties in v1. We may disclose if required by Sri Lankan law.

## 5. Your rights (PDPA 2022)

- Access your data (Profile → Export)
- Correct inaccurate data (Profile → Edit)
- Request deletion (Profile → Delete account; 30-day grace)
- Opt out of marketing (Profile → Notifications)

## 6. Retention

Until account deletion + 30 days. Audit logs retained 7 years per accounting law.

## 7. Contact

Email: privacy@vyro.example
`,
  cookies: `# VYRO Cookie Policy

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Essential cookies

- \`better-auth.session_token\` — keeps you signed in
- \`csrf_token\` — prevents cross-site request forgery

These cannot be disabled while signed in.

## 2. Analytics

None loaded in v1.

## 3. Marketing

None loaded in v1.

## 4. Managing cookies

Browser settings, or our consent banner.
`,
} as const;

export type LegalKind = keyof typeof LEGAL_DOCS;

export const LEGAL_META: Record<LegalKind, { title: string; kicker: string; summary: string; effective: string; jurisdiction: string; acts: string[]; contact: string }> = {
  terms: {
    title: 'Terms of Service',
    kicker: 'Commercial Governance / B2B Wholesale Marketplace',
    summary: 'Standard commercial terms governing marketplace access, verified supplier catalog listings, purchase order records, and merchant obligations across Sri Lanka.',
    effective: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    acts: ['Electronic Transactions Act No. 19 of 2006', 'Sale of Goods Ordinance'],
    contact: 'legal@vyro.lk',
  },
  privacy: {
    title: 'Privacy Policy',
    kicker: 'Data Protection / PDPA 2022 Compliance',
    summary: 'Detailed framework outlining how merchant records, transaction data, and organizational profiles are collected, encrypted, and governed on the VYRO platform.',
    effective: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    acts: ['Personal Data Protection Act (PDPA) No. 9 of 2022'],
    contact: 'privacy@vyro.lk',
  },
  cookies: {
    title: 'Cookie Policy',
    kicker: 'Telemetry & Session Governance',
    summary: 'Disclosures regarding essential cryptographic session tokens, cross-site request protection, and platform telemetry across web sessions.',
    effective: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    acts: ['PDPA No. 9 of 2022 Session Privacy Guidelines'],
    contact: 'privacy@vyro.lk',
  },
};
