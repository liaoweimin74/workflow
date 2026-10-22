/**
 * P2 基线（阶段 1 固化，阶段 2/3/4 更新），后续阶段 Gate 的对照表。
 *
 * tsc 与全量 vitest 不在单测里跑：改动后按这里的数字人工复核。
 *  - `npx vue-tsc --noEmit`：67 条错误（均为存量，codegen 目录零错误）
 *  - `npx vitest run`（阶段 5.11 出码按钮后）：2 个失败文件 / 7 条失败（均为存量）
 *    207 个文件里 204 通过；2572 条里 2565 通过。阶段 3 新增 2 个包边界/构建冒烟文件、
 *    阶段 4 新增 1 个动作链文件、阶段 5 新增 1 个报告文件 + 4 个验证台文件 + 2 个出码按钮文件，
 *    passed/total 随之增加
 *      src/layouts/__tests__/AdminLayout.page-fullscreen.test.ts（2 条）
 *      src/views/system/member-group/__tests__/MemberGroupPage.test.ts（5 条）
 *    偶发会多 1 条（第三个文件，负载/时序抖动，2026-10-22 那次是 DataSourceListPage）：单跑即绿，复跑回 7 条
 *  - codegen 目录（阶段 5.11 出码按钮后）：33 个文件 / 267 条全绿
 *  - `npx playwright test`：4 个文件 / 17 条全绿（登录脚手架 1 + 双渲染 11 + 出码验证台 4 + 设计器出码 1）；
 *    需要浏览器，未接 CI，人工步骤见 openspec/changes/page-codegen-p2/tasks.md 的 5.7
 *  - 语料体检（阶段 2 fcTable 后，阶段 4 复核未变；阶段 5.2 起数字来自 generatePage 的报告）：
 *    98 节点，95 有契约，94 可出码（95.9%），
 *    A=8 / B=0 / C=0；动作链与脚本只吃合成样本，语料 12 页产物字节不变（golden 守）
 *      剩余不可出码：数据容器 childRules 3（数据不是模板）、material 1（首版不支持）
 *
 * Gate 只认「不降」：可出码数、A/B/C 桶都不得比本表差；C 恒为 0。
 */
export const BASELINE = {
  tscErrors: 67,
  vitest: {
    failedFiles: 2,
    failedTests: 7,
    passedFiles: 204,
    totalFiles: 207,
    failures: [
      'src/layouts/__tests__/AdminLayout.page-fullscreen.test.ts（2 条）',
      'src/views/system/member-group/__tests__/MemberGroupPage.test.ts（5 条）',
    ],
    codegenFiles: 33,
    codegenTests: 267,
  },
  corpus: {
    totalNodes: 98,
    registeredNodes: 95,
    emittableNodes: 94,
    nodeRate: 94 / 98,
    bucketA: 8,
    bucketB: 0,
    bucketC: 0,
  },
} as const
