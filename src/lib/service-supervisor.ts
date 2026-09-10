import { spawn } from "child_process";
import net from "net";
import fs from "fs";

/**
 * 工作流平台服务监督器
 *
 * 沙箱约束：只有 start.sh 启动的进程树（Next.js dev server）能常驻，
 * 工具调用里 spawn 的进程会在调用结束后被回收。
 * 因此把 Java 后端与 Vite 前端作为 Next.js 服务器的子进程拉起，
 * 并由看门狗定时巡检、崩溃自动重启。
 */

export type ServiceKey = "backend" | "frontend";

export interface ServiceDef {
  key: ServiceKey;
  name: string;
  port: number;
  cwd: string;
  cmd: string;
  args: string[];
  logFile: string;
  /** 启动前置条件（如 jar 是否已构建） */
  prerequisite?: string;
  /** 额外环境变量（如 NODE_OPTIONS 内存上限） */
  env?: Record<string, string>;
}

export interface ServiceStatus {
  key: ServiceKey;
  name: string;
  port: number;
  portOpen: boolean;
  managedPid: number | null;
  processAlive: boolean;
  restarts: number;
  lastSpawnAt: number | null;
  lastExitAt: number | null;
  prerequisiteOk: boolean;
  state: "running" | "starting" | "stopped" | "blocked";
}

const BACKEND_DIR = "/home/z/my-project/workflow_lowcode/backend";
const FRONTEND_DIR = "/home/z/my-project/workflow_lowcode/frontend";
const JAR_PATH = `${BACKEND_DIR}/target/workflow-platform-1.0.0-SNAPSHOT.jar`;

export const SERVICE_DEFS: ServiceDef[] = [
  {
    key: "backend",
    name: "Java 后端 (Spring Boot + Flowable 8)",
    port: 8080,
    cwd: BACKEND_DIR,
    cmd: "java",
    // 内存上限必带：沙箱仅 3.9Gi，无上限 JVM 会被 OOM-killer 连坐 next-server（历史事故），
    // 且与 scripts/start-services.sh 的参数保持一致
    args: ["-Xmx448m", "-XX:MaxMetaspaceSize=192m", "-jar", JAR_PATH, "--spring.profiles.active=sandbox"],
    logFile: "/home/z/tools/backend.log",
    prerequisite: JAR_PATH,
  },
  {
    key: "frontend",
    name: "Vue 前端 (Vite dev server)",
    port: 5173,
    cwd: FRONTEND_DIR,
    cmd: "bun",
    args: ["run", "dev"],
    logFile: "/home/z/tools/vite.log",
    env: { NODE_OPTIONS: "--max-old-space-size=512" },
  },
];

interface ServiceRuntime {
  child?: import("child_process").ChildProcess;
  pid?: number;
  restarts: number;
  lastSpawnAt: number | null;
  lastExitAt: number | null;
}

interface SupervisorGlobal {
  runtimes: Map<ServiceKey, ServiceRuntime>;
  watchdog?: ReturnType<typeof setInterval>;
  spawning: Set<ServiceKey>;
}

const g = globalThis as typeof globalThis & { __wfSupervisor?: SupervisorGlobal };

function getSupervisor(): SupervisorGlobal {
  if (!g.__wfSupervisor) {
    g.__wfSupervisor = {
      runtimes: new Map(),
      spawning: new Set(),
    };
  }
  return g.__wfSupervisor;
}

export function checkPortOpen(port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });
}

function isPidAlive(pid?: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getRuntime(key: ServiceKey): ServiceRuntime {
  const sup = getSupervisor();
  let rt = sup.runtimes.get(key);
  if (!rt) {
    rt = { restarts: 0, lastSpawnAt: null, lastExitAt: null };
    sup.runtimes.set(key, rt);
  }
  return rt;
}

/** 拉起服务进程（作为 Next.js 服务器子进程常驻） */
async function spawnService(def: ServiceDef): Promise<void> {
  const sup = getSupervisor();
  if (sup.spawning.has(def.key)) return;
  sup.spawning.add(def.key);
  try {
    // 端口已被占用（外部手动启动 / 上次子进程仍在）→ 视为已运行
    if (await checkPortOpen(def.port)) return;
    const rt = getRuntime(def.key);
    if (isPidAlive(rt.pid)) return; // 已有受管进程在启动中
    if (def.prerequisite && !fs.existsSync(def.prerequisite)) {
      console.warn(`[supervisor] ${def.key} 前置文件缺失: ${def.prerequisite}`);
      return;
    }
    fs.mkdirSync("/home/z/tools", { recursive: true });
    const out = fs.openSync(def.logFile, "a");
    const child = spawn(def.cmd, def.args, {
      cwd: def.cwd,
      stdio: ["ignore", out, out],
      detached: false,
      env: { ...process.env, ...(def.env ?? {}) },
    });
    child.on("exit", (code) => {
      const r = getRuntime(def.key);
      r.lastExitAt = Date.now();
      r.child = undefined;
      console.warn(`[supervisor] ${def.key} 进程退出 code=${code}`);
    });
    rt.child = child;
    rt.pid = child.pid;
    rt.lastSpawnAt = Date.now();
    rt.restarts += 1;
    console.log(`[supervisor] ${def.key} 已启动 pid=${child.pid}`);
  } finally {
    sup.spawning.delete(def.key);
  }
}

/** 看门狗：巡检并自动拉起挂掉的服务 */
export function startWatchdog(): void {
  const sup = getSupervisor();
  if (sup.watchdog) return;
  sup.watchdog = setInterval(() => {
    for (const def of SERVICE_DEFS) {
      void (async () => {
        const portOpen = await checkPortOpen(def.port);
        const rt = getRuntime(def.key);
        if (portOpen) return; // 健康（无论是否本进程拉起）
        if (isPidAlive(rt.pid)) return; // 启动中，等待
        await spawnService(def); // 已挂掉 → 重启
      })();
    }
  }, 20_000);
  console.log("[supervisor] 看门狗已启动 (20s 巡检)");
}

/** 确保所有服务都已拉起 */
export async function ensureAllServices(): Promise<ServiceStatus[]> {
  startWatchdog();
  for (const def of SERVICE_DEFS) {
    await spawnService(def);
  }
  return collectStatus();
}

export async function collectStatus(): Promise<ServiceStatus[]> {
  const result: ServiceStatus[] = [];
  for (const def of SERVICE_DEFS) {
    const portOpen = await checkPortOpen(def.port);
    const rt = getRuntime(def.key);
    const processAlive = isPidAlive(rt.pid);
    const prerequisiteOk = !def.prerequisite || fs.existsSync(def.prerequisite);
    let state: ServiceStatus["state"];
    if (portOpen) state = "running";
    else if (processAlive) state = "starting";
    else if (!prerequisiteOk) state = "blocked";
    else state = "stopped";
    result.push({
      key: def.key,
      name: def.name,
      port: def.port,
      portOpen,
      managedPid: rt.pid ?? null,
      processAlive,
      restarts: rt.restarts,
      lastSpawnAt: rt.lastSpawnAt,
      lastExitAt: rt.lastExitAt,
      prerequisiteOk,
      state,
    });
  }
  return result;
}
