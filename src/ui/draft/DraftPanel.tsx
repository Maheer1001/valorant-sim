import { useState } from "react";
import type { Catalog } from "../../sim/agents/catalog.ts";
import { addMember, removeMember, setAssignment, type Team } from "../../sim/composition/team.ts";
import { buildProfile } from "../../sim/composition/profile.ts";
import { evaluateCoverage, formatCoverage } from "../../sim/composition/coverage.ts";
import type { MapDefinition } from "../../sim/map/drill-hall.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import type { Role, TacticalAssignment } from "../../sim/types.ts";

const ASSIGNMENTS: readonly TacticalAssignment[] = ["entry", "lurk", "anchor", "flank-watch"];

function roleLabel(role: Role): string {
  if (role === "duelist") return "Duelist";
  if (role === "initiator") return "Initiator";
  if (role === "controller") return "Controller";
  return "Sentinel";
}

export function DraftPanel(props: {
  catalog: Catalog;
  ruleset: Ruleset;
  map: MapDefinition;
  attack: Team;
  defense: Team;
  onTeams: (attack: Team, defense: Team) => void;
}) {
  const [selectedId, setSelectedId] = useState(props.catalog.agents[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selected = props.catalog.agents.find((agent) => agent.id === selectedId) ?? null;
  const attackProfile = buildProfile(props.attack, props.catalog, props.map.id, props.ruleset.id);
  const defenseProfile = buildProfile(props.defense, props.catalog, props.map.id, props.ruleset.id);
  const attackReport = evaluateCoverage(attackProfile, {
    mapId: props.map.id,
    opposingProfile: defenseProfile,
  });
  const defenseReport = evaluateCoverage(defenseProfile, {
    mapId: props.map.id,
    opposingProfile: attackProfile,
  });

  function add(side: "attack" | "defense") {
    if (!selected) return;
    const result = addMember({
      attack: props.attack,
      defense: props.defense,
      side,
      definitionId: selected.id,
      catalog: props.catalog,
      ruleset: props.ruleset,
      map: props.map,
      assignment: null,
    });
    if (!result.ok) {
      setMessage(
        result.code === "team-full"
          ? "That team is already at the ruleset size."
          : "That team already has this agent.",
      );
      return;
    }
    setMessage("");
    props.onTeams(result.attack, result.defense);
  }

  return (
    <div>
      <h2>Draft</h2>
      <p className="ruleset-note">
        {props.ruleset.label}. Team size {props.ruleset.teamSize} ({props.ruleset.teamSizeProvenance.kind}).
        Uniqueness {props.ruleset.uniqueness} ({props.ruleset.uniquenessProvenance.kind}).
      </p>
      <div className="catalog" aria-label="Agent catalog">
        {props.catalog.agents.map((agent) => (
          <button
            type="button"
            key={agent.id}
            aria-pressed={agent.id === selectedId}
            onClick={() => setSelectedId(agent.id)}
          >
            {agent.name}, {roleLabel(agent.role)}
          </button>
        ))}
      </div>
      {selected ? (
        <section className="kit" aria-label="Agent kit">
          <h3>
            {selected.name}
            <span className="badge">{roleLabel(selected.role)}</span>
          </h3>
          {selected.abilities.map((ability) => (
            <p key={ability.id}>
              {ability.name}
              <span className="badge">{ability.slot}</span>
              <span className="badge">{ability.implementation}</span>
              <span className="badge">{ability.figures.kind}</span>
            </p>
          ))}
          <div className="team-actions">
            <button type="button" onClick={() => add("attack")}>
              Add {selected.name} to Attack
            </button>
            <button type="button" onClick={() => add("defense")}>
              Add {selected.name} to Defense
            </button>
          </div>
        </section>
      ) : null}
      <p className="message" role="status">
        {message}
      </p>
      <TeamColumn
        title="Attack"
        team={props.attack}
        catalog={props.catalog}
        coverage={formatCoverage(attackReport)}
        onRemove={(instanceId) => props.onTeams(removeMember(props.attack, instanceId), props.defense)}
        onAssignment={(instanceId, assignment) =>
          props.onTeams(setAssignment(props.attack, instanceId, assignment), props.defense)
        }
      />
      <TeamColumn
        title="Defense"
        team={props.defense}
        catalog={props.catalog}
        coverage={formatCoverage(defenseReport)}
        onRemove={(instanceId) => props.onTeams(props.attack, removeMember(props.defense, instanceId))}
        onAssignment={(instanceId, assignment) =>
          props.onTeams(props.attack, setAssignment(props.defense, instanceId, assignment))
        }
      />
    </div>
  );
}

function TeamColumn(props: {
  title: string;
  team: Team;
  catalog: Catalog;
  coverage: string;
  onRemove: (instanceId: string) => void;
  onAssignment: (instanceId: string, assignment: TacticalAssignment | null) => void;
}) {
  return (
    <section aria-label={`${props.title} roster`}>
      <h3>{props.title}</h3>
      {props.team.members.map((member) => {
        const definition = props.catalog.agents.find((agent) => agent.id === member.definitionId);
        const name = definition?.name ?? member.definitionId;
        return (
          <div className="member" key={member.instanceId}>
            <div>
              {name}
              {definition ? <span className="badge">{roleLabel(definition.role)}</span> : null}
            </div>
            <label>
              Assignment
              <select
                aria-label={`Assignment for ${name} on ${props.title}`}
                value={member.assignment ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onAssignment(member.instanceId, value === "" ? null : (value as TacticalAssignment));
                }}
              >
                <option value="">Unassigned</option>
                {ASSIGNMENTS.map((assignment) => (
                  <option key={assignment} value={assignment}>
                    {assignment}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => props.onRemove(member.instanceId)}>
              Remove {name} from {props.title}
            </button>
          </div>
        );
      })}
      <section aria-label={`${props.title} coverage`}>
        <h3>{props.title} coverage</h3>
        <pre className="coverage">{props.coverage}</pre>
      </section>
    </section>
  );
}
