import type {
  LabModule,
  SimulationMode,
  WorkSession,
  WorkspaceDocument,
} from "../../shared/domain/types";

export const DEFAULT_MODULE: LabModule = "simulation";
export const DEFAULT_MODE: SimulationMode = "expected";

export interface WorkSessionRestore {
  document: WorkspaceDocument;
  module: LabModule;
  mode: SimulationMode;
  comparisonIds: { baselineId: string; comparisonId: string };
  fallbacks: string[];
}

export function applyWorkSession(
  document: WorkspaceDocument,
  session: WorkSession | null,
): WorkSessionRestore {
  const fallbacks: string[] = [];
  let nextDocument = document;
  if (
    session?.activeProjectId &&
    session.activeProjectId !== document.activeProjectId
  ) {
    if (
      document.projects.some(
        (project) => project.id === session.activeProjectId,
      )
    ) {
      nextDocument = { ...document, activeProjectId: session.activeProjectId };
    } else {
      const fallbackProject =
        document.projects.find(
          (project) => project.id === document.activeProjectId,
        ) ?? document.projects[0];
      fallbacks.push(
        `上次查看的链路项目已被删除，已为你打开「${fallbackProject?.title ?? "默认项目"}」。`,
      );
    }
  }
  const activeProject =
    nextDocument.projects.find(
      (project) => project.id === nextDocument.activeProjectId,
    ) ?? nextDocument.projects[0];
  const scenarioIds = new Set(
    (activeProject?.scenarios ?? []).map((scenario) => scenario.id),
  );
  let baselineId = "";
  let comparisonId = "";
  let scenarioDropped = false;
  if (session?.baselineScenarioId) {
    if (scenarioIds.has(session.baselineScenarioId))
      baselineId = session.baselineScenarioId;
    else scenarioDropped = true;
  }
  if (session?.comparisonScenarioId) {
    if (scenarioIds.has(session.comparisonScenarioId))
      comparisonId = session.comparisonScenarioId;
    else scenarioDropped = true;
  }
  if (scenarioDropped)
    fallbacks.push("上次对比的方案快照已被删除，已按现有方案重新选择。");
  return {
    document: nextDocument,
    module: session?.module ?? DEFAULT_MODULE,
    mode: session?.mode ?? DEFAULT_MODE,
    comparisonIds: { baselineId, comparisonId },
    fallbacks,
  };
}
