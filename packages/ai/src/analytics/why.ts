export interface WhyEvidence {
  label: string;
  value: string;
}

export interface WhyInput {
  question: string;
  intent: string;
  evidence: WhyEvidence[];
  recommendation?: string;
}

export interface WhyOutput {
  answer: string;
  evidence: WhyEvidence[];
  recommendation: string | null;
}

export function buildWhyAnswer(input: WhyInput): WhyOutput {
  const headline = input.evidence[0]?.value ?? 'Insufficient data';
  const rest = input.evidence
    .slice(1)
    .map((e) => `${e.label}: ${e.value}`)
    .join('. ');
  const answer = rest.length > 0 ? `${headline}. ${rest}.` : `${headline}.`;
  return {
    answer,
    evidence: input.evidence,
    recommendation: input.recommendation ?? null,
  };
}
