/**
 * 引擎决策链回归测试（Task 13-R3 建，Task 15-R1 扩展）
 *
 * 场景覆盖：
 *   A. 沙箱发布/重置后双 marker 全灭 + 显式选择 node → 决策 Node 并重建 marker
 *   B. 【14-R1 劫持修复核心】marker 全灭 + jar 存在 + db 存在 + 无显式选择
 *      → 必须 Node（旧行为会误走 Java，被 bootstrap 重建的 jar 劫持）
 *   C. 显式选择 java 且 jar 存在 → 尊重 Java（切换流程不被 db 信号劫持回 Node）
 *   D. 恢复现场：choice=node → Node + marker 重建（当前系统预期状态）
 *
 * 用法：bun scripts/test-engine-decision.ts
 * 可重复执行（幂等）：操作对象仅为 marker / engine-choice 文件，结束后恢复 Node 态。
 */
import {
  currentEngine,
  ENGINE_CHOICE_FILE,
  getServiceDefs,
  nodeEngineEnabled,
} from "../src/lib/service-supervisor.ts";
import fs from "node:fs";

const MARKERS = [
  "/home/z/my-project/workflow_lowcode/backend-node/.engine-node",
  "/home/z/tools/backend-engine-node",
];

function clearMarkers(): void {
  for (const m of MARKERS) {
    try {
      fs.rmSync(m, { force: true });
    } catch {
      /* 忽略 */
    }
  }
}

function setChoice(v: "node" | "java" | null): void {
  try {
    if (v === null) fs.rmSync(ENGINE_CHOICE_FILE, { force: true });
    else fs.writeFileSync(ENGINE_CHOICE_FILE, v);
  } catch {
    /* 忽略 */
  }
}

function checkBackendIsNode(label: string, expectNode: boolean): boolean {
  const enabled = nodeEngineEnabled();
  const backend = getServiceDefs().find((d) => d.key === "backend");
  const isNode = !!backend && backend.name.includes("Node");
  const ok = enabled === expectNode && isNode === expectNode;
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${label} → engine=${currentEngine()}（期望 ${
      expectNode ? "node" : "java"
    }）`,
  );
  return ok;
}

let allOk = true;

// ---- A. 显式选择 node + marker 全灭 ----
clearMarkers();
setChoice("node");
allOk = checkBackendIsNode("A: choice=node + marker 全灭 → Node 自愈", true) && allOk;

// ---- B.【核心】14-R1 劫持场景：无显式选择 + jar 存在 + db 存在 ----
clearMarkers();
setChoice(null);
allOk = checkBackendIsNode("B: marker 全灭 + jar 存在 + db 存在 → Node（劫持修复）", true) && allOk;

// ---- C. 显式选择 java + jar 存在 → 尊重 Java ----
const jarPath =
  "/home/z/my-project/workflow_lowcode/backend/target/workflow-platform-1.0.0-SNAPSHOT.jar";
if (fs.existsSync(jarPath)) {
  clearMarkers();
  setChoice("java");
  const enabled = nodeEngineEnabled();
  const backend = getServiceDefs().find((d) => d.key === "backend");
  const ok = !enabled && !!backend && backend.name.includes("Java");
  console.log(
    `${ok ? "PASS" : "FAIL"}: C: choice=java + jar 存在 → Java（显式意图被尊重）→ engine=${currentEngine()}`,
  );
  allOk = ok && allOk;
} else {
  console.log("SKIP: C 场景（jar 不存在，跳过显式 Java 验证）");
}

// ---- D. 恢复现场：Node 态（当前系统预期） ----
setChoice("node");
allOk = checkBackendIsNode("D: 恢复 choice=node → Node", true) && allOk;

if (!allOk) {
  console.error("FAIL: 决策链回归存在失败项");
  process.exit(1);
}
console.log("ALL PASS: 决策链 v3 全场景通过");
