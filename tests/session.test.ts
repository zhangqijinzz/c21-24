import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseWorkSession,
  SessionRepository,
} from "../src/shared/repositories/sessionRepository";
import {
  applyWorkSession,
  DEFAULT_MODE,
  DEFAULT_MODULE,
} from "../src/features/workbench/workSession";
import {
  EXAMPLE_PROJECT,
  type WorkSession,
  type WorkspaceDocument,
} from "../src/shared/domain/types";
import { saveScenario } from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";

const SESSION_KEY = "latency-lab.session.v1";

function fullSession(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    version: 1,
    activeProjectId: EXAMPLE_PROJECT.id,
    module: "scenarios",
    mode: "high",
    baselineScenarioId: "scenario-a",
    comparisonScenarioId: "scenario-b",
    updatedAt: 123,
    ...overrides,
  };
}

function workspaceWithScenarios(): {
  document: WorkspaceDocument;
  baselineId: string;
  comparisonId: string;
} {
  const first = saveScenario(
    EXAMPLE_PROJECT,
    simulateProject(EXAMPLE_PROJECT),
    "基准",
  );
  const second = saveScenario(first, simulateProject(first), "对照");
  const comparisonId = second.scenarios[0]?.id ?? "";
  const baselineId = second.scenarios[1]?.id ?? "";
  return {
    document: {
      version: 1,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [second],
    },
    baselineId,
    comparisonId,
  };
}

describe("work session parsing", () => {
  it("rejects non-objects and unknown versions", () => {
    expect(parseWorkSession(null)).toBeNull();
    expect(parseWorkSession("session")).toBeNull();
    expect(parseWorkSession({ version: 2, module: "graph" })).toBeNull();
  });

  it("keeps valid fields and blanks out invalid ones", () => {
    const session = parseWorkSession({
      version: 1,
      activeProjectId: "project-1",
      module: "unknown-page",
      mode: "high",
      baselineScenarioId: 42,
      comparisonScenarioId: "scenario-b",
      updatedAt: "later",
    });
    expect(session).toEqual({
      version: 1,
      activeProjectId: "project-1",
      module: null,
      mode: "high",
      baselineScenarioId: null,
      comparisonScenarioId: "scenario-b",
      updatedAt: 0,
    });
  });
});

describe("session repository", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("returns null for older workspaces without any session record", async () => {
    expect(await new SessionRepository().load()).toBeNull();
  });

  it("round-trips a session and drops corrupt records", async () => {
    const repository = new SessionRepository();
    localStorage.setItem(SESSION_KEY, JSON.stringify(fullSession()));
    expect(await repository.load()).toEqual(fullSession());
    localStorage.setItem(SESSION_KEY, "{not json");
    expect(await repository.load()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("debounces rapid writes into a single storage write", () => {
    vi.useFakeTimers();
    try {
      const repository = new SessionRepository();
      const writes: string[] = [];
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(
        (key: string, value: string) => {
          if (key === SESSION_KEY) writes.push(value);
        },
      );
      repository.scheduleWrite(fullSession({ module: "graph" }));
      repository.scheduleWrite(fullSession({ module: "projects" }));
      repository.scheduleWrite(fullSession({ module: "scenarios" }));
      expect(writes).toHaveLength(0);
      vi.advanceTimersByTime(300);
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0] ?? "{}")).toMatchObject({
        module: "scenarios",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes pending writes immediately and swallows storage failures", () => {
    const repository = new SessionRepository();
    repository.scheduleWrite(fullSession());
    repository.flush();
    expect(localStorage.getItem(SESSION_KEY)).toContain('"module":"scenarios"');
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => {
      repository.scheduleWrite(fullSession());
      repository.flush();
    }).not.toThrow();
  });
});

describe("work session restore", () => {
  it("falls back to defaults when an older workspace has no session", () => {
    const { document } = workspaceWithScenarios();
    const restore = applyWorkSession(document, null);
    expect(restore.document).toBe(document);
    expect(restore.module).toBe(DEFAULT_MODULE);
    expect(restore.mode).toBe(DEFAULT_MODE);
    expect(restore.comparisonIds).toEqual({
      baselineId: "",
      comparisonId: "",
    });
    expect(restore.fallbacks).toEqual([]);
  });

  it("restores project, page, mode and comparison selection", () => {
    const { document, baselineId, comparisonId } = workspaceWithScenarios();
    const other = {
      ...EXAMPLE_PROJECT,
      id: "project-other",
      title: "另一个项目",
    };
    const workspace: WorkspaceDocument = {
      version: 1,
      activeProjectId: other.id,
      projects: [other, ...document.projects],
    };
    const restore = applyWorkSession(
      workspace,
      fullSession({
        activeProjectId: EXAMPLE_PROJECT.id,
        baselineScenarioId: baselineId,
        comparisonScenarioId: comparisonId,
      }),
    );
    expect(restore.document.activeProjectId).toBe(EXAMPLE_PROJECT.id);
    expect(restore.module).toBe("scenarios");
    expect(restore.mode).toBe("high");
    expect(restore.comparisonIds).toEqual({ baselineId, comparisonId });
    expect(restore.fallbacks).toEqual([]);
  });

  it("falls back with an explanation when the recorded project was deleted", () => {
    const { document } = workspaceWithScenarios();
    const restore = applyWorkSession(
      document,
      fullSession({
        activeProjectId: "project-gone",
        baselineScenarioId: null,
        comparisonScenarioId: null,
      }),
    );
    expect(restore.document.activeProjectId).toBe(EXAMPLE_PROJECT.id);
    expect(restore.fallbacks).toHaveLength(1);
    expect(restore.fallbacks[0]).toContain("已被删除");
    expect(restore.fallbacks[0]).toContain(EXAMPLE_PROJECT.title);
  });

  it("drops comparison picks whose scenarios were deleted and explains", () => {
    const { document, baselineId } = workspaceWithScenarios();
    const restore = applyWorkSession(
      document,
      fullSession({
        activeProjectId: EXAMPLE_PROJECT.id,
        baselineScenarioId: baselineId,
        comparisonScenarioId: "scenario-gone",
      }),
    );
    expect(restore.comparisonIds).toEqual({
      baselineId,
      comparisonId: "",
    });
    expect(restore.fallbacks).toHaveLength(1);
    expect(restore.fallbacks[0]).toContain("方案快照已被删除");
  });

  it("ignores scenarios that belong to a different project", () => {
    const { document, baselineId } = workspaceWithScenarios();
    const other = {
      ...EXAMPLE_PROJECT,
      id: "project-other",
      scenarios: [],
    };
    const workspace: WorkspaceDocument = {
      version: 1,
      activeProjectId: other.id,
      projects: [other, ...document.projects],
    };
    const restore = applyWorkSession(
      workspace,
      fullSession({
        activeProjectId: other.id,
        baselineScenarioId: baselineId,
        comparisonScenarioId: null,
      }),
    );
    expect(restore.comparisonIds.baselineId).toBe("");
    expect(restore.fallbacks[0]).toContain("方案快照已被删除");
  });
});
