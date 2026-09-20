/**
 * 引擎决策链回归测试（Task 13-R3）
 * 场景：沙箱发布/重置后双 marker 全灭，验证决策链经 SQLite 持久信号
 * 自动回落 Node 引擎并重建 marker，而不是卡死在 Java blocked。
 *
 * 用法：bun scripts/test-engine-decision.ts
 * 可重复执行（幂等）：marker 被删除后运行本脚本即触发自愈重建。
 */
import {
  getServiceDefs,
  nodeEngineEnabled,
} from "../src/lib/service-supervisor.ts";

console.log("nodeEngineEnabled() =", nodeEngineEnabled());
const defs = getServiceDefs();
for (const d of defs) {
  console.log("→ " + d.key + ": " + d.name + " (:" + d.port + ") 自愈=" + (d.autoFixCmd ?? "无"));
}
if (!nodeEngineEnabled()) {
  console.error("FAIL: 决策链未回落到 Node 引擎");
  process.exit(1);
}
const backend = defs.find((d) => d.key === "backend");
if (!backend || !backend.name.includes("Node")) {
  console.error("FAIL: backend 定义不是 Node 分支: " + (backend?.name ?? "未找到"));
  process.exit(1);
}
console.log("PASS: 重置后决策链自动回落 Node 引擎");
