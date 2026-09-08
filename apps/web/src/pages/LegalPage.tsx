import { useState, useEffect, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import termsMd from '../content/legal/terms.md?raw';
import privacyMd from '../content/legal/privacy.md?raw';
import cookiesMd from '../content/legal/cookies.md?raw';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  ShieldCheckIcon,
  PrinterIcon,
  CopyIcon,
  CheckCheckIcon,
  ClockIcon,
  Building2Icon,
  MailIcon,
  ScaleIcon,
  FileTextIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';

type Kind = 'terms' | 'privacy' | 'cookies';

interface LegalDocConfig {
  title: string;
  shortTitle: string;
  path: string;
  kicker: string;
  summary: string;
  effectiveDate: string;
  jurisdiction: string;
  complianceActs: string[];
  contactEmail: string;
  content: string;
}

const DOCS_CONFIG: Record<Kind, LegalDocConfig> = {
  terms: {
    title: 'Terms of Service',
    shortTitle: 'Terms of Service',
    path: '/legal/terms',
    kicker: 'Commercial Governance / B2B Wholesale Marketplace',
    summary:
      'Standard commercial terms governing marketplace access, verified supplier catalog listings, purchase order records, and merchant obligations across Sri Lanka.',
    effectiveDate: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    complianceActs: ['Electronic Transactions Act No. 19 of 2006', 'Sale of Goods Ordinance'],
    contactEmail: 'legal@vyro.lk',
    content: termsMd,
  },
  privacy: {
    title: 'Privacy Policy',
    shortTitle: 'Privacy Policy',
    path: '/legal/privacy',
    kicker: 'Data Protection / PDPA 2022 Compliance',
    summary:
      'Detailed framework outlining how merchant records, transaction data, and organizational profiles are collected, encrypted, and governed on the VYRO platform.',
    effectiveDate: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    complianceActs: ['Personal Data Protection Act (PDPA) No. 9 of 2022'],
    contactEmail: 'privacy@vyro.lk',
    content: privacyMd,
  },
  cookies: {
    title: 'Cookie Policy',
    shortTitle: 'Cookie Policy',
    path: '/legal/cookies',
    kicker: 'Telemetry & Session Governance',
    summary:
      'Disclosures regarding essential cryptographic session tokens, cross-site request protection, and platform telemetry across web sessions.',
    effectiveDate: 'September 05, 2026',
    jurisdiction: 'Democratic Socialist Republic of Sri Lanka',
    complianceActs: ['PDPA No. 9 of 2022 Session Privacy Guidelines'],
    contactEmail: 'privacy@vyro.lk',
    content: cookiesMd,
  },
};

interface Section {
  id: string;
  number: string;
  title: string;
  rawHeading: string;
  contentBlocks: string[];
}

function parseMarkdownDoc(md: string): { sections: Section[]; introParagraphs: string[] } {
  const lines = md.split('\n');
  const sections: Section[] = [];
  const introParagraphs: string[] = [];
  let currentSection: Section | null = null;
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (currentBlock.length > 0) {
      const blockText = currentBlock.join('\n').trim();
      if (blockText) {
        if (currentSection) {
          currentSection.contentBlocks.push(blockText);
        } else {
          introParagraphs.push(blockText);
        }
      }
      currentBlock = [];
    }
  };

  for (const line of lines) {
    // Skip duplicate H1 (# VYRO ...) and blockquote draft disclaimers (> Draft ...)
    if (line.startsWith('# ')) {
      continue;
    }
    if (line.startsWith('> ')) {
      continue;
    }
    if (line.toLowerCase().startsWith('last updated:')) {
      continue;
    }

    if (line.startsWith('## ')) {
      flushBlock();
      const rawHeading = line.slice(3).trim();
      // Match patterns like "1. Acceptance" or "5. Your rights (PDPA 2022)"
      const match = rawHeading.match(/^(\d+)\.\s*(.+)$/);
      const number = match ? match[1] ?? '' : '';
      const title = match ? match[2] ?? rawHeading : rawHeading;
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      currentSection = {
        id: id || `section-${sections.length + 1}`,
        number: number ? `0${number}`.slice(-2) : '',
        title,
        rawHeading,
        contentBlocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (line.trim() === '') {
      flushBlock();
    } else {
      currentBlock.push(line);
    }
  }

  flushBlock();

  return { sections, introParagraphs };
}

function formatInlineText(text: string): ReactElement[] {
  // Split inline tokens like `code`, bold **text**, and email addresses
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="font-mono text-[0.8125rem] px-1.5 py-0.5 rounded bg-ink/5 border border-line text-ink-1 font-medium mx-0.5"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-ink-1">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
      // Normalize mock emails to vyro.lk for clean UX
      const cleanEmail = part.replace('@vyro.example', '@vyro.lk');
      return (
        <a
          key={index}
          href={`mailto:${cleanEmail}`}
          className="font-medium text-copper hover:text-ink-1 underline underline-offset-4 decoration-copper/40 transition-colors"
        >
          {cleanEmail}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function renderBlockContent(block: string, blockIndex: number): ReactElement {
  if (block.startsWith('- ')) {
    const items = block.split('\n').filter((l) => l.trim().startsWith('- ')).map((l) => l.replace(/^- /, ''));
    return (
      <ul key={blockIndex} className="my-4 space-y-2.5">
        {items.map((item, itemIdx) => (
          <li key={itemIdx} className="flex items-start gap-3 text-sm sm:text-base text-ink-2 leading-relaxed">
            <span className="mt-2 size-1.5 rounded-full bg-copper shrink-0" aria-hidden="true" />
            <div className="flex-1">{formatInlineText(item)}</div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p key={blockIndex} className="my-3.5 text-sm sm:text-base text-ink-2 leading-relaxed">
      {formatInlineText(block)}
    </p>
  );
}

export function LegalPage({ kind }: { kind: Kind }) {
  const currentDoc = DOCS_CONFIG[kind];
  usePageTitle(`${currentDoc.title} — Legal`);

  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const { sections, introParagraphs } = parseMarkdownDoc(currentDoc.content);

  useEffect(() => {
    if (sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0]?.id ?? '');
    }
  }, [sections, activeSectionId]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        if (!sec) continue;
        const el = document.getElementById(sec.id);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSectionId(sec.id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const otherDocs = (Object.keys(DOCS_CONFIG) as Kind[]).filter((k) => k !== kind);

  return (
    <div className="min-h-screen bg-bone pb-20 pt-8 sm:pt-12 text-ink-1">
      {/* Global Print-Only Header */}
      <div className="hidden print:block mb-8 pb-4 border-b border-line">
        <div className="text-xl font-bold tracking-tight text-ink">VYRO B2B Wholesale Platform</div>
        <div className="text-sm text-ink-3">Official Legal Documentation — {currentDoc.title}</div>
        <div className="text-xs text-ink-4 mt-1">Effective Date: {currentDoc.effectiveDate} | Jurisdiction: {currentDoc.jurisdiction}</div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb / Top Tabs */}
        <div className="print:hidden mb-8">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-4 mb-4">
            <Link to="/" className="hover:text-ink-1 transition-colors">
              VYRO
            </Link>
            <ChevronRightIcon size={12} className="text-ink-5" />
            <span>Governance</span>
            <ChevronRightIcon size={12} className="text-ink-5" />
            <span className="text-copper font-medium">{currentDoc.shortTitle}</span>
          </div>

          {/* Document Switcher Tab Bar */}
          <div className="inline-flex flex-wrap p-1 bg-paper border border-line rounded-sm shadow-xs gap-1">
            {(Object.keys(DOCS_CONFIG) as Kind[]).map((key) => {
              const doc = DOCS_CONFIG[key];
              const isActive = key === kind;
              return (
                <Link
                  key={key}
                  to={doc.path}
                  className={cn(
                    'px-4 py-2 text-xs sm:text-sm font-medium rounded-xs transition-all flex items-center gap-2',
                    isActive
                      ? 'bg-ink-1 text-paper shadow-xs font-semibold'
                      : 'text-ink-3 hover:text-ink-1 hover:bg-bone/60'
                  )}
                >
                  <FileTextIcon size={14} className={isActive ? 'text-volt' : 'text-ink-4'} />
                  {doc.shortTitle}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Hero Header */}
        <header className="mb-10 pb-8 border-b border-line/80">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="vyro-kicker mb-2.5 flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-volt-deep animate-pulse" />
                {currentDoc.kicker}
              </div>
              <h1 className="vyro-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink-1 text-balance">
                {currentDoc.title}
              </h1>
              <p className="mt-3.5 text-base sm:text-lg text-ink-3 leading-relaxed max-w-2xl text-pretty">
                {currentDoc.summary}
              </p>

              {/* Metadata Badges */}
              <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper border border-line text-ink-2 font-mono">
                  <ClockIcon size={13} className="text-copper" />
                  Effective: {currentDoc.effectiveDate}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper border border-line text-ink-2">
                  <ScaleIcon size={13} className="text-copper" />
                  Sri Lanka Jurisdiction
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-volt/20 border border-volt-deep/30 text-ink-1 font-mono font-medium">
                  v1.0 Baseline
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="print:hidden flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xs bg-paper border border-line hover:border-ink-3 text-ink-1 hover:bg-pearl transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                title="Copy direct document link"
              >
                {copied ? (
                  <>
                    <CheckCheckIcon size={14} className="text-mint" />
                    <span className="text-mint font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <CopyIcon size={14} className="text-ink-4" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xs bg-paper border border-line hover:border-ink-3 text-ink-1 hover:bg-pearl transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                title="Print or save document as PDF"
              >
                <PrinterIcon size={14} className="text-ink-4" />
                <span>Print / PDF</span>
              </button>
            </div>
          </div>

          {/* Regulatory Advisory Banner */}
          <div className="mt-6 border border-copper/30 bg-copper/5 p-4 rounded-xs flex items-start gap-3.5">
            <div className="p-1.5 bg-copper/10 rounded text-copper shrink-0 mt-0.5">
              <ShieldCheckIcon size={18} />
            </div>
            <div className="text-xs sm:text-sm text-ink-2 leading-relaxed">
              <span className="font-semibold text-ink-1">Commercial Draft & Legal Baseline:</span>{' '}
              This policy constitutes the active operational framework governing procurement transactions on VYRO. Currently filed under ongoing legal bar advisory. For enterprise bilateral SLAs, distributor custom clauses, or regulatory audits, contact our legal counsel at{' '}
              <a
                href={`mailto:${currentDoc.contactEmail}`}
                className="font-medium text-copper underline underline-offset-2 hover:text-ink-1 transition-colors"
              >
                {currentDoc.contactEmail}
              </a>
              .
            </div>
          </div>
        </header>

        {/* 2-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Sticky Table of Contents & Facts (Desktop) */}
          <aside className="print:hidden hidden lg:block lg:col-span-4 sticky top-20 space-y-6">
            {/* Table of Contents Card */}
            <div className="bg-paper border border-line rounded-xs p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-ink-3">
                  Document Contents
                </span>
                <span className="text-[0.6875rem] font-mono text-copper font-medium">
                  {sections.length} Sections
                </span>
              </div>

              <nav className="space-y-1 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
                {sections.map((sec) => {
                  const isActive = activeSectionId === sec.id;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(sec.id);
                        if (el) {
                          const yOffset = -80;
                          const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                          window.scrollTo({ top: y, behavior: 'smooth' });
                          setActiveSectionId(sec.id);
                        }
                      }}
                      className={cn(
                        'group flex items-center justify-between px-3 py-2 text-xs rounded-xs transition-all',
                        isActive
                          ? 'bg-ink-1 text-paper font-semibold shadow-xs'
                          : 'text-ink-3 hover:text-ink-1 hover:bg-bone/80'
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {sec.number && (
                          <span
                            className={cn(
                              'font-mono text-[0.6875rem]',
                              isActive ? 'text-volt font-bold' : 'text-copper font-medium'
                            )}
                          >
                            {sec.number}
                          </span>
                        )}
                        <span className="truncate">{sec.title}</span>
                      </div>
                      <ChevronRightIcon
                        size={12}
                        className={cn(
                          'shrink-0 transition-transform',
                          isActive ? 'text-volt translate-x-0.5' : 'text-ink-5 opacity-0 group-hover:opacity-100'
                        )}
                      />
                    </a>
                  );
                })}
              </nav>
            </div>

            {/* Legal Entity & Jurisdiction Information */}
            <div className="bg-paper border border-line rounded-xs p-5 shadow-xs space-y-4 text-xs">
              <div className="flex items-center gap-2 font-mono uppercase tracking-wider font-semibold text-ink-3 pb-2 border-b border-line">
                <Building2Icon size={14} className="text-copper" />
                <span>Governance & Entity</span>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-ink-4 text-[0.6875rem] uppercase font-mono">Governing Legal Entity</div>
                  <div className="font-semibold text-ink-1 text-sm mt-0.5">VYRO Technologies (Pvt) Ltd</div>
                  <div className="text-ink-3 text-[0.75rem]">Colombo, Western Province, Sri Lanka</div>
                </div>

                <div>
                  <div className="text-ink-4 text-[0.6875rem] uppercase font-mono">Applicable Statutes</div>
                  <div className="text-ink-2 mt-0.5 space-y-1">
                    {currentDoc.complianceActs.map((act, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-copper">•</span>
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-ink-4 text-[0.6875rem] uppercase font-mono">Direct Legal Counsel</div>
                  <a
                    href={`mailto:${currentDoc.contactEmail}`}
                    className="inline-flex items-center gap-1.5 font-mono text-copper hover:text-ink-1 font-medium mt-0.5"
                  >
                    <MailIcon size={12} />
                    {currentDoc.contactEmail}
                  </a>
                </div>
              </div>
            </div>

            {/* Cross-link to other policies */}
            <div className="bg-bone border border-line rounded-xs p-4 space-y-2">
              <div className="text-[0.6875rem] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                Other Policies
              </div>
              {otherDocs.map((docKey) => {
                const doc = DOCS_CONFIG[docKey];
                return (
                  <Link
                    key={docKey}
                    to={doc.path}
                    className="flex items-center justify-between p-2 rounded bg-paper border border-line/60 hover:border-ink-3 text-xs text-ink-2 hover:text-ink-1 transition-all group"
                  >
                    <span className="font-medium">{doc.shortTitle}</span>
                    <ArrowRightIcon size={12} className="text-copper group-hover:translate-x-1 transition-transform" />
                  </Link>
                );
              })}
            </div>
          </aside>

          {/* Right Column: Clean Editorial Article Body */}
          <article className="lg:col-span-8 bg-paper border border-line rounded-xs p-6 sm:p-10 lg:p-12 shadow-xs">
            {/* Optional Intro Paragraphs */}
            {introParagraphs.length > 0 && (
              <div className="mb-8 pb-6 border-b border-line/80 space-y-3">
                {introParagraphs.map((p, i) => (
                  <p key={i} className="text-base sm:text-lg text-ink-2 leading-relaxed font-normal">
                    {formatInlineText(p)}
                  </p>
                ))}
              </div>
            )}

            {/* Rendered Sections */}
            <div className="divide-y divide-line/70 space-y-8">
              {sections.map((section, idx) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={cn(
                    'scroll-mt-24',
                    idx === 0 ? 'pt-0' : 'pt-8 sm:pt-10'
                  )}
                >
                  {/* Section Heading with subtle anchor */}
                  <div className="group mb-4 flex items-baseline gap-3">
                    {section.number && (
                      <span className="font-mono text-sm sm:text-base font-bold text-copper tracking-tight">
                        {section.number}.
                      </span>
                    )}
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-1 flex-1">
                      {section.title}
                    </h2>
                    <a
                      href={`#${section.id}`}
                      className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-copper transition-opacity text-sm font-mono"
                      title={`Permanent link to ${section.title}`}
                      aria-label={`Link to ${section.title}`}
                    >
                      #
                    </a>
                  </div>

                  {/* Section Content */}
                  <div className="space-y-3 pl-0 sm:pl-7">
                    {section.contentBlocks.map((block, blockIdx) =>
                      renderBlockContent(block, blockIdx)
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* Article Footer & Verification Notice */}
            <footer className="mt-12 pt-8 border-t border-line/80 space-y-6">
              <div className="p-4 sm:p-5 bg-bone rounded-xs border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold">
                    Document Version Control
                  </div>
                  <div className="text-sm font-medium text-ink-1 mt-0.5">
                    Filed under VYRO Legal Revision #2026-09-A
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    Last amended: {currentDoc.effectiveDate} · Colombo, Sri Lanka
                  </div>
                </div>

                <a
                  href={`mailto:${currentDoc.contactEmail}?subject=Legal%20Inquiry%20-%20${encodeURIComponent(currentDoc.title)}`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-ink-1 text-paper rounded-xs hover:bg-charcoal transition-colors self-start sm:self-auto cursor-pointer"
                >
                  <MailIcon size={14} className="text-volt" />
                  <span>Contact Legal Counsel</span>
                </a>
              </div>

              {/* Related Policies Navigation Bottom */}
              <div className="print:hidden pt-4">
                <div className="text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-3">
                  Read Further Governance Documentation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {otherDocs.map((docKey) => {
                    const doc = DOCS_CONFIG[docKey];
                    return (
                      <Link
                        key={docKey}
                        to={doc.path}
                        className="p-4 rounded-xs border border-line bg-paper hover:border-ink-2 hover:shadow-xs transition-all group flex flex-col justify-between"
                      >
                        <div>
                          <div className="text-xs font-mono text-copper font-medium uppercase tracking-wider mb-1">
                            Governance Document
                          </div>
                          <div className="text-sm font-bold text-ink-1 group-hover:text-copper transition-colors">
                            {doc.title}
                          </div>
                          <p className="text-xs text-ink-3 mt-1 line-clamp-2 leading-relaxed">
                            {doc.summary}
                          </p>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-ink-1 group-hover:text-copper">
                          <span>Read policy</span>
                          <ArrowRightIcon size={12} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

