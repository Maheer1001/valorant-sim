import { useEffect, useState } from "react";
import { SHIPPED_CATALOG } from "../sim/agents/catalog.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import { createDefaultDrill } from "../sim/scenario/default-drill.ts";
import { openSession, snapshotAt, stepSession, type Session } from "../sim/session.ts";
import type { Scenario } from "../sim/scenario/types.ts";
import type { Team } from "../sim/composition/team.ts";
import { STANDARD_RULESET } from "../rules/ruleset.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../persistence/scenario-file.ts";
import { MapView } from "./board/MapView.tsx";
import { DraftPanel } from "./draft/DraftPanel.tsx";
import { EventList } from "./timeline/EventList.tsx";
import { Transport } from "./timeline/Transport.tsx";

export function App() {
  const [scenario, setScenario] = useState(() => createDefaultDrill(1));
  const [session, setSession] = useState<Session>(() => openSession(createDefaultDrill(1)));
  const [playing, setPlaying] = useState(false);
  const [fileText, setFileText] = useState("");
  const [fileMessage, setFileMessage] = useState("");

  function commit(next: Scenario) {
    setPlaying(false);
    setScenario(next);
    setSession(openSession(next));
  }

  useEffect(() => {
    if (!playing) return;
    if (!session.outcome.ok || session.cursor >= session.outcome.events.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSession((current) => stepSession(current));
    }, 700);
    return () => window.clearInterval(timer);
  }, [playing, session.cursor, session.outcome]);

  const world = snapshotAt(session);
  const events = session.outcome.ok ? session.outcome.events : [];
  const canStep = session.outcome.ok && session.cursor < events.length;

  function onTeams(attack: Team, defense: Team) {
    commit({ ...scenario, attack, defense });
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>Tactical Simulation Lab</h1>
        <p>
          Drill Hall is an original schematic. Catalog {SHIPPED_CATALOG.version}. Sky Smoke figures are secondary.
          Rifle A is assumed. Coverage describes complete abilities and does not predict a winner.
        </p>
      </header>
      <section className="board">
        <h2>{DRILL_HALL.name}</h2>
        {world ? <MapView map={DRILL_HALL} world={world} /> : null}
        {!session.outcome.ok ? <p role="alert">{session.outcome.message}</p> : null}
        <p className="footnote">{DRILL_HALL.notes}</p>
      </section>
      <aside className="draft">
        <DraftPanel
          catalog={SHIPPED_CATALOG}
          ruleset={STANDARD_RULESET}
          map={DRILL_HALL}
          attack={scenario.attack}
          defense={scenario.defense}
          onTeams={onTeams}
        />
      </aside>
      <section className="timeline">
        <h2>Timeline</h2>
        <Transport
          seed={scenario.seed}
          cursor={session.cursor}
          total={events.length}
          playing={playing}
          canStep={canStep}
          onSeed={(seed) => commit({ ...scenario, seed })}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onStep={() => setSession((current) => stepSession(current))}
        />
        <EventList events={events} cursor={session.cursor} />
        <div className="team-actions">
          <button
            type="button"
            onClick={() => {
              setFileText(serializeScenario(scenario));
              setFileMessage("");
            }}
          >
            Export scenario
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                commit(parseScenario(fileText));
                setFileMessage("Scenario loaded.");
              } catch (error) {
                const message = error instanceof ScenarioFileError ? error.message : "Could not load that scenario.";
                setFileMessage(message);
              }
            }}
          >
            Import scenario
          </button>
        </div>
        <label>
          Scenario JSON
          <textarea
            className="file-box"
            aria-label="Scenario JSON"
            value={fileText}
            onChange={(event) => setFileText(event.target.value)}
          />
        </label>
        <p className="message" role="status">
          {fileMessage}
        </p>
      </section>
    </div>
  );
}
