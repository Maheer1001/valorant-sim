import type { CompositionProfile } from "./profile.ts";
import { TRACKED_CAPABILITIES, type CapabilityKind } from "../types.ts";
import type { Provenance } from "../../rules/provenance.ts";

export type CapabilityOffer = {
  kind: CapabilityKind;
  agentDefinitionId: string;
  agentName: string;
  abilityId: string;
  abilityName: string;
  durationMs: number | null;
  maxCharges: number | null;
  deployDelayMs: number | null;
  radiusMm: number | null;
};

export type CoverageReport = {
  kind: "coverage";
  offers: CapabilityOffer[];
  overlaps: { kind: CapabilityKind; count: number; abilityNames: string[] }[];
  gaps: CapabilityKind[];
};

export type EvaluationContext = {
  mapId: string;
  opposingProfile: CompositionProfile | null;
};

/**
 * Later milestones register evaluators with this signature.
 * Milestone 1 ships coverage only.
 */
export type CompositionEvaluator<TReport> = (
  profile: CompositionProfile,
  context: EvaluationContext,
) => TReport;

export const IMPLEMENTED_EVALUATORS = ["coverage"] as const;

export const PLANNED_EVALUATORS = [
  "map-suitability",
  "synergy",
  "counter-composition",
  "supported-plans",
] as const;

export type PlannedEvaluator = (typeof PLANNED_EVALUATORS)[number];

export type SupportedPlanReport = {
  kind: "supported-plans";
  plans: readonly {
    planId: string;
    requiredCapabilities: readonly CapabilityKind[];
    feasible: boolean;
    missing: readonly CapabilityKind[];
  }[];
};

/**
 * Coverage reads complete abilities only. The role label is ignored.
 * `context` is accepted so callers can already pass the opposing draft.
 * This function does not score that draft.
 */
export function evaluateCoverage(
  profile: CompositionProfile,
  _context: EvaluationContext,
): CoverageReport {
  const offers: CapabilityOffer[] = [];
  for (const member of profile.members) {
    for (const ability of member.abilities) {
      if (ability.implementation !== "complete" || ability.capability === null) continue;
      offers.push({
        kind: ability.capability,
        agentDefinitionId: member.definitionId,
        agentName: member.displayName,
        abilityId: ability.abilityId,
        abilityName: ability.name,
        durationMs: ability.durationMs,
        maxCharges: ability.maxCharges,
        deployDelayMs: ability.deployDelayMs,
        radiusMm: ability.radiusMm,
      });
    }
  }
  offers.sort((a, b) => a.kind.localeCompare(b.kind) || a.agentName.localeCompare(b.agentName));

  const overlaps = TRACKED_CAPABILITIES.flatMap((kind) => {
    const matching = offers.filter((offer) => offer.kind === kind);
    if (matching.length < 2) return [];
    return [
      {
        kind,
        count: matching.length,
        abilityNames: matching.map((offer) => offer.abilityName),
      },
    ];
  });

  const gaps = TRACKED_CAPABILITIES.filter((kind) => !offers.some((offer) => offer.kind === kind));
  return { kind: "coverage", offers, overlaps, gaps };
}

export function formatCoverage(report: CoverageReport): string {
  const offerLine =
    report.offers.length === 0
      ? "none"
      : report.offers
          .map((offer) => `${offer.kind}: ${offer.agentName} ${offer.abilityName}`)
          .join("; ");
  const overlapLine =
    report.overlaps.length === 0
      ? "none"
      : report.overlaps.map((overlap) => `${overlap.kind} x${overlap.count}`).join("; ");
  const gapLine = report.gaps.length === 0 ? "none" : report.gaps.join(", ");
  return `Offers: ${offerLine}\nOverlaps: ${overlapLine}\nGaps: ${gapLine}`;
}

export const COVERAGE_DOES_NOT_PREDICT_WINS: Provenance = {
  kind: "assumed",
  source: "milestone-1",
  note: "A coverage report describes available complete abilities. It is not a match prediction.",
};
