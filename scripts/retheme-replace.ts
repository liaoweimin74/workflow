/**
 * Task 16 UI 改造 — 靛蓝/藏青 → 青墨 (Verdant Ink) 机械替换脚本
 * 范围：已勘察的 9 个含硬编码颜色的文件（style.css 已手写重写，不在列）
 */
import fs from "node:fs";

const MAP: [string, string][] = [
  // —— 暗色模式 藏青(navy) → 石墨松绿(graphite) ——
  ["#12162b", "#111514"],
  ["#1b2040", "#181d1b"],
  ["#222750", "#1f2522"],
  ["#2a3054", "#2b332e"],
  ["#2a3158", "#28302b"],
  ["#323a63", "#333d37"],
  ["#3a4370", "#3b463f"],
  ["#232950", "#212926"],
  ["#303860", "#2e3832"],
  ["#161b36", "#151a18"],
  // —— 暗色主色 靛蓝亮紫 → 青玉 ——
  ["#7c7ff0", "#2dd4bf"],
  ["#999bf4", "#5ee0d0"],
  ["#b0b2f7", "#86e8db"],
  ["#c8c9fa", "#aef0e6"],
  ["#e0e1fc", "#dff8f3"],
  ["#6365c2", "#14b8a6"],
  ["#5ee7e8", "#5eead4"],
  // —— 亮色主色 靛蓝 → 翡翠青 ——
  ["#5755ee", "#0f766e"],
  ["#5452d3", "#0d9488"],
  ["#6361f0", "#118a80"],
  ["#8a8af4", "#3d9c92"],
  ["#abaaf6", "#7bbdb4"],
  ["#c6c5f7", "#aedbd4"],
  ["#d7d6f8", "#c8e7e2"],
  ["#e8e8f8", "#e4f3f0"],
  ["#4544be", "#0c6159"],
  ["#4342b5", "#0d5f58"],
  ["#35349a", "#11504a"],
  ["#2a2970", "#134e4a"],
  ["#e9eaff", "#d7f5ee"],
  ["#d6d6fd", "#b0e9de"],
  ["#b9b9f9", "#7fd8c9"],
  ["#f3f3fe", "#f0fdf9"],
  // —— 中性色 蓝紫倾向 → 暖纸灰 ——
  ["#e9edfa", "#e6e9e4"],
  ["#eef1fc", "#f0f2ee"],
  ["#eef0fc", "#eaf3ef"],
  ["#f1f4fe", "#f4f5f2"],
  ["#f4f6fe", "#f6f7f4"],
  ["#f8f9fe", "#f9faf7"],
  // —— rgba 变体 ——
  ["rgba(87, 85, 238", "rgba(15, 118, 110"],
  ["rgba(87,85,238", "rgba(15,118,110"],
  ["rgba(31, 36, 55", "rgba(28, 40, 35"],
  ["rgba(124,127,240", "rgba(45,212,191"],
];

const FILES = [
  "src/views/dashboard/DashboardPage.vue",
  "src/views/login/LoginPage.vue",
  "src/views/designer/components/NodePalette.vue",
  "src/views/designer/properties/PropertyPanel.vue",
  "src/views/designer/ProcessDesigner.vue",
  "src/views/designer/styles/designer-theme.css",
  "src/views/designer/utils/customRenderer.ts",
  "src/views/process/ProcessCenterPage.vue",
  "src/layouts/AdminLayout.vue",
];

const root = "/home/z/my-project/workflow_lowcode/frontend/";
let total = 0;
for (const rel of FILES) {
  const p = root + rel;
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for (const [from, to] of MAP) {
    const parts = s.split(from);
    if (parts.length > 1) {
      n += parts.length - 1;
      s = parts.join(to);
    }
  }
  if (n > 0) {
    fs.writeFileSync(p, s);
    console.log(`${rel}: ${n} 处替换`);
    total += n;
  }
}
console.log(`完成，共 ${total} 处`);
