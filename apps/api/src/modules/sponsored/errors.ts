import { httpError } from '../../lib/errors';

export type SponsoredErrorCode =
  | 'NOT_ELIGIBLE'
  | 'SLOT_UNAVAILABLE'
  | 'CAMPAIGN_NOT_EDITABLE'
  | 'CAMPAIGN_NOT_CANCELABLE'
  | 'INVALID_DATE_RANGE';

export class SponsoredError extends Error {
  constructor(
    public code: SponsoredErrorCode,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
  toHttp() {
    const map: Record<SponsoredErrorCode, number> = {
      NOT_ELIGIBLE: 422,
      SLOT_UNAVAILABLE: 409,
      CAMPAIGN_NOT_EDITABLE: 409,
      CAMPAIGN_NOT_CANCELABLE: 409,
      INVALID_DATE_RANGE: 422,
    };
    return httpError(map[this.code], this.code, this.message, this.details);
  }
}