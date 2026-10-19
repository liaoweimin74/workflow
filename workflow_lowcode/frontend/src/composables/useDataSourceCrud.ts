import { ref, computed, type Ref } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { withArrayLabels } from '@/views/form/arrayValueLabel'
import type { ColumnConfigItem } from '@/api/bizData'
import type { FormConfig, DataSourceBindingContext } from '@/components/business/types'
import { walkRules, type RuleLike } from '@/views/form/formRuleWalk'

/**
 * 数据源 CRUD 共享逻辑：元数据（列定义/writable/formKey）加载 + CRUD 弹窗表单配置组装。
 *
 * 供 PageDataTable（页面数据表格）与 DataSourceDataPage（数据源数据管理页）复用。
 * 行为契约：
 * - loadMetadata()：拉取 metadata → 写入 writable/formKey/metaColumns → void loadFormSchema()
 * - formConfig：writable=false 时返回 undefined（纯列表/只读）；否则组装 create/update/delete/get Api
 *   （dataSourceApi + withArrayLabels）与 rule（formSchemaRule 优先、buildFormRule 回退）
 */

export interface MetaColumn {
  key: string
  label: string
  columnType?: string
  componentType?: string
  required?: boolean
  scale?: number
  sortable?: boolean
}

export interface UseDataSourceCrudOptions {
  dialogWidth?: Ref<string> | string
  dialogHeight?: Ref<string | undefined> | undefined
}

function inputTypeOf(columnType?: string): string {
  if (columnType === 'INT' || columnType === 'INTEGER' || columnType === 'BIGINT' || columnType === 'TINYINT' || columnType === 'DECIMAL') return 'inputNumber'
  if (columnType === 'DATETIME' || columnType === 'DATE') return 'datePicker'
  return 'input'
}

/** 解析字段将生成的组件 type（与 buildFieldRule 同源：componentType 优先，按 columnType 推断兜底），供配置界面展示 */
export function resolveFieldComponentType(
  col: Pick<DataSourceColumnLike, 'columnType'> & { componentType?: string | null },
): string {
  const ct = (col.componentType || '').trim()
  if (ct) return ct.endsWith('Text') ? 'input' : ct
  return inputTypeOf(col.columnType)
}

/** 数据源列定义（元数据/字段清单）的通用结构，递归支持子表列 */
export interface DataSourceColumnLike {
  key: string
  label?: string
  columnType?: string
  componentType?: string
  componentProps?: string | null
  required?: boolean
  scale?: number
  hidden?: boolean
  /** 子表字段清单（tableForm/group 子表列；subForm 除外） */
  subColumns?: DataSourceColumnLike[]
  /** 子表传输方式：embedded（内嵌随主表）/ dedicated（独立子表 CRUD 接口） */
  subMode?: string
}

/**
 * 按数据源列定义生成一条 form-create 字段 rule（field=列英文 key）。
 * 组件类型优先取列元数据的 componentType（即源表单的 rule.type，如数据引用 dataPicker、
 * 查找带回 lookupPicker、自动编号 AutoNumber），缺失时按 columnType 推断；
 * 组件配置优先取 componentProps（源表单 rule.props 的 JSON，后端已剔除 rule/columns 子规则），
 * 覆盖默认推断的 props；「xxxText」冗余展示列（数据引用/查找带回的文本回显列）无录入组件，回退 input。
 * 子表列（tableForm/group，columnType 为空 + subColumns 非空）自动填充子列：
 * tableForm → props.columns[].rule，group/subForm → props.rule；hidden 冗余列（xxxText）不进子表 UI。
 */
