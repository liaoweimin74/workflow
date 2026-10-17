/**
 * 销售订单主子表场景实施脚本（示例配套）。
 *
 * 步骤：
 *  1. 登录获取 token（admin/admin123）
 *  2. 创建并发布三个主数据业务表单（客户档案/产品档案/仓库档案）
 *  3. 查询三个表单自动生成的 FORM 数据源 id
 *  4. 创建销售订单业务表单：替换 schema 中数据源占位符 → 保存 column_config → 发布
 *  5. 验证业务数据列表接口
 *
 * 用法：node implement.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:8080/api'
const TENANT = 'default'
const USERNAME = 'admin'
const PASSWORD = 'admin123'

let token = ''

async function api(method, path, { query, body } = {}) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Id': TENANT,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  if (json.code !== 200) {
    throw new Error(`${method} ${path} -> 业务错误 ${json.code}: ${json.msg}`)
  }
  return json.data
}

function col(key, label, columnType, extra = {}) {
  return {
    key, label, columnType,
    length: extra.length ?? null,
    scale: extra.scale ?? null,
    required: extra.required ?? false,
    unique: extra.unique ?? false,
    indexed: extra.indexed ?? false,
    ...(extra.hidden ? { hidden: true } : {}),
    ...(extra.componentType ? { componentType: extra.componentType } : {}),
    ...(extra.pickerConfig ? { pickerConfig: JSON.stringify(extra.pickerConfig) } : {}),
  }
}

function subTableColumn(key, label, subColumns, extra = {}) {
  return {
    key, label, columnType: '', length: null, scale: null,
    required: false, unique: false, indexed: false,
    subColumns, subMode: extra.subMode ?? 'embedded',
  }
}

async function login() {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  const json = await res.json()
  if (json.code !== 200) throw new Error(`登录失败: ${json.msg}`)
  token = json.data.accessToken
  console.log('[1] 登录成功')
}

/** 创建（如不存在）→ 保存 schema + column_config → 发布 */
async function upsertBusinessForm({ name, key, schema, columnConfig }) {
  let def
  try {
    def = await api('GET', `/v1/form-definitions/by-key/${key}`)
  } catch {
    def = await api('POST', '/v1/form-definitions', { query: { name, key, type: 'BUSINESS' } })
    console.log(`    created ${key} (${def.id})`)
  }
  await api('PUT', `/v1/form-definitions/${def.id}`, {
    body: { name, key, schema: JSON.stringify(schema), columnConfig: JSON.stringify(columnConfig) },
  })
  try {
    const published = await api('POST', `/v1/form-definitions/${def.id}/publish`)
    console.log(`    published ${key} v${published.publishedVersion}`)
  } catch (err) {
    // 已发布且 schema 未变化 → 发布被拒；column_config 已原地更新（物理表不受影响），视为成功
    if (String(err.message).includes('表单内容未变化')) {
      console.log(`    ${key} schema 未变化，仅更新 column_config`)
    } else {
      throw err
    }
  }
  return def
}

// ==================== 主数据表单 ====================

function masterForm(file, columnConfig) {
  const schema = JSON.parse(readFileSync(join(__dirname, file), 'utf8'))
  // 发布用的 schema 仅保留 {rule, option, dataSources, actions}（去掉 form 元信息）
  const { rule, option, dataSources, actions } = schema
  return { schema: { rule, option, dataSources, actions }, columnConfig }
}

