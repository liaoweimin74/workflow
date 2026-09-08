import { ref, computed, type Ref } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { withArrayLabels } from '@/views/form/arrayValueLabel'
import type { FormConfig, DataSourceBindingContext } from '@/components/business/types'

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

export function useDataSourceCrud(refId: Ref<string> | string, options: UseDataSourceCrudOptions = {}) {
  // 统一为响应式 id：字符串传入时包装为静态 computed（refId 变化时 formConfig 的 Api 目标随之更新）
  const idRef = computed(() => (typeof refId === 'string' ? refId : refId.value))

  const metaColumns = ref<MetaColumn[]>([])
  const metaLoaded = ref(false)
  const writable = ref(false)
  const formKey = ref('')
  const formSchemaRule = ref<Record<string, any>[]>([])
  const formDataSources = ref<DataSourceBindingContext[]>([])

  function buildFormRule() {
    return metaColumns.value.map((c) => ({
      type: inputTypeOf(c.columnType),
      field: c.key,
      title: c.label,
      props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
      validate: c.required ? [{ required: true, message: `${c.label}不能为空` }] : [],
    }))
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
    metaLoaded, metaColumns, writable, formKey, formSchemaRule, formDataSources,
    formRules, formConfig, loadFormSchema, loadMetadata,
  }
}