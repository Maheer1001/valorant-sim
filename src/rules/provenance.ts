export type ProvenanceKind = "verified" | "secondary" | "assumed";

/** Where a figure or rule came from. Approximations stay assumed or secondary. */
export type Provenance = {
  kind: ProvenanceKind;
  source: string;
  note: string;
};