const MASTER_FORMS = [
  masterForm('customer-profile.form.json', [
    col('customer_code', '客户编码', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('name', '客户名称', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('contact', '联系人', 'VARCHAR', { length: 255, required: true }),
    col('phone', '联系电话', 'VARCHAR', { length: 255 }),
    col('address', '联系地址', 'VARCHAR', { length: 255 }),
    col('credit_level', '信用等级', 'JSON'),
    col('remark', '备注', 'TEXT'),
  ]),
  masterForm('product-catalog.form.json', [
    col('product_code', '产品编码', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('product_name', '产品名称', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('spec', '规格型号', 'VARCHAR', { length: 255 }),
    col('unit', '计量单位', 'JSON'),
    col('price', '标准单价', 'DECIMAL', { length: 18, scale: 2, required: true }),
    col('stock_qty', '当前库存', 'INT'),
    col('status', '状态', 'JSON'),
  ]),
  masterForm('warehouse-profile.form.json', [
    col('warehouse_code', '仓库编码', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('name', '仓库名称', 'VARCHAR', { length: 255, required: true, indexed: true }),
    col('address', '仓库地址', 'VARCHAR', { length: 255 }),
    col('manager', '负责人', 'VARCHAR', { length: 255 }),
    col('phone', '联系电话', 'VARCHAR', { length: 255 }),
    col('remark', '备注', 'TEXT'),
  ]),
]

async function main() {
  await login()

  console.log('[2] 创建并发布主数据表单')
  for (const { schema, columnConfig } of MASTER_FORMS) {
    await upsertBusinessForm({
      name: schema.option.form.formCreateFormName,
      key: schema.option.form.formCreateFormName === '客户档案' ? 'customer_profile'
        : schema.option.form.formCreateFormName === '产品档案' ? 'product_catalog'
        : 'warehouse_profile',
      schema,
      columnConfig,
    })
  }

  console.log('[3] 查询自动生成的 FORM 数据源')
  const dsList = await api('GET', '/v1/data-sources', { query: { page: 1, size: 100 } })
  const rows = dsList.content ?? dsList
  const dsOf = (formKey) => {
    const ds = rows.find((d) => d.formKey === formKey)
    if (!ds) throw new Error(`未找到 formKey=${formKey} 的数据源`)
    return ds.id
  }
  const dsCustomer = dsOf('customer_profile')
  const dsProduct = dsOf('product_catalog')
  const dsWarehouse = dsOf('warehouse_profile')
  console.log(`    customer=${dsCustomer} product=${dsProduct} warehouse=${dsWarehouse}`)

  console.log('[4] 创建并发布销售订单')
  const so = JSON.parse(readFileSync(join(__dirname, 'sales-order.form.json'), 'utf8'))
  const { rule, option, dataSources, actions } = so
  // 替换数据源占位符：页面内绑定 refId / RelationCard 全局数据源
  const replaceDs = (node) => {
    if (Array.isArray(node)) return node.map(replaceDs)
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string') {
          node[k] = v
            .replace('REPLACE_WITH_客户档案_数据源id', dsCustomer)
            .replace('REPLACE_WITH_产品档案_数据源id', dsProduct)
            .replace('REPLACE_WITH_仓库档案_数据源id', dsWarehouse)
        } else {
          node[k] = replaceDs(v)
        }
      }
    }
    return node
  }
  replaceDs({ rule, dataSources })

  const salesOrderColumns = [
    col('order_no', '订单编号', 'VARCHAR', { length: 255, required: true, unique: true, indexed: true }),
    col('order_date', '下单日期', 'DATE', { required: true }),
    col('customer_id', '客户记录ID', 'VARCHAR', { length: 255, hidden: true }),
    col('customer', '选择客户', 'VARCHAR', {
      length: 255, required: true,
      pickerConfig: { sourceFormKey: null, displayField: 'name', mode: 'single', pickerType: 'lookupPicker' },
    }),
    col('contact_name', '联系人', 'VARCHAR', { length: 255 }),
    col('contact_phone', '联系电话', 'VARCHAR', { length: 255 }),
    col('warehouse', '发货仓库', 'TEXT', {
      componentType: 'dataPicker',
      // FORM 数据源直接引用源表单：sourceFormKey 供后端 resolvePickerText 解析冗余显示文本
      pickerConfig: { sourceFormKey: 'warehouse_profile', displayField: 'name', maxCount: 1, pickerType: 'dataPicker' },
    }),
    col('warehouse_text', '发货仓库（显示）', 'TEXT', { hidden: true }),
    subTableColumn('items', '订单明细', [
      col('product', '产品', 'TEXT', {
        required: true, componentType: 'dataPicker',
        pickerConfig: { sourceFormKey: 'product_catalog', displayField: 'product_name', maxCount: 1, pickerType: 'dataPicker' },
      }),
      col('product_text', '产品（显示）', 'TEXT', { hidden: true }),
      col('qty', '数量', 'INT', { required: true }),
      col('price', '单价', 'DECIMAL', { length: 18, scale: 2, required: true }),
      col('amount', '金额', 'DECIMAL', { length: 18, scale: 2 }),
    ]),
    subTableColumn('delivery_plan', '交付计划', [
      col('stage', '阶段', 'JSON', { required: true }),
      col('plan_date', '计划日期', 'DATE', { required: true }),
      col('content', '交付内容', 'VARCHAR', { length: 255 }),
      col('remark', '备注', 'VARCHAR', { length: 255 }),
    ]),
    col('invoice_info', '发票信息', 'JSON', { hidden: true }),
    col('order_amount', '订单总金额', 'DECIMAL', { length: 18, scale: 2, required: true }),
    col('discount_rate', '折扣率', 'DECIMAL', { length: 18, scale: 2 }),
    col('due_amount', '应收金额', 'DECIMAL', { length: 18, scale: 2, componentType: 'FormulaField' }),
    col('remark', '订单备注', 'TEXT'),
  ]

  await upsertBusinessForm({
    name: '销售订单',
    key: 'sales_order',
    schema: { rule, option, dataSources, actions },
    columnConfig: salesOrderColumns,
  })

  console.log('[5] 验证：销售订单业务数据列表')
  const page = await api('GET', '/v1/biz-data/sales_order', { query: { page: 1, size: 5 } })
  console.log(`    列表可访问，当前记录数=${page.totalElements ?? '?'}`)
  console.log('完成 ✅')
}

main().catch((err) => {
  console.error('实施失败:', err.message)
  process.exit(1)
})
