import type {
  SimulationMode,
  WorkspaceDocument,
} from "../../shared/domain/types";

export type LabModule =
  "projects" | "graph" | "simulation" | "scenarios" | "archive";

export interface WorkspaceSession {
  projectId: string;
  module: LabModule;
  mode: SimulationMode;
  baselineScenarioId: string;
  comparisonScenarioId: string;
}

export interface SessionRestore {
  document: WorkspaceDocument;
  module: LabModule;
  mode: SimulationMode;
  baselineScenarioId: string;
  comparisonScenarioId: string;
  notices: string[];
}

const SESSION_KEY = "latency-lab.session.v1";

const MODULES: readonly LabModule[] = [
  "projects",
  "graph",
  "simulation",
  "scenarios",
  "archive",
];
const MODES: readonly SimulationMode[] = ["low", "expected", "high"];

export const DEFAULT_MODULE: LabModule = "simulation";
export const DEFAULT_MODE: SimulationMode = "expected";

export function loadSession(): WorkspaceSession | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return undefined;
    const record = value as Record<string, unknown>;
    return {
      projectId: typeof record.projectId === "string" ? record.projectId : "",
      module: MODULES.includes(record.module as LabModule)
        ? (record.module as LabModule)
        : DEFAULT_MODULE,
      mode: MODES.includes(record.mode as SimulationMode)
        ? (record.mode as SimulationMode)
        : DEFAULT_MODE,
      baselineScenarioId:
        typeof record.baselineScenarioId === "string"
          ? record.baselineScenarioId
          : "",
      comparisonScenarioId:
        typeof record.comparisonScenarioId === "string"
          ? record.comparisonScenarioId
          : "",
    };
  } catch {
    return undefined;
  }
}

export function saveSession(session: WorkspaceSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // 现场记录失败不影响正常工作区保存
  }
}

export function restoreSession(
  document: WorkspaceDocument,
  session: WorkspaceSession | undefined,
): SessionRestore {
  if (!session)
    return {
      document,
      module: DEFAULT_MODULE,
      mode: DEFAULT_MODE,
      baselineScenarioId: "",
      comparisonScenarioId: "",
      notices: [],
    };
  const notices: string[] = [];
  let next = document;
  if (session.projectId && session.projectId !== document.activeProjectId) {
    if (document.projects.some((project) => project.id === session.projectId))
      next = { ...document, activeProjectId: session.projectId };
    else notices.push("上次查看的项目已删除，已回退到当前项目。");
  }
  const active =
    next.projects.find((project) => project.id === next.activeProjectId) ??
    next.projects[0];
  const scenarioIds = new Set(
    (active?.scenarios ?? []).map((scenario) => scenario.id),
  );
  const keepIfPresent = (id: string) => (id && scenarioIds.has(id) ? id : "");
  const baselineScenarioId = keepIfPresent(session.baselineScenarioId);
  const comparisonScenarioId = keepIfPresent(session.comparisonScenarioId);
  if (
    (session.baselineScenarioId && !baselineScenarioId) ||
    (session.comparisonScenarioId && !comparisonScenarioId)
  )
    notices.push("之前对比的方案已删除，已回退到可用的方案。");
  return {
    document: next,
    module: session.module,
    mode: session.mode,
    baselineScenarioId,
    comparisonScenarioId,
    notices,
  };
}
