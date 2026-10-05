import type { LabModule, SimulationMode, WorkSession } from "../domain/types";

const SESSION_KEY = "latency-lab.session.v1";
const WRITE_DELAY_MS = 250;

const LAB_MODULES: readonly LabModule[] = [
  "projects",
  "graph",
  "simulation",
  "scenarios",
  "archive",
];
const SIMULATION_MODES: readonly SimulationMode[] = ["low", "expected", "high"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseWorkSession(value: unknown): WorkSession | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const module = LAB_MODULES.includes(value.module as LabModule)
    ? (value.module as LabModule)
    : null;
  const mode = SIMULATION_MODES.includes(value.mode as SimulationMode)
    ? (value.mode as SimulationMode)
    : null;
  return {
    version: 1,
    activeProjectId: optionalString(value.activeProjectId),
    module,
    mode,
    baselineScenarioId: optionalString(value.baselineScenarioId),
    comparisonScenarioId: optionalString(value.comparisonScenarioId),
    updatedAt:
      typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
  };
}

export class SessionRepository {
  private pending: WorkSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<WorkSession | null> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const session = parseWorkSession(JSON.parse(raw) as unknown);
      if (!session) localStorage.removeItem(SESSION_KEY);
      return session;
    } catch {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // 清理失败同样不阻塞打开
      }
      return null;
    }
  }

  scheduleWrite(session: WorkSession): void {
    this.pending = session;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const session = this.pending;
    this.pending = null;
    if (!session) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // 现场写入失败只影响下次恢复，不阻塞编辑保存
    }
  }
}