export function buildFieldRule(col: DataSourceColumnLike): Record<string, any> {
  const type = resolveFieldComponentType(col)
  const props: Record<string, any> = {}
  if (type === 'inputNumber' && col.columnType === 'DECIMAL') props.precision = col.scale || 2
  if (col.componentProps) {
    try {
      const saved = JSON.parse(col.componentProps)
      if (saved && typeof saved === 'object') {
        delete saved.rule
        delete saved.columns
        Object.assign(props, saved)
      }
    } catch { /* componentProps 非法 JSON 时忽略，保留推断 props */ }
  }
  // 子表容器：按元数据 subColumns 自动生成子列配置（hidden 冗余列跳过）
  const subs = (col.subColumns || []).filter((s) => !s.hidden)
  if (subs.length && (col.componentType === 'group' || col.componentType === 'subForm')) {
    props.rule = subs.map((s) => buildFieldRule(s))
  } else if (subs.length && col.componentType === 'tableForm') {
    props.columns = subs.map((s) => ({
      label: s.label || s.key,
      required: Boolean(s.required),
      hidden: false,
      style: {},
      rule: [buildFieldRule(s)],
    }))
  }
  return {
    type,
    field: col.key,
    title: col.label || col.key,
    props,
    validate: col.required ? [{ required: true, message: `${col.label || col.key}不能为空` }] : [],
  }
}

/** 收集 rule 子树内全部字段 key（含 children / props.rule / 子表列内，见 walkRules） */
function collectSubtreeFieldKeys(rules: unknown): Set<string> {
  const keys = new Set<string>()
  walkRules(rules as RuleLike[] | undefined, (rule) => {
    if (rule.field) keys.add(rule.field)
  })
  return keys
}

/** 在解析后的 rule 树中按 _fc_id 查找规则节点（穿透 children 与 props.rule） */
function findRuleByFcid(rules: unknown[], fcid: string): Record<string, any> | null {
  for (const rule of rules as Record<string, any>[]) {
    if (!rule || typeof rule !== 'object') continue
    if (rule._fc_id === fcid) return rule
    const nested: unknown[] = [
      ...(Array.isArray(rule.children) ? rule.children : []),
      ...(Array.isArray(rule.props?.rule) ? rule.props.rule : []),
    ]
    const found = findRuleByFcid(nested, fcid)
    if (found) return found
  }
  return null
}

/**
 * 表单容器「按字段生成组件」：在 getRule() 解析树中把勾选列生成的 rule 追加进目标容器的
 * 子规则列表（解析态 formContainer 的 props.rule），再 setRule() 重建画布 —— 重建会让
 * 全部规则经 vendor loadRule/makeRule 重新包装（DragTool/_fc_id/_menu），保证生成组件
 * 与拖拽产物一样可选中、可配置。同名字段（容器子树内任意位置）已存在则跳过。
 *
 * @param designer     FcDesigner 组件实例（需暴露 getRule/setRule）
 * @param containerFcid 画布当前选中表单容器的 _fc_id
 */
export function appendGeneratedRules(
  designer: { getRule?: () => unknown[]; setRule?: (rules: unknown[]) => void } | null | undefined,
  containerFcid: string | undefined,
  columns: Array<{ key: string; label?: string; columnType?: string; componentType?: string; required?: boolean; scale?: number }>,
): { added: number; skipped: number } {
  if (!designer || typeof designer.getRule !== 'function' || typeof designer.setRule !== 'function') return { added: 0, skipped: 0 }
  if (columns.length === 0 || !containerFcid) return { added: 0, skipped: 0 }
  const rules = (designer.getRule() || []) as Record<string, any>[]
  const container = findRuleByFcid(rules, containerFcid)
  if (!container) return { added: 0, skipped: 0 }
  // 解析态：formContainer 子规则存于 props.rule；其他容器（FcRow 等兜底形态）存于 children
  const children = Array.isArray(container.props?.rule)
    ? container.props.rule
    : Array.isArray(container.children) ? container.children : (container.props = { ...(container.props || {}), rule: [] }).rule
  const existing = collectSubtreeFieldKeys(children)
  const gen = columns.map(buildFieldRule).filter((r) => !existing.has(r.field))
  const skipped = columns.length - gen.length
  if (gen.length > 0) {
    children.push(...gen)
    designer.setRule(rules)
  }
  return { added: gen.length, skipped }
}

