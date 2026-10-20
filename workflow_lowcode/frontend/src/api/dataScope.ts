/**
 * 数据范围（DataScope）的共享类型。
 *
 * 语义提醒：配置是**收紧**而非开关——某数据源没有命中任何权限对象时行为与从前相同
 * （全租户可见）；多个对象命中时取并集（对象间 OR、对象内 AND）；读写分轴；管理员豁免。
 * 授权（角色 × 权限对象 × 读写轴）唯一入口是「角色管理 → 数据权限」，
 * 条件与关联的唯一入口是「数据权限 → 权限对象」，两端都没有面向数据源的接口。
 */

/** 约束的动作：READ 读（列表/聚合/单条）/ WRITE 写（修改/删除） */
export type DataScopeAction = 'READ' | 'WRITE'

/** 授权主体类型：当前只有角色 */
export type DataScopeSubject = 'ROLE'

/** 权限对象里的单个条件（组内 AND） */
export interface DataScopeCondition {
  column: string
  op: string
  value?: unknown
}
