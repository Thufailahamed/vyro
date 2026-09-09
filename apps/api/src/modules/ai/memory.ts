export interface PreferenceRow {
  id: string;
  userId: string | null;
  businessId: string | null;
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
  createdAt: number;
  updatedAt: number;
}

export interface PreferenceRepo {
  list(filter: { businessId: string; kind?: string }): Promise<PreferenceRow[]>;
  upsert(row: {
    id: string;
    userId: string | null;
    businessId: string | null;
    kind: PreferenceRow['kind'];
    key: string;
    valueJson: string;
    source: PreferenceRow['source'];
    confidence: number;
    occurrences: number;
    createdAt: number;
    updatedAt: number;
  }): Promise<PreferenceRow>;
  delete(id: string, businessId?: string): Promise<void>;
}

export interface SetPreferenceInput {
  kind: PreferenceRow['kind'];
  key: string;
  valueJson: string;
  source: PreferenceRow['source'];
  userId?: string | null;
}

export interface MemoryService {
  setPreference(input: SetPreferenceInput): Promise<PreferenceRow>;
  list(): Promise<PreferenceRow[]>;
  delete(id: string): Promise<void>;
  recordCorrection(input: { kind: PreferenceRow['kind']; key: string }): Promise<PreferenceRow>;
}

const PROMOTION_CONFIDENCE = 0.85;
const PROMOTION_OCCURRENCES = 5;

export function getMemory(repo: PreferenceRepo, ctx: { businessId: string }): MemoryService {
  return {
    async list() {
      return repo.list({ businessId: ctx.businessId });
    },
    async setPreference(input) {
      const now = Date.now();
      const existing = (await repo.list({ businessId: ctx.businessId }))
        .find((r) => r.kind === input.kind && r.key === input.key);
      return repo.upsert({
        id: existing?.id ?? crypto.randomUUID(),
        userId: input.userId ?? existing?.userId ?? null,
        businessId: ctx.businessId,
        kind: input.kind,
        key: input.key,
        valueJson: input.valueJson,
        source: input.source,
        confidence: input.source === 'user' ? 1.0 : existing?.confidence ?? 0.5,
        occurrences: existing?.occurrences ?? 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async delete(id) {
      await repo.delete(id);
    },
    async recordCorrection({ kind, key }) {
      const rows = await repo.list({ businessId: ctx.businessId });
      const row = rows.find((r) => r.kind === kind && r.key === key);
      if (!row) throw new Error('Preference not found');
      if (row.source === 'user') return row;
      if (row.confidence < PROMOTION_CONFIDENCE || row.occurrences < PROMOTION_OCCURRENCES) {
        throw new Error('Below promotion threshold (confidence ≥ 0.85 and ≥ 5 occurrences)');
      }
      return repo.upsert({ ...row, source: 'user', confidence: 1.0, updatedAt: Date.now() });
    },
  };
}
