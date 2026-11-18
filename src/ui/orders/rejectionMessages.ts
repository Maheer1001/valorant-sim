import type { RejectionCode } from "../../sim/types.ts";

const MESSAGES: Record<RejectionCode, string> = {
  "ability-not-owned": "That agent does not own this ability.",
  "ability-not-executable": "This ability is not playable yet (placeholder).",
  "insufficient-charges": "No charges left for this ability.",
  "out-of-range": "That point is outside the ability's cast range.",
  "unknown-agent": "That agent is not in the round.",
  "team-full": "The team already has five agents.",
  "duplicate-agent": "That agent is already on this team.",
  "unknown-definition": "Unknown agent in the catalog.",
  "unknown-map": "The map is not loaded.",
  "ruleset-mismatch": "Scenario ruleset does not match the active ruleset.",
  "catalog-mismatch": "Scenario catalog version does not match the loaded catalog.",
  "invalid-order": "That order is not valid (check numbers and fields).",
  "wrong-side": "That agent is not on your side.",
  "agent-down": "That agent is down.",
  "target-not-enemy": "Shoot targets must be enemies.",
  "target-not-visible": "That target is not visible.",
  "missing-plan": "Both sides must submit a plan before resolve.",
  "plan-already-submitted": "A plan is already queued for this window.",
  "signature-on-cooldown": "Signature is still on cooldown.",
  "insufficient-ult-points": "Not enough ultimate points (need 8).",
  "insufficient-credits": "Not enough credits to buy that charge.",
  "charges-full": "That ability is already at max charges.",
};

export function rejectionMessage(code: RejectionCode): string {
  return MESSAGES[code] ?? `Order rejected (${code}).`;
}
