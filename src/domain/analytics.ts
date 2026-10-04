// Browser/server event schemas live in tracking.ts; browser cannot select event authority.
export interface Campaign { source?: string; medium?: string; campaign?: string }
// Approved campaign codes only. Unknown/raw query parameters must never be persisted.
export function approvedCampaign(search: string, allowlist: ReadonlySet<string>): Campaign {
  const params = new URLSearchParams(search);
  const result: Campaign = {};
  for (const field of ['source', 'medium', 'campaign'] as const) {
    const value = params.get(`utm_${field}`);
    if (value && allowlist.has(value)) result[field] = value;
  }
  return result;
}
