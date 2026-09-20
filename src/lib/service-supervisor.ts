import { spawn, execSync, execFileSync } from "child_process";
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
  /** 启动前置条件（如 jar / node_modules 哨兵是否已构建/安装） */
  prerequisite?: string;
  /** 前置缺失时的自愈命令（如 bun install）；成功后重新检查前置 */
  autoFixCmd?: string;
  autoFixLabel?: string;
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
const NODE_BACKEND_DIR = "/home/z/my-project/workflow_lowcode/backend-node";
const JAR_PATH = `${BACKEND_DIR}/target/workflow-platform-1.0.0-SNAPSHOT.jar`;
const JDK_PATH = "/home/z/tools/jdk21";
const MAVEN_PATH = "/home/z/tools/maven";
const JAVA_BUILD_LOG = "/home/z/tools/java-build.log";
const BOOTSTRAP_SCRIPT = "/home/z/my-project/scripts/bootstrap-after-reset.sh";

/**
 * 引擎切换标记（Task 13-8 契约，Task 13-R2 加固）：
 * 双位置探测：安全区主位置 /home/z/my-project/workflow_lowcode/backend-node/.engine-node
 * （沙箱重置不丢失）+ 兼容旧位置 /home/z/tools/backend-engine-node。
 * 文件存在 → 8080 由 backend-node (bun) 提供；均不存在 → Java jar。
 * 看门狗每次巡检（20s）动态重新决策，前端/Vite proxy 零改动。
 * 回滚：删除两个标记文件 → 重启 next dev（或手动 start-services.sh）→ Java 回归。
 */
export const NODE_ENGINE_MARKER = "/home/z/tools/backend-engine-node";
export const NODE_ENGINE_MARKER_SAFE =
  "/home/z/my-project/workflow_lowcode/backend-node/.engine-node";

/**
 * 持久化 Node 引擎信号（Task 13-R3）：
 * 沙箱「发布/重置」会清掉 node_modules、/home/z/tools、甚至项目内的 dotfile marker，
 * 但源码与 SQLite 数据库历次重置均幸存。因此 workflow.db 存在即视为 Node 引擎
 * 的最强持久信号，并顺手重建双 marker 完成自愈。
 */
export const NODE_DB_FILE = `${NODE_BACKEND_DIR}/data/workflow.db`;

/** 重建双位置 marker（幂等，失败静默） */
export function recreateEngineMarkers(): void {
  try {
    fs.mkdirSync("/home/z/tools", { recursive: true });
    fs.writeFileSync(NODE_ENGINE_MARKER_SAFE, "");
    fs.writeFileSync(NODE_ENGINE_MARKER, "");
  } catch {
    /* 只读等极端场景下忽略，决策已返回 true */
  }
}

export function nodeEngineEnabled(): boolean {
  // ① 显式 marker（双位置，保留「删 marker 回滚 Java」契约）
  if (
    fs.existsSync(NODE_ENGINE_MARKER_SAFE) ||
    fs.existsSync(NODE_ENGINE_MARKER)
  )
    return true;
  // ② 持久信号：Node 引擎主库历次重置均幸存 → 判定 Node 并重建 marker 自愈
  //   （修复发布/重置后 marker 全灭 → 误走 Java 分支 → jar 缺失死锁 blocked）
  if (fs.existsSync(NODE_DB_FILE)) {
    recreateEngineMarkers();
    return true;
  }
  return false;
}

/** ---------- Task 13-R4：双引擎切换（Node.js 版 / Java 版） ---------- */

export type EngineChoice = "node" | "java";

export interface EngineStatus {
  engine: EngineChoice;
  markerSafe: boolean;
  markerTools: boolean;
  nodeDbExists: boolean;
  java: {
    jarExists: boolean;
    jdkReady: boolean;
    mavenReady: boolean;
    buildRunning: boolean;
    buildLogTail: string | null;
  };
}

export function currentEngine(): EngineChoice {
  return nodeEngineEnabled() ? "node" : "java";
}

