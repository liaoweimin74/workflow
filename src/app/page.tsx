"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Boxes,
  Cpu,
  Database,
  GitBranch,
  Hammer,
  LayoutTemplate,
  Loader2,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Workflow,
} from "lucide-react";

interface ServiceStatus {
  key: "backend" | "frontend";
  name: string;
  port: number;
  portOpen: boolean;
  managedPid?: number | null;
  processAlive: boolean;
  restarts?: number;
  lastSpawnAt?: number | null;
  lastExitAt?: number | null;
  prerequisiteOk: boolean;
  state: "running" | "starting" | "stopped" | "blocked";
}

interface SpawnOutcome {
  action: "spawned" | "already-running" | "starting" | "blocked" | "backoff";
  reason?: string;
}

type EngineChoice = "node" | "java";

interface EngineStatus {
  engine: EngineChoice;
  nodeDbExists: boolean;
  /** 用户显式选择的持久化引擎（Task 15-R1）；null=从未显式切换过 */
  engineChoice?: EngineChoice | null;
  platform: {
    deployed: boolean;
    productionMode: boolean;
  };
  java: {
    jarExists: boolean;
    jdkReady: boolean;
    mavenReady: boolean;
    buildRunning: boolean;
    buildLogTail: string | null;
  };
}

interface ToastMsg {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

interface FeatureDef {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tags: string[];
}

const FEATURES: FeatureDef[] = [
  {
    icon: GitBranch,
    title: "流程设计器",
    desc: "BPMN 2.0 拖拽建模，网关 / 子流程 / 会签或签 / 超时处理，节点级后端逻辑编排",
    tags: ["bpmn-js", "排他·并行网关", "嵌入式子流程"],
  },
  {
    icon: LayoutTemplate,
    title: "表单设计器",
    desc: "30+ 组件拖拽构建，字段权限、事件脚本沙箱、子表 / 嵌套表单 / 数据引用",
    tags: ["form-create", "字段权限", "脚本沙箱"],
  },
  {
    icon: Workflow,
    title: "流程执行引擎",
    desc: "发起 / 审批 / 驳回 / 加签转签 / 催办，多租户隔离与流程版本管理",
    tags: ["Flowable 8", "加签转签", "多租户"],
  },
  {
    icon: Database,
    title: "数据源与视图",
    desc: "FORM / WORKFLOW / SQL 多态数据源，可视化视图设计、页面挂载与访问控制",
    tags: ["SQL 数据源", "页面渲染", "权限双重校验"],
  },
  {
    icon: Network,
    title: "通知与事件治理",
    desc: "流程事件驱动通知，重试索引优化、事件定义注册与统一租户类型",
    tags: ["事件总线", "消息中心"],
  },
  {
    icon: ShieldCheck,
    title: "系统管理",
    desc: "用户 / 角色 / 菜单 / 组织机构 / 字典，细粒度权限点控制",
    tags: ["RBAC", "菜单挂载", "组织机构"],
  },
];

function StateDot({ state }: { state: ServiceStatus["state"] }) {
  const cls =
    state === "running"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
      : state === "starting"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse"
        : state === "blocked"
          ? "bg-rose-500"
          : "bg-zinc-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

const STATE_TEXT: Record<ServiceStatus["state"], string> = {
  running: "运行中",
  starting: "启动中",
  stopped: "已停止",
  blocked: "未就绪",
};

const FALLBACK_SERVICES: ServiceStatus[] = [
  { key: "backend", name: "平台后端 (:8080)", port: 8080, state: "stopped", portOpen: false, processAlive: false, prerequisiteOk: true },
  { key: "frontend", name: "Vue 前端 (Vite dev server)", port: 5173, state: "stopped", portOpen: false, processAlive: false, prerequisiteOk: true },
];

/** 拉起结果 → 用户可读摘要 */
function summarizeActions(
  actions: Record<string, SpawnOutcome>,
  services: ServiceStatus[],
): { kind: ToastMsg["kind"]; text: string } {
  const nameOf: Record<string, string> = { backend: "后端", frontend: "前端" };
  const parts: string[] = [];
  let kind: ToastMsg["kind"] = "success";
  for (const [key, a] of Object.entries(actions)) {
    const label = nameOf[key] ?? key;
    switch (a.action) {
      case "spawned":
        parts.push(`${label}已拉起，启动中…`);
        kind = "info";
        break;
      case "already-running":
        parts.push(`${label}运行正常`);
        break;
      case "starting":
        parts.push(`${label}启动中…`);
        kind = "info";
        break;
      case "backoff":
        parts.push(`${label}崩溃冷却中：${a.reason ?? ""}`);
        kind = "error";
        break;
      case "blocked":
        parts.push(`${label}未就绪：${a.reason ?? "前置条件缺失"}`);
        kind = "error";
        break;
    }
  }
  if (parts.length === 0) return { kind: "info", text: "检查完成" };
  return { kind, text: parts.join("；") };
}

export default function PortalPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [switching, setSwitching] = useState<EngineChoice | null>(null);
  const [building, setBuilding] = useState(false);
  const [booting, setBooting] = useState(true);
  const [ensuring, setEnsuring] = useState(false);
  const ensuringRef = useRef(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastSeq = useRef(0);
  const ensured = useRef(false);

  const pushToast = useCallback((kind: ToastMsg["kind"], text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/services", { cache: "no-store" });
      const json = await res.json();
      if (json?.data) setServices(json.data);
    } catch {
      /* 忽略瞬时错误 */
    }
  }, []);

  const fetchEngineStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/engine", { cache: "no-store" });
      const json = await res.json();
      if (json?.data) setEngineStatus(json.data);
    } catch {
      /* 忽略瞬时错误 */
    }
  }, []);

  /** 切换后端引擎（Node.js 版 / Java 版）：杀 8080 旧进程并按新引擎拉起 */
  const switchEngine = useCallback(
    async (target: EngineChoice) => {
      if (switching) return;
      setSwitching(target);
      try {
        const res = await fetch("/api/portal/engine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "switch", engine: target }),
        });
        const json = await res.json();
        pushToast(json?.code === 200 ? "success" : "error", json?.msg ?? "切换失败");
        if (json?.data?.services) setServices(json.data.services);
        if (json?.data?.engine) setEngineStatus(json.data.engine);
        else void fetchEngineStatus();
      } catch {
        pushToast("error", "切换请求失败，请稍后重试");
      } finally {
        setSwitching(null);
      }
    },
    [switching, pushToast, fetchEngineStatus],
  );

  /** 一键后台构建 Java 版（JDK + Maven + jar） */
  const buildJava = useCallback(async () => {
    if (building) return;
    setBuilding(true);
    try {
      const res = await fetch("/api/portal/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build-java" }),
      });
      const json = await res.json();
      pushToast(json?.code === 200 ? "info" : "error", json?.msg ?? "构建启动失败");
      if (json?.data) setEngineStatus(json.data);
    } catch {
      pushToast("error", "构建请求失败，请稍后重试");
    } finally {
      setBuilding(false);
    }
  }, [building, pushToast]);

  /** 点击「检查 / 拉起服务」：带 loading + 结果通知。
   *  ⚠️ POST 必须携带 body：无 body 的 fetch POST 不发 Content-Length，
   *  Next dev 的 body 解析在 keep-alive 连接上会永久挂起（本次故障根因）。 */
  const ensureServices = useCallback(async () => {
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    setEnsuring(true);
    try {
      const res = await fetch("/api/portal/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      const json = await res.json();
      const data = json?.data as
        | { services?: ServiceStatus[]; actions?: Record<string, SpawnOutcome> }
        | undefined;
      if (data?.services) setServices(data.services);
      if (data?.actions) {
        const s = summarizeActions(data.actions, data.services ?? []);
        pushToast(s.kind, s.text);
      } else {
        pushToast("info", "检查完成");
      }
    } catch {
      pushToast("error", "检查请求失败，请稍后重试");
    } finally {
      ensuringRef.current = false;
      setEnsuring(false);
    }
  }, [pushToast]);

  useEffect(() => {
    const boot = async () => {
      if (!ensured.current) {
        ensured.current = true;
        try {
          const res = await fetch("/api/portal/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "boot" }),
          });
          const json = await res.json();
          const data = json?.data as { services?: ServiceStatus[] } | undefined;
          if (data?.services) setServices(data.services);
          else void fetchStatus();
        } catch {
          void fetchStatus();
        }
      }
      setBooting(false);
    };
    void boot();
    const timer = setInterval(() => {
      void fetchStatus();
      void fetchEngineStatus();
    }, 5000);
    void fetchStatus();
    void fetchEngineStatus();
    return () => clearInterval(timer);
  }, [fetchStatus, fetchEngineStatus]);

  const backend = services.find((s) => s.key === "backend");
  const frontend = services.find((s) => s.key === "frontend");
  const platformReady = Boolean(frontend?.portOpen);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0d1a] text-zinc-100 selection:bg-[#22c9d6]/30">
      {/* 顶部导航 */}
      <header className="border-b border-white/5 bg-[#0b0d1a]/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#22c9d6] shadow-lg shadow-[#0f766e]/25">
              <Workflow className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">工作流低代码平台</p>
              <p className="text-[11px] text-zinc-400">Flowable 8 · 低代码一体化方案</p>
            </div>
          </div>
          <div className="hidden items-center gap-4 sm:flex">
            <span className="text-xs text-zinc-400">
              后端 {backend ? STATE_TEXT[backend.state] : "—"}
            </span>
            <span className="text-xs text-zinc-400">
              前端 {frontend ? STATE_TEXT[frontend.state] : "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_0%,rgba(87,85,238,0.22),transparent),radial-gradient(50%_45%_at_85%_10%,rgba(70,201,214,0.16),transparent)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-3xl"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                <Activity className="h-3.5 w-3.5 text-[#22c9d6]" />
                Java 21 · Spring Boot 4 · Flowable 8 · Vue 3.5 · Element Plus
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                流程、表单、视图
                <span className="bg-gradient-to-r from-[#2dd4bf] via-[#0f766e] to-[#22c9d6] bg-clip-text text-transparent">
                  一站式低代码建模
                </span>
              </h1>
              <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">
                基于 Flowable 8 的工作流低代码平台已就绪：BPMN 流程设计器、拖拽表单设计器、
                数据源与列表视图双轨设计、完整的流程执行引擎与通知中心，开箱即用。
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="/lowcode/"
                  aria-disabled={!platformReady}
                  onClick={(e) => {
                    if (!platformReady) e.preventDefault();
                  }}
                  className={`group inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] to-[#22c9d6] px-6 text-sm font-semibold text-white shadow-lg shadow-[#0f766e]/30 transition hover:brightness-110 active:scale-[0.98] ${
                    platformReady ? "" : "pointer-events-none opacity-60"
                  }`}
                >
                  {booting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Boxes className="h-4 w-4" />
                  )}
                  进入平台控制台
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <button
                  onClick={() => void ensureServices()}
                  disabled={ensuring}
                  aria-busy={ensuring}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ensuring ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {ensuring ? "正在检查…" : "检查 / 拉起服务"}
                </button>
              </div>
            </motion.div>

            {/* 发布版环境提示（Task 13-R5）：发布部署不含平台子项目，子服务无法拉起 */}
            {engineStatus && !engineStatus.platform.deployed && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:p-5"
                role="alert"
              >
                <p className="text-sm font-medium text-amber-200">当前访问的是「发布版」部署，仅包含门户展示页</p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-200/70">
                  发布快照不包含平台前后端子项目（workflow_lowcode），因此无法在发布环境内拉起 :8080 / :5173 服务 —— 这是环境限制而非故障。
                  请在开发沙箱的预览面板中访问完整平台（流程设计器 / 发起审批 / 看板均可正常使用）。
                </p>
              </motion.div>
            )}

            {/* 服务状态卡 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-10 grid gap-4 sm:grid-cols-2"
            >
              {(services.length > 0
                ? services
                : FALLBACK_SERVICES
              ).map((s) => (
                <div
                  key={s.key}
                  className="rounded-2xl border border-white/8 bg-white/[0.04] p-5 backdrop-blur transition hover:border-white/15"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <StateDot state={s.state} />
                      <p className="text-sm font-medium text-zinc-100">{s.name}</p>
                    </div>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                      :{s.port}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      状态：
                      <span
                        className={
                          s.state === "running"
                            ? "text-emerald-400"
                            : s.state === "starting"
                              ? "text-amber-400"
                              : s.state === "blocked"
                                ? "text-rose-400"
                                : "text-zinc-400"
                        }
                      >
                        {STATE_TEXT[s.state]}
                      </span>
                      {s.state === "blocked" && (
                        <span className="ml-1.5 text-zinc-600">（点击上方按钮自动修复依赖）</span>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Server className="h-3 w-3" />
                      {s.processAlive ? `PID ${s.managedPid ?? "-"}` : "无进程"}
                    </span>
                  </div>
                  {typeof s.restarts === "number" && s.restarts > 0 && (
                    <div className="mt-2 text-[11px] text-zinc-600">
                      累计拉起 {s.restarts} 次
                      {s.lastExitAt ? ` · 最近退出 ${new Date(s.lastExitAt).toLocaleTimeString("zh-CN")}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>

            {/* 后端引擎切换卡（Task 13-R4：Node.js 版 / Java 版双引擎可选） */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-5 backdrop-blur"
              aria-label="后端引擎切换"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e]/20 to-[#22c9d6]/15 text-[#2dd4bf]">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">后端引擎</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    切换会自动重启 :8080 后端进程；两版数据源独立（Node 版 = 迁移后 SQLite 主库，Java 版 = 原始 H2 存储）
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600" aria-label="引擎持久化选择状态">
                    {engineStatus?.engineChoice
                      ? `已记住你的选择：${engineStatus.engineChoice === "node" ? "Node.js" : "Java"} 版（沙箱发布/重置后自动保持，不再被误切换）`
                      : "尚未显式选择过引擎：当前跟随主引擎信号（SQLite 主库存在 → Node）"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {/* Node.js 版 */}
                <button
                  type="button"
                  onClick={() => void switchEngine("node")}
                  disabled={switching !== null || engineStatus?.engine === "node"}
                  aria-pressed={engineStatus?.engine === "node"}
                  className={`rounded-xl border p-4 text-left transition ${
                    engineStatus?.engine === "node"
                      ? "border-[#0f766e]/60 bg-[#0f766e]/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  } ${switching ? "cursor-wait opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full border ${
                          engineStatus?.engine === "node"
                            ? "border-[#2dd4bf] bg-[#2dd4bf] shadow-[0_0_6px_rgba(138,138,244,0.9)]"
                            : "border-zinc-500 bg-transparent"
                        }`}
                      />
                      Node.js 版
                    </span>
                    {engineStatus?.engine === "node" && (
                      <span className="rounded-md bg-[#0f766e]/25 px-2 py-0.5 text-[11px] text-[#b9b9f7]">当前使用</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    bun + Express + SQLite · 自研受控 DSL 引擎（现行），发起 / 审批 / 看板数据完整
                  </p>
                  {switching === "node" && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#9be3ea]">
                      <Loader2 className="h-3 w-3 animate-spin" /> 正在切换，后端启动中…
                    </p>
                  )}
                </button>

                {/* Java 版 */}
                <button
                  type="button"
                  onClick={() => void switchEngine("java")}
                  disabled={switching !== null || engineStatus?.engine === "java"}
                  aria-pressed={engineStatus?.engine === "java"}
                  className={`rounded-xl border p-4 text-left transition ${
                    engineStatus?.engine === "java"
                      ? "border-[#22c9d6]/60 bg-[#22c9d6]/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  } ${switching ? "cursor-wait opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full border ${
                          engineStatus?.engine === "java"
                            ? "border-[#22c9d6] bg-[#22c9d6] shadow-[0_0_6px_rgba(70,201,214,0.9)]"
                            : "border-zinc-500 bg-transparent"
                        }`}
                      />
                      Java 版
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] ${
                        engineStatus?.engine === "java"
                          ? "bg-[#22c9d6]/25 text-[#9be3ea]"
                          : engineStatus?.java.jarExists
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-amber-400/15 text-amber-300"
                      }`}
                    >
                      {engineStatus?.engine === "java"
                        ? "当前使用"
                        : engineStatus?.java.jarExists
                          ? "jar 就绪 · 可切换"
                          : "需先构建 jar"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    Spring Boot 4 + Flowable 8 · 原版实现，使用迁移前的历史数据视图
                  </p>
                  {switching === "java" && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#9be3ea]">
                      <Loader2 className="h-3 w-3 animate-spin" /> 正在切换，Java 启动较慢…
                    </p>
                  )}
                </button>
              </div>

              {/* Java 构建区：jar 缺失时展示一键构建 + 日志尾部 */}
              {engineStatus && !engineStatus.java.jarExists && (
                <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-400">
                      {engineStatus.java.buildRunning
                        ? "Java 版构建进行中：JDK 21 → Maven → jar 打包（约 10~20 分钟），完成后即可切换"
                        : "Java 版构建产物已被沙箱重置清除；点击一键构建恢复（后台进行，不影响当前 Node 服务）"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void buildJava()}
                      disabled={building || engineStatus.java.buildRunning}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-zinc-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {building || engineStatus.java.buildRunning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Hammer className="h-3.5 w-3.5" />
                      )}
                      {building || engineStatus.java.buildRunning ? "构建中…" : "一键构建 Java 版"}
                    </button>
                  </div>
                  {engineStatus.java.buildLogTail && (
                    <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-500 [scrollbar-width:thin]">
                      {engineStatus.java.buildLogTail}
                    </pre>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </section>

        {/* 能力矩阵 */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-label="平台能力">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold">核心能力</h2>
              <p className="mt-1 text-sm text-zinc-500">源自项目 PRD 与功能清单的六大能力域</p>
            </div>
            <span className="hidden text-xs text-zinc-600 sm:block">docs/PRD.md · docs/features.md</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.article
                key={f.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                className="group rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-[#0f766e]/40 hover:bg-white/[0.05]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e]/20 to-[#22c9d6]/15 text-[#2dd4bf] transition group-hover:text-[#22c9d6]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        {/* 访问指引 */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="rounded-2xl border border-white/8 bg-gradient-to-r from-[#0f766e]/10 to-[#22c9d6]/5 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">访问与联调</h2>
            <div className="mt-4 grid gap-4 text-sm text-zinc-300 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">平台入口</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#2dd4bf]">/lowcode/</code>{" "}
                  经网关代理直达 Vue 控制台
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">测试账号</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#22c9d6]">admin / admin123</code>{" "}
                  内置超级管理员
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">REST API</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#2dd4bf]">/api/v1/*</code>{" "}
                  代理至 Spring Boot 后端
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 通知栈（右上角） */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(92vw,26rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              t.kind === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : t.kind === "error"
                  ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                  : "border-[#22c9d6]/30 bg-[#22c9d6]/10 text-[#9be3ea]"
            }`}
            role="status"
          >
            {t.text}
          </motion.div>
        ))}
      </div>

      {/* 粘性页脚 */}
      <footer className="mt-auto border-t border-white/5 bg-[#0b0d1a]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6">
          <p>工作流低代码平台 · Flowable 8 + Spring Boot 4 + Vue 3 · 沙箱网关单端口代理架构</p>
          <p className="font-mono">backend :8080 · frontend :5173 · portal :3000</p>
        </div>
      </footer>
    </div>
  );
}
