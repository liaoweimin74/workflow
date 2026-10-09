/**
 * 节点类型元数据：调色板分组、图标字母、类型色 CSS 变量名。
 * 全部颜色走 CSS 变量（logicflow-theme.css 定义，EP 变量派生，明暗自适应）。
 */
import type { LogicNodeType } from './dsl'

export interface PaletteNode {
  type: LogicNodeType
  label: string
  description: string
  /** 图标色块中显示的单字/符号 */
  badge: string
  /** logicflow-theme.css 中的类型色变量名（如 --lf-http） */
  colorVar: string
}

export interface PaletteGroup {
  title: string
  items: PaletteNode[]
}

/** 类型色 CSS 变量名（值定义在 styles/logicflow-theme.css） */
export const NODE_COLOR_VAR: Record<LogicNodeType, string> = {
  HTTP: '--lf-http',
  BEAN: '--lf-bean',
  SCRIPT: '--lf-script',
  CONDITION: '--lf-condition',
  BATCH: '--lf-batch',
  SUBFLOW: '--lf-subflow',
  DATA_UPDATE: '--lf-data',
  SQL_SCRIPT: '--lf-data',
  START: '--lf-neutral',
  END: '--lf-neutral',
}

const NODE_META: Record<LogicNodeType, { label: string; description: string; badge: string }> = {
  START: { label: '开始', description: '流程起点，从这里开始编排', badge: '始' },
  END: { label: '结束', description: '流程终点，运行到此终止', badge: '终' },
  HTTP: { label: 'HTTP 调用', description: '调用外部 HTTP 接口，支持超时/重试', badge: 'H' },
  BEAN: { label: 'Bean 方法', description: '调用系统内已注册的服务方法', badge: 'B' },
  SCRIPT: { label: 'Groovy 脚本', description: '执行服务端 Groovy 脚本（注意安全）', badge: 'S' },
  CONDITION: { label: '条件', description: '按变量条件走「真/假」分支', badge: '条' },
  BATCH: { label: '批处理', description: '遍历集合并按循环体链逐项执行（把动作节点拖到循环虚线上组成循环体），聚合结果列表', badge: '批' },
  SUBFLOW: { label: '子流程', description: '调用另一条已发布的逻辑流，输出写回变量', badge: '子' },
  DATA_UPDATE: { label: '数据更新', description: '纯配置更新动态表（SET/ADD/SUB + 条件），单表/多表统一配置，多表单事务执行', badge: '数' },
  SQL_SCRIPT: { label: 'SQL 批处理', description: '多条 SQL 按 ; 顺序执行（{{var}} 参数绑定防注入），可选单事务回滚，输出执行汇总', badge: 'Q' },
}

export function nodeMeta(type: LogicNodeType): PaletteNode {
  const meta = NODE_META[type]
  return { type, ...meta, colorVar: NODE_COLOR_VAR[type] }
}

/** 调色板分组：控制（开始/结束/条件）+ 动作（HTTP/Bean/脚本/批处理/子流程/数据更新） */
export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: '控制',
    items: [nodeMeta('START'), nodeMeta('END'), nodeMeta('CONDITION')],
  },
  {
    title: '动作',
    items: [
      nodeMeta('HTTP'),
      nodeMeta('BEAN'),
      nodeMeta('SCRIPT'),
      nodeMeta('BATCH'),
      nodeMeta('SUBFLOW'),
      nodeMeta('DATA_UPDATE'),
      nodeMeta('SQL_SCRIPT'),
    ],
  },
]

/** 类型展示名（画布节点/属性面板 tag 用） */
export function nodeTypeLabel(type: string): string {
  return NODE_META[type as LogicNodeType]?.label ?? type
}
