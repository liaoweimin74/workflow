"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Boxes,
  Database,
  GitBranch,
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
  processAlive: boolean;
  prerequisiteOk: boolean;
  state: "running" | "starting" | "stopped" | "blocked";
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
  blocked: "未构建",
};

export default function PortalPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [booting, setBooting] = useState(true);
  const ensured = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/services", { cache: "no-store" });
      const json = await res.json();
      if (json?.data) setServices(json.data);
    } catch {
      /* 忽略瞬时错误 */
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      if (!ensured.current) {
        ensured.current = true;
        try {
          const res = await fetch("/api/portal/services", { method: "POST" });
          const json = await res.json();
          if (json?.data) setServices(json.data);
        } catch {
          /* ignore */
        }
      }
      setBooting(false);
    };
    void boot();
    const timer = setInterval(fetchStatus, 5000);
    void fetchStatus();
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const backend = services.find((s) => s.key === "backend");
  const frontend = services.find((s) => s.key === "frontend");
  const platformReady = Boolean(frontend?.portOpen);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0d1a] text-zinc-100 selection:bg-[#46c9d6]/30">
      {/* 顶部导航 */}
      <header className="border-b border-white/5 bg-[#0b0d1a]/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#5755ee] to-[#46c9d6] shadow-lg shadow-[#5755ee]/25">
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
                <Activity className="h-3.5 w-3.5 text-[#46c9d6]" />
                Java 21 · Spring Boot 4 · Flowable 8 · Vue 3.5 · Element Plus
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                流程、表单、视图
                <span className="bg-gradient-to-r from-[#8a8af4] via-[#5755ee] to-[#46c9d6] bg-clip-text text-transparent">
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
                  className={`group inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#5755ee] to-[#46c9d6] px-6 text-sm font-semibold text-white shadow-lg shadow-[#5755ee]/30 transition hover:brightness-110 active:scale-[0.98] ${
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
                  onClick={() => void fetch("/api/portal/services", { method: "POST" }).then(fetchStatus)}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4" />
                  检查 / 拉起服务
                </button>
              </div>
            </motion.div>

            {/* 服务状态卡 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-10 grid gap-4 sm:grid-cols-2"
            >
              {(services.length > 0
                ? services
                : [
                    { key: "backend", name: "Java 后端 (Spring Boot + Flowable 8)", port: 8080, state: "stopped", portOpen: false, processAlive: false, prerequisiteOk: true },
                    { key: "frontend", name: "Vue 前端 (Vite dev server)", port: 5173, state: "stopped", portOpen: false, processAlive: false, prerequisiteOk: true },
                  ] as ServiceStatus[]
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
                              : "text-zinc-400"
                        }
                      >
                        {STATE_TEXT[s.state]}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Server className="h-3 w-3" />
                      {s.processAlive ? `PID ${s.managedPid ?? "-"}` : "无进程"}
                    </span>
                  </div>
                </div>
              ))}
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
                className="group rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-[#5755ee]/40 hover:bg-white/[0.05]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5755ee]/20 to-[#46c9d6]/15 text-[#8a8af4] transition group-hover:text-[#46c9d6]">
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
          <div className="rounded-2xl border border-white/8 bg-gradient-to-r from-[#5755ee]/10 to-[#46c9d6]/5 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">访问与联调</h2>
            <div className="mt-4 grid gap-4 text-sm text-zinc-300 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">平台入口</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#8a8af4]">/lowcode/</code>{" "}
                  经网关代理直达 Vue 控制台
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">测试账号</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#46c9d6]">admin / admin123</code>{" "}
                  内置超级管理员
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-zinc-100">REST API</p>
                <p className="mt-1.5 text-zinc-400">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#8a8af4]">/api/v1/*</code>{" "}
                  代理至 Spring Boot 后端
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

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
