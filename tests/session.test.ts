import { beforeEach, describe, expect, it } from "vitest";
import {
  loadSession,
  restoreSession,
  saveSession,
  type WorkspaceSession,
} from "../src/features/workbench/workspaceSession";
import {
  EXAMPLE_PROJECT,
  type WorkspaceDocument,
} from "../src/shared/domain/types";
import { saveScenario } from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";

function workspaceWithScenarios(): {
  document: WorkspaceDocument;
  baselineId: string;
  comparisonId: string;
} {
  const withOne = saveScenario(
    EXAMPLE_PROJECT,
    simulateProject(EXAMPLE_PROJECT),
    "基线方案",
  );
  const withTwo = saveScenario(
    withOne,
    simulateProject(withOne, "high"),
    "保守方案",
  );
  const [comparison, baseline] = withTwo.scenarios;
  if (!comparison || !baseline) throw new Error("Scenario fixtures missing");
  return {
    document: {
      version: 1,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [withTwo],
    },
    baselineId: baseline.id,
    comparisonId: comparison.id,
  };
}

describe("workspace session restore", () => {
  beforeEach(() => localStorage.clear());

  it("restores project, module, mode and comparison pair from the session", () => {
    const { document, baselineId, comparisonId } = workspaceWithScenarios();
    const other = {
      ...EXAMPLE_PROJECT,
      id: "project-other",
      title: "另一个项目",
      scenarios: [],
    };
    const documentWithTwo: WorkspaceDocument = {
      version: 1,
      activeProjectId: other.id,
      projects: [other, ...document.projects],
    };
    const session: WorkspaceSession = {
      projectId: EXAMPLE_PROJECT.id,
      module: "scenarios",
      mode: "high",
      baselineScenarioId: baselineId,
      comparisonScenarioId: comparisonId,
    };
    const restored = restoreSession(documentWithTwo, session);
    expect(restored.document.activeProjectId).toBe(EXAMPLE_PROJECT.id);
    expect(restored.module).toBe("scenarios");
    expect(restored.mode).toBe("high");
    expect(restored.baselineScenarioId).toBe(baselineId);
    expect(restored.comparisonScenarioId).toBe(comparisonId);
    expect(restored.notices).toEqual([]);
  });

  it("falls back with an explanation when the recorded project was deleted", () => {
    const { document } = workspaceWithScenarios();
    const restored = restoreSession(document, {
      projectId: "project-gone",
      module: "graph",
      mode: "low",
      baselineScenarioId: "",
      comparisonScenarioId: "",
    });
    expect(restored.document.activeProjectId).toBe(EXAMPLE_PROJECT.id);
    expect(restored.module).toBe("graph");
    expect(restored.notices.join(" ")).toContain("项目已删除");
  });

  it("falls back with an explanation when a recorded scenario was deleted", () => {
    const { document, baselineId } = workspaceWithScenarios();
    const restored = restoreSession(document, {
      projectId: EXAMPLE_PROJECT.id,
      module: "scenarios",
      mode: "expected",
      baselineScenarioId: baselineId,
      comparisonScenarioId: "scenario-gone",
    });
    expect(restored.baselineScenarioId).toBe(baselineId);
    expect(restored.comparisonScenarioId).toBe("");
    expect(restored.notices.join(" ")).toContain("方案已删除");
  });

  it("opens older workspaces without session data into a usable default state", () => {
    const { document } = workspaceWithScenarios();
    const restored = restoreSession(document, undefined);
    expect(restored.document).toBe(document);
    expect(restored.module).toBe("simulation");
    expect(restored.mode).toBe("expected");
    expect(restored.baselineScenarioId).toBe("");
    expect(restored.comparisonScenarioId).toBe("");
    expect(restored.notices).toEqual([]);
  });

  it("round-trips the session through local storage", () => {
    const session: WorkspaceSession = {
      projectId: "project-1",
      module: "archive",
      mode: "low",
      baselineScenarioId: "a",
      comparisonScenarioId: "b",
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("ignores damaged or unknown session payloads", () => {
    localStorage.setItem("latency-lab.session.v1", "{not json");
    expect(loadSession()).toBeUndefined();
    localStorage.setItem(
      "latency-lab.session.v1",
      JSON.stringify({ projectId: 7, module: "unknown", mode: "wild" }),
    );
    expect(loadSession()).toEqual({
      projectId: "",
      module: "simulation",
      mode: "expected",
      baselineScenarioId: "",
      comparisonScenarioId: "",
    });
  });
});
