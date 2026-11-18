import type { RoundResult } from "../../sim/live-round.ts";

export function resultBanner(result: RoundResult): string {
  if (result.kind === "defense-eliminated") return "Attackers win — all defenders eliminated.";
  if (result.kind === "attack-eliminated") return "Defenders win — all attackers eliminated.";
  return "Defenders win — round timer expired.";
}

export function RoundEndBanner({
  result,
  onNewRound,
}: {
  result: RoundResult;
  onNewRound: () => void;
}) {
  return (
    <div className="round-banner" role="status">
      <p>{resultBanner(result)}</p>
      <button type="button" onClick={onNewRound}>
        New round
      </button>
    </div>
  );
}