export function isJavaBuildRunning(): boolean {
  try {
    execFileSync("pgrep", ["-f", "bootstrap-after-reset.sh"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function getEngineStatus(): EngineStatus {
  let buildLogTail: string | null = null;
  try {
    const raw = fs.readFileSync(JAVA_BUILD_LOG, "utf8");
    buildLogTail = raw.slice(-800);
  } catch {
    /* 日志尚未生成 */
  }
  return {
    engine: currentEngine(),
    markerSafe: fs.existsSync(NODE_ENGINE_MARKER_SAFE),
    markerTools: fs.existsSync(NODE_ENGINE_MARKER),
    nodeDbExists: fs.existsSync(NODE_DB_FILE),
    java: {
      jarExists: fs.existsSync(JAR_PATH),
      jdkReady: fs.existsSync(`${JDK_PATH}/bin/javac`),
      mavenReady: fs.existsSync(`${MAVEN_PATH}/bin/mvn`),
      buildRunning: isJavaBuildRunning(),
      buildLogTail,
    },
  };
}

/** 后台一键构建 Java 版（JDK + Maven + jar，约 10~20 分钟）；重复调用安全 */
export function startJavaBuild(): { started: boolean; reason?: string } {
  if (isJavaBuildRunning()) return { started: false, reason: "构建已在进行中" };
  if (fs.existsSync(JAR_PATH)) return { started: false, reason: "jar 已存在，无需构建" };
  fs.mkdirSync("/home/z/tools", { recursive: true });
  const out = fs.openSync(JAVA_BUILD_LOG, "a");
  fs.appendFileSync(JAVA_BUILD_LOG, `\n===== 构建开始 ${new Date().toISOString()} =====\n`);
  const child = spawn("bash", [BOOTSTRAP_SCRIPT], {
    detached: true,
    stdio: ["ignore", out, out],
    // MAVEN_OPTS 堆上限：沙箱仅 3.9Gi，Maven 默认堆=物理 1/4 会挤压 next-server（历史 OOM 事故）
    env: { ...process.env, MAVEN_OPTS: "-Xmx512m -XX:MaxMetaspaceSize=256m" },
  });
  child.unref();
  console.log(`[supervisor] Java 构建已启动 pid=${child.pid}，日志: ${JAVA_BUILD_LOG}`);
  return { started: true };
}

/** 切换后端引擎：写/清 marker → 杀 8080 旧进程 → 清退避 → 立即按新引擎拉起 */
export async function switchBackendEngine(target: EngineChoice): Promise<{
  ok: boolean;
  message: string;
}> {
  const cur = currentEngine();
  if (cur === target) return { ok: true, message: `当前已是${target === "node" ? "Node.js" : "Java"}版，无需切换` };
  if (target === "java" && !fs.existsSync(JAR_PATH)) {
    return { ok: false, message: "Java 版 jar 尚未构建，请先点击「一键构建」后再切换" };
  }
  // 1. 改写引擎标记
  if (target === "node") recreateEngineMarkers();
  else {
    for (const m of [NODE_ENGINE_MARKER_SAFE, NODE_ENGINE_MARKER]) {
      try {
        fs.rmSync(m, { force: true });
      } catch {
        /* 忽略 */
      }
    }
  }
  console.log(`[supervisor] 引擎切换 → ${target}，正在停止旧 8080 进程...`);
  // 2. 停旧后端：优先本监督器受管子进程，再兜底 fuser 清端口
  const rt = getRuntime("backend");
  if (rt.child && isPidAlive(rt.pid)) {
    try {
      rt.child.kill("SIGTERM");
    } catch {
      /* 忽略 */
    }
  }
  for (let i = 0; i < 10; i++) {
    if (!(await checkPortOpen(8080))) break;
    if (i === 5) {
      try {
        execFileSync("fuser", ["-k", "8080/tcp"], { stdio: "ignore" });
      } catch {
        /* fuser 缺失时忽略，循环继续等 */
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (await checkPortOpen(8080)) {
    return { ok: false, message: "8080 被非受管进程占用且无法清场，切换失败（可手动 fuser -k 8080/tcp）" };
  }
  // 3. 清运行态（崩溃退避/启动即崩计数），立即按新引擎拉起
  rt.child = undefined;
  rt.pid = undefined;
  rt.crashStreak = 0;
  rt.backoffUntil = 0;
  const sup = getSupervisor();
  const def = getServiceDefs().find((d) => d.key === "backend");
  if (!def) return { ok: false, message: "内部错误：backend 定义缺失" };
  sup.spawning.delete("backend");
  const outcome = await spawnService(def);
  const text =
    outcome.action === "spawned"
      ? `已切换为${target === "node" ? "Node.js" : "Java"}版，后端启动中…`
      : outcome.action === "already-running"
        ? `已切换为${target === "node" ? "Node.js" : "Java"}版，后端运行中`
        : `标记已切换，但拉起结果：${outcome.action}${outcome.reason ? `（${outcome.reason}）` : ""}`;
  return { ok: outcome.action === "spawned" || outcome.action === "already-running", message: text };
}

/**
 * 动态服务定义：每次调用时按标记/持久信号重新决策（监督器启动后仍可切换）。
 * Task 13-R3 决策链：marker / workflow.db → Node；否则 Java——
 * 但 jar 缺失时 Java 根本无法运行（且无自愈手段），自动回落 Node，
 * 绝不让服务卡死在 blocked（Node 分支有 bun install 自愈兜底）。
 */
export function getServiceDefs(): ServiceDef[] {
  const nodeEngine = nodeEngineEnabled() || !fs.existsSync(JAR_PATH);
  const backendDef: ServiceDef = nodeEngine
    ? {
        key: "backend",
        name: "Node 后端 (bun + Express + SQLite 引擎)",
        port: 8080,
        cwd: NODE_BACKEND_DIR,
        cmd: "bun",
        args: ["src/index.ts"],
        logFile: "/home/z/tools/backend-node.log",
        env: { PORT: "8080", NODE_OPTIONS: "--max-old-space-size=512" },
        prerequisite: `${NODE_BACKEND_DIR}/node_modules/express`,
        autoFixCmd: "bun install",
        autoFixLabel: "依赖缺失，自动执行 bun install",
      }
    : {
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
      };
  return [backendDef, FRONTEND_DEF];
}

const FRONTEND_DEF: ServiceDef = {
  key: "frontend",
  name: "Vue 前端 (Vite dev server)",
  port: 5173,
  cwd: FRONTEND_DIR,
  cmd: "bun",
  args: ["run", "dev"],
  logFile: "/home/z/tools/vite.log",
  env: { NODE_OPTIONS: "--max-old-space-size=512" },
  prerequisite: `${FRONTEND_DIR}/node_modules/vite`,
  autoFixCmd: "bun install",
  autoFixLabel: "依赖缺失，自动执行 bun install",
};

/** 兼容旧导出（静态视图）；运行时请用 getServiceDefs() */
export const SERVICE_DEFS: ServiceDef[] = getServiceDefs();

interface ServiceRuntime {
  child?: import("child_process").ChildProcess;
  pid?: number;
  restarts: number;
  lastSpawnAt: number | null;
  lastExitAt: number | null;
  /** 连续启动即崩次数（用于退避） */
  crashStreak: number;
  /** 退避到该时间戳前不再 spawn */
  backoffUntil: number;
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
    rt = {
      restarts: 0,
      lastSpawnAt: null,
      lastExitAt: null,
      crashStreak: 0,
      backoffUntil: 0,
    };
    sup.runtimes.set(key, rt);
  }
  return rt;
}

export interface SpawnOutcome {
  action: "spawned" | "already-running" | "starting" | "blocked" | "backoff";
  reason?: string;
}

/**
 * 自愈命令执行（Task 13-R3 加固）：
 * 旧实现 execSync 超时 90s 且失败即放弃——冷安装 Vue 前端依赖树常超 90s，
 * 导致发布/重置后自愈被误判失败、用户看到「自愈失败（bun install）」。
 * 现在：超时 240s × 最多 2 次，失败时截取 stderr/stderr 尾部进日志与 reason。
 */
const AUTOFIX_TIMEOUT_MS = 240_000;
const AUTOFIX_MAX_ATTEMPTS = 2;

function runAutoFix(def: ServiceDef): { ok: boolean; detail?: string } {
  if (!def.autoFixCmd) return { ok: false };
  // Task 13-R4：不再经 /bin/sh（发布窗口期曾出现 posix_spawn '/bin/sh' ENOENT），
  // 「bun xxx」直连 bun 二进制；其余命令保留 shell 兑底
  const parts = def.autoFixCmd.trim().split(/\s+/);
  const bunLike = parts[0] === "bun";
  const bunBin = ["/usr/local/bin/bun", "/home/z/.bun/bin/bun", "bun"].find(
    (p) => p === "bun" || fs.existsSync(p),
  );
  let lastDetail = "";
  for (let attempt = 1; attempt <= AUTOFIX_MAX_ATTEMPTS; attempt++) {
    console.log(
      `[supervisor] ${def.key} ${def.autoFixLabel ?? "自愈"} (第 ${attempt}/${AUTOFIX_MAX_ATTEMPTS} 次)...`,
    );
    try {
      if (bunLike && bunBin) {
        execFileSync(bunBin, parts.slice(1), {
          cwd: def.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: AUTOFIX_TIMEOUT_MS,
          env: { ...process.env },
          maxBuffer: 16 * 1024 * 1024,
        });
      } else {
        execSync(def.autoFixCmd, {
          cwd: def.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: AUTOFIX_TIMEOUT_MS,
          env: { ...process.env },
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
      }
      console.log(`[supervisor] ${def.key} 自愈成功`);
      return { ok: true };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      lastDetail = [err.stderr, err.stdout, err.message]
        .filter(Boolean)
        .join("\n")
        .trim()
        .slice(-600);
      console.warn(
        `[supervisor] ${def.key} 自愈第 ${attempt} 次失败: ${lastDetail.split("\n").slice(-3).join(" | ") || "未知错误"}`,
      );
    }
  }
  return { ok: false, detail: lastDetail.split("\n").slice(-2).join(" | ") };
}

/** 拉起服务进程（作为 Next.js 服务器子进程常驻） */
async function spawnService(def: ServiceDef): Promise<SpawnOutcome> {
  const sup = getSupervisor();
  if (sup.spawning.has(def.key)) return { action: "starting", reason: "上一次拉起仍在进行" };
  sup.spawning.add(def.key);
  try {
    // 端口已被占用（外部手动启动 / 上次子进程仍在）→ 视为已运行
    if (await checkPortOpen(def.port)) return { action: "already-running" };
    const rt = getRuntime(def.key);
    if (isPidAlive(rt.pid)) return { action: "starting", reason: "受管进程启动中" };
    if (def.prerequisite && !fs.existsSync(def.prerequisite)) {
      // 自愈：依赖缺失时自动安装（超时 240s × 2 次，失败时带错误详情）
      if (def.autoFixCmd) {
        const fix = runAutoFix(def);
        if (!fix.ok) {
          return {
            action: "blocked",
            reason: `自愈失败（${def.autoFixCmd}）${fix.detail ? `：${fix.detail}` : "，请检查网络/日志"}`,
          };
        }
        if (!fs.existsSync(def.prerequisite)) {
          return { action: "blocked", reason: `自愈后前置仍缺失: ${def.prerequisite}` };
        }
      } else {
        console.warn(`[supervisor] ${def.key} 前置文件缺失: ${def.prerequisite}`);
        return { action: "blocked", reason: `前置文件缺失: ${def.prerequisite}` };
      }
    }
    // 启动即崩退避：避免 node_modules 缺失等场景下 3ms 崩溃 × 无限重启刷爆日志（历史事故：restarts=490）
    const now = Date.now();
    if (now < rt.backoffUntil) {
      return {
        action: "backoff",
        reason: `启动即崩冷却中（${Math.ceil((rt.backoffUntil - now) / 1000)}s 后重试；曾连续崩溃 ${rt.crashStreak} 次）`,
      };
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
      // 存活 <10s 视为启动即崩：指数退避（5s→10s→…上限 120s）
      if (r.lastSpawnAt != null && r.lastExitAt - r.lastSpawnAt < 10_000) {
        r.crashStreak += 1;
        const delay = Math.min(5_000 * 2 ** Math.min(r.crashStreak - 1, 5), 120_000);
        r.backoffUntil = Date.now() + delay;
        console.warn(
          `[supervisor] ${def.key} 进程退出 code=${code}（启动即崩第 ${r.crashStreak} 次，${delay / 1000}s 后重试）`,
        );
      } else {
        r.crashStreak = 0;
        r.backoffUntil = 0;
        console.warn(`[supervisor] ${def.key} 进程退出 code=${code}`);
      }
    });
    rt.child = child;
    rt.pid = child.pid;
    rt.lastSpawnAt = Date.now();
    rt.restarts += 1;
    console.log(`[supervisor] ${def.key} 已启动 pid=${child.pid}`);
    return { action: "spawned" };
  } finally {
    sup.spawning.delete(def.key);
  }
}

/** 看门狗：巡检并自动拉起挂掉的服务 */
export function startWatchdog(): void {
  const sup = getSupervisor();
  if (sup.watchdog) return;
  sup.watchdog = setInterval(() => {
    for (const def of getServiceDefs()) {
      void (async () => {
        const portOpen = await checkPortOpen(def.port);
        const rt = getRuntime(def.key);
        if (portOpen) return; // 健康（无论是否本进程拉起）
        if (isPidAlive(rt.pid)) return; // 启动中，等待
        if (Date.now() < rt.backoffUntil) return; // 退避冷却
        await spawnService(def); // 已挂掉 → 重启
      })();
    }
  }, 20_000);
  console.log("[supervisor] 看门狗已启动 (20s 巡检)");
}

/** 确保所有服务都已拉起；返回状态 + 每个服务的拉起结果 */
export async function ensureAllServices(): Promise<{
  services: ServiceStatus[];
  actions: Record<string, SpawnOutcome>;
}> {
  startWatchdog();
  const actions: Record<string, SpawnOutcome> = {};
  for (const def of getServiceDefs()) {
    actions[def.key] = await spawnService(def);
  }
  return { services: await collectStatus(), actions };
}

export async function collectStatus(): Promise<ServiceStatus[]> {
  const result: ServiceStatus[] = [];
  for (const def of getServiceDefs()) {
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
