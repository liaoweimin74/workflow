/**
 * 销售订单演示数据种子脚本（示例配套）。
 *
 * 写入 2 条客户、2 条产品、1 条仓库、1 张销售订单（含明细/交付计划/发票信息），
 * 用于端到端验证主子表场景（查找带回/数据引用/关联卡片/子表单/表格表单）。
 *
 * 用法：node seed-demo.mjs
 */
const BASE = 'http://localhost:8080/api'
const TENANT = 'default'

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
  const json = await res.json()
  if (json.code !== 200) throw new Error(`${method} ${path} -> ${json.code}: ${json.msg}`)
  return json.data
}

/** 按唯一编码查重，已存在则复用 */
async function findOrCreate(formKey, codeField, code, data) {
  const list = await api('GET', `/v1/biz-data/${formKey}`, { query: { page: 1, size: 100 } })
  const hit = (list.records ?? []).find((r) => r.data?.[codeField] === code)
  if (hit) return hit
  return api('POST', `/v1/biz-data/${formKey}`, { body: data })
}

async function main() {
  const login = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((r) => r.json())
  token = login.data.accessToken

  // 避免重复执行时订单编号唯一键冲突
  const existing = await api('GET', '/v1/biz-data/sales_order', { query: { page: 1, size: 1 } })
  if ((existing.total ?? 0) > 0) {
    console.log('销售订单已有数据，跳过种子写入')
    return
  }

  const cust1 = await findOrCreate('customer_profile', 'customer_code', 'CUS-0001', {
    customer_code: 'CUS-0001', name: '华信科技', contact: '王经理',
    phone: '13800000001', address: '武汉市光谷大道', credit_level: 'A',
  })
  const cust2 = await findOrCreate('customer_profile', 'customer_code', 'CUS-0002', {
    customer_code: 'CUS-0002', name: '中原制造', contact: '赵工',
    phone: '13900000002', address: '郑州市高新区', credit_level: 'B',
  })
  const prod1 = await findOrCreate('product_catalog', 'product_code', 'SKU-0001', {
    product_code: 'SKU-0001', product_name: '工业传感器', spec: 'T-100',
    unit: 'PCS', price: 199, stock_qty: 500, status: 'ON_SALE',
  })
  const prod2 = await findOrCreate('product_catalog', 'product_code', 'SKU-0002', {
    product_code: 'SKU-0002', product_name: '数据采集模块', spec: 'D-200',
    unit: 'SET', price: 899, stock_qty: 80, status: 'ON_SALE',
  })
  const wh = await findOrCreate('warehouse_profile', 'warehouse_code', 'WH-0001', {
    warehouse_code: 'WH-0001', name: '光谷中心仓', address: '武汉市东湖高新区',
    manager: '刘仓管', phone: '13700000001',
  })
  console.log('主数据写入完成')

  const order = await api('POST', '/v1/biz-data/sales_order', {
    body: {
      order_no: 'SO-20261015-001',
      order_date: '2026-10-15',
      customer_id: cust2.id,
      customer: '中原制造',
      contact_name: '赵工',
      contact_phone: '13900000002',
      warehouse: [wh.id],
      items: [
        { product: [prod1.id], qty: 2, price: 199, amount: 398 },
        { product: [prod2.id], qty: 1, price: 899, amount: 899 },
      ],
      delivery_plan: [
        { stage: 'PRODUCE', plan_date: '2026-10-20', content: '生产备货', remark: '' },
        { stage: 'SHIP', plan_date: '2026-10-25', content: '物流发货', remark: '顺丰到付' },
      ],
      invoice_info: { invoice_type: 'SPECIAL', invoice_title: '中原制造有限公司', tax_no: '91420100MA4DEMO01' },
      order_amount: 1297,
      discount_rate: 0.9,
      due_amount: 1167.3,
      remark: '主子表组件演示订单',
    },
  })
  console.log(`销售订单写入完成: ${order.id}`)
}

main().catch((err) => {
  console.error('失败:', err.message)
  process.exit(1)
})
