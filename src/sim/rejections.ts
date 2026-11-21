/**
 * Rejection codes. Stages add their codes in their own file and compose them
 * into RejectionCode here (one line per stage). The core set is the 20 codes
 * that existed before stage H0, in their original order.
 */
export type CoreRejectionCode =
  | "ability-not-owned"
  | "ability-not-executable"
  | "insufficient-charges"
  | "out-of-range"
  | "unknown-agent"
  | "team-full"
  | "duplicate-agent"
  | "unknown-definition"
  | "unknown-map"
  | "ruleset-mismatch"
  | "catalog-mismatch"
  | "invalid-order"
  | "wrong-side"
  | "agent-down"
  | "target-not-enemy"
  | "target-not-visible"
  | "signature-on-cooldown"
  | "insufficient-ult-points"
  | "insufficient-credits"
  | "charges-full";

export type RejectionCode = CoreRejectionCode;