export function useDataSourceCrud(refId: Ref<string> | string, options: UseDataSourceCrudOptions = {}) {
  // 统一为响应式 id：字符串传入时包装为静态 computed（refId 变化时 formConfig 的 Api 目标随之更新）
  const idRef = computed(() => (typeof refId === 'string' ? refId : refId.value))

  const metaColumns = ref<MetaColumn[]>([])
  /** 原始列配置（完整 ColumnConfigItem[]，含 hidden/unsupported/subColumns/pickerConfig/indexed/length 等），供列表页做可筛列/渲染推导 */
  const rawColumns = ref<ColumnConfigItem[]>([])
  const metaLoaded = ref(false)
  const writable = ref(false)
  const formKey = ref('')
  const formSchemaRule = ref<Record<string, any>[]>([])
  const formDataSources = ref<DataSourceBindingContext[]>([])

  function buildFormRule() {
    return metaColumns.value.map(buildFieldRule)
  }

  async function loadFormSchema() {
    if (!formKey.value) {
      formSchemaRule.value = []
      formDataSources.value = []
      return
    }
    try {
      const res = await formApi.getFormDefinitionByKey(formKey.value)
      const raw = (res.data as any)?.schema
      const schema = JSON.parse(raw || '[]')
      const rules = Array.isArray(schema) ? schema : (schema.rule || [])
      // 表单级数据源绑定（select 等选项数据源 effect.datasource.dataSourceId 为表单内 id → 全局 refId）
      formDataSources.value = !Array.isArray(schema) && Array.isArray(schema.dataSources) ? schema.dataSources : []
      // 选项数据源解析：effect.datasource → 选项列表（查询栏/编辑弹窗 select/tree/cascader 按表单字段配置取数）
      formSchemaRule.value = hasOptionDatasource(rules)
        ? await resolveOptionRules(rules, formDataSources.value)
        : rules
    } catch {
      formSchemaRule.value = []
      formDataSources.value = []
    }
  }

  const formRules = computed(() =>
    formSchemaRule.value.length > 0 ? formSchemaRule.value : buildFormRule(),
  )

  const formConfig = computed<FormConfig | undefined>(() => {
    if (!writable.value) return undefined
    const rules = formRules.value
    return {
      rule: rules,
      labelWidth: '100px',
      dataSources: formDataSources.value,
      createApi: (data: any) => dataSourceApi.createData(idRef.value, withArrayLabels(data, rules)),
      updateApi: (id: number | string, data: any, row?: any) =>
        dataSourceApi.updateData(idRef.value, String(id), withArrayLabels(data, rules), row?.version),
      deleteApi: (id: number | string) => dataSourceApi.deleteData(idRef.value, String(id)),
      getApi: async (id: number | string) => {
        const r = await dataSourceApi.getData(idRef.value, String(id))
        return r?.data?.data || {}
      },
      dialogWidth: typeof options.dialogWidth === 'string' ? options.dialogWidth : (options.dialogWidth?.value || '500px'),
      ...(options.dialogHeight ? { dialogHeight: typeof options.dialogHeight === 'string' ? options.dialogHeight : options.dialogHeight.value } : {}),
      dialogTitle: { create: '新增数据', edit: '编辑数据' },
    }
  })

  async function loadMetadata() {
    if (!idRef.value) return
    try {
      const res = await dataSourceApi.getMetadata(idRef.value)
      const meta = res.data as any
      writable.value = !!meta?.writable
      formKey.value = meta?.formKey || ''
      // rawColumns 先赋值：列表页可筛列/渲染推导依赖完整列配置（含 hidden/unsupported/subColumns/pickerConfig/indexed/length）
      rawColumns.value = (meta?.columns || []).map((c: any) => ({ ...c }))
      // metaColumns 先赋值（数组值列 formatter/查询映射依赖 componentType，避免首次取数时列无 formatter 显示原始 value）
      metaColumns.value = (meta?.columns || []).map((c: any) => ({
        key: c.key,
        label: c.label || c.key,
        columnType: c.columnType,
        componentType: c.componentType,
        required: c.required,
        scale: c.scale,
        sortable: c.sortable,
      }))
      // 表单 schema + 选项数据源取数较慢：异步加载（不阻塞首次取数/ready；查询栏选项与编辑弹窗规则随后就绪）
      void loadFormSchema()
    } catch {
      // 元数据加载失败不阻断表格展示
    }
    // 列定义就绪（成功含列/失败空列）：放行 SearchTable 挂载（挂载后首次取数即用最新列定义）
    metaLoaded.value = true
  }

  return {
    metaLoaded, metaColumns, rawColumns, writable, formKey, formSchemaRule, formDataSources,
    formRules, formConfig, loadFormSchema, loadMetadata,
  }
}