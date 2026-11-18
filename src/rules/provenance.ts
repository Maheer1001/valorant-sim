export type ProvenanceKind = "verified" | "secondary" | "assumed" | "owner";

/**
 * Where a figure or rule came from. Approximations stay assumed or secondary.
 * `owner` means the project owner specified the value; it is not a Valorant measurement.
 */
export type Provenance = {
  kind: ProvenanceKind;
  source: string;
  note: string;
};
