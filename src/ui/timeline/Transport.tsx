export function Transport(props: {
  seed: number;
  cursor: number;
  total: number;
  playing: boolean;
  canStep: boolean;
  onSeed: (seed: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
}) {
  return (
    <div className="transport">
      <label>
        Seed
        <input
          aria-label="Seed"
          type="number"
          value={props.seed}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value)) props.onSeed(value);
          }}
        />
      </label>
      {props.playing ? (
        <button type="button" onClick={props.onPause}>
          Pause
        </button>
      ) : (
        <button type="button" onClick={props.onPlay} disabled={!props.canStep}>
          Play
        </button>
      )}
      <button type="button" onClick={props.onStep} disabled={!props.canStep || props.playing}>
        Step
      </button>
      <div role="status" aria-label="Timeline position">
        {props.cursor} / {props.total}
      </div>
    </div>
  );
}
