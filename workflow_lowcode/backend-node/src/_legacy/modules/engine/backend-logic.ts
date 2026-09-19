/**
 * 后置逻辑 Bean 注册表——BackendLogicBeanController 移植（Task 13-6）
 * mount 前缀：/api/v1/backend-logic（1 端点：GET /beans）
 * 静态 registry：http / script(groovy→js) 两类内置示例，对齐 BackendLogicBeanController 输出形态。
 */
/* mount: /api/v1/backend-logic */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";

const router = Router();

interface BackendBean {
  beanName: string; beanClass: string; description: string;
  methods: Array<{ methodName: string; paramCount: number; description: string }>;
}

/** 内置后置逻辑白名单（对齐 @BackendLogicBean 构造期扫描的产物形态） */
const BEANS: BackendBean[] = [
  {
    beanName: "httpExecutor",
    beanClass: "builtin:http",
    description: "HTTP 调用后置逻辑：URL/参数支持 {{var}} 占位，retryCount 重试",
    methods: [{ methodName: "invoke", paramCount: 1, description: "执行 http 项（BackendLogicItem.http 配置驱动）" }],
  },
  {
    beanName: "scriptExecutor",
    beanClass: "builtin:script",
    description: "脚本后置逻辑（内置示例；groovy→js 转译执行，TODO 见 worklog）",
    methods: [{ methodName: "eval", paramCount: 1, description: "以流程变量为绑定执行脚本并返回结果" }],
  },
];

/** GET /beans：可用后置逻辑 bean 列表 */
router.get("/beans", (_req: Request, res: Response) => {
  ok(res, BEANS);
});

export default router;
