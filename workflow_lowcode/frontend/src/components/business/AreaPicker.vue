<template>
  <el-cascader
    :model-value="innerValue"
    :options="options"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    :clearable="clearable"
    :show-all-levels="showAllLevels"
    style="width: 100%"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * 业务组件·地址选择（Task 3-a，表单设计器「地址」字段）。
 *
 * 省市区三级联动（el-cascader 包装 + china-area-data 数据源）：
 * - 值语义：拼接文本 '省/市/区'（如 '湖北省/武汉市/江岸区'）直存 VARCHAR——
 *   便于业务表列映射 / 列表展示 / 导出 / Excel 全兼容，不做行政区划 code 存储
 * - 数据归一（对 china-area-data 已知脏节点的清洗，模块级一次性构建并缓存）：
 *   ① 直辖市二级占位节点（'市辖区'/'县'，如 110100/500200）展示名归一为省名，
 *      输出 '北京市/北京市/东城区' 而非 '北京市/市辖区/东城区'；
 *      重庆 '市辖区'/'县' 双节点同名歧义由三级名称反查消解
 *   ② 三级遗留空壳节点 '市辖区'（如武汉 420101，无实义可选项）剔除；
 *      剔除后无子级的市（嘉峪关市）自身成为叶子，输出两级文本 '甘肃省/嘉峪关市'
 *   ③ 两级行政区（澳门堂区、台湾市等）天然支持，文本段数随实际层级
 * - 值回显：按 '/' 拆分文本后逐级按名称反查 code 路径（深度优先、取最深匹配）；
 *   无法反查的历史/脏值时级联框显示为空，但原始值不丢（仅用户重新选择后被覆盖）
 * - 仅允许选中叶子节点（el-cascader 默认行为）
 */
import { computed } from 'vue'
import chinaAreaData from 'china-area-data'

interface AreaNode {
  /** 行政区划代码（仅作为级联内部 value，不外存） */
  value: string
  /** 展示名（归一化后） */
  label: string
  leaf?: boolean
  children?: AreaNode[]
}

const props = withDefaults(defineProps<{
  /** 选中值：'省/市/区' 拼接文本（直存 VARCHAR） */
  modelValue?: string
  /** 占位提示 */
  placeholder?: string
  /** 禁用 */
  disabled?: boolean
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否可清空 */
  clearable?: boolean
  /** 输入框是否显示完整路径 */
  showAllLevels?: boolean
}>(), {
  modelValue: '',
  placeholder: '请选择省/市/区',
  disabled: false,
  size: 'default',
  clearable: true,
  showAllLevels: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

/* ---------------- 选项数据构建（模块级缓存，多实例共享） ---------------- */

/** china-area-data 不可用时的降级数据：仅省级（省级名可选、无下级），并 console.warn 提示 */
const FALLBACK_PROVINCES: Record<string, string> = {
  '110000': '北京市', '120000': '天津市', '130000': '河北省', '140000': '山西省',
  '150000': '内蒙古自治区', '210000': '辽宁省', '220000': '吉林省', '230000': '黑龙江省',
  '310000': '上海市', '320000': '江苏省', '330000': '浙江省', '340000': '安徽省',
  '350000': '福建省', '360000': '江西省', '370000': '山东省', '410000': '河南省',
  '420000': '湖北省', '430000': '湖南省', '440000': '广东省', '450000': '广西壮族自治区',
  '460000': '海南省', '500000': '重庆市', '510000': '四川省', '520000': '贵州省',
  '530000': '云南省', '540000': '西藏自治区', '610000': '陕西省', '620000': '甘肃省',
  '630000': '青海省', '640000': '宁夏回族自治区', '650000': '新疆维吾尔自治区',
  '710000': '台湾省', '810000': '香港特别行政区', '820000': '澳门特别行政区',
}

/** code → 归一化展示名（选择时由 code 路径还原拼接文本） */
const codeLabel = new Map<string, string>()

function buildOptions(): AreaNode[] {
  const raw = chinaAreaData as Record<string, Record<string, string>> | null
  if (!raw || !raw['86']) {
    console.warn('[AreaPicker] china-area-data 加载失败，降级为省级数据（仅省名可选）')
    return Object.entries(FALLBACK_PROVINCES).map(([value, label]) => ({ value, label, leaf: true }))
  }
  return Object.entries(raw['86']).map(([pCode, pName]) => {
    const cities = Object.entries(raw[pCode] || {}).map(([cCode, cName]) => {
      // 归一①：直辖市二级占位（市辖区/县）展示名归一为省名
      const cityLabel = cName === '市辖区' || cName === '县' ? pName : cName
      // 归一②：剔除三级遗留空壳 '市辖区'；剔除后无子级则本级即叶子
      const districts = Object.entries(raw[cCode] || {})
        .filter(([, dName]) => dName !== '市辖区')
        .map(([dCode, dName]) => ({ value: dCode, label: dName, leaf: true }))
      codeLabel.set(cCode, cityLabel)
      districts.forEach((d) => codeLabel.set(d.value, d.label))
      const node: AreaNode = { value: cCode, label: cityLabel }
      if (districts.length) node.children = districts
      else node.leaf = true
      return node
    })
    codeLabel.set(pCode, pName)
    const node: AreaNode = { value: pCode, label: pName }
    if (cities.length) node.children = cities
    else node.leaf = true
    return node
  })
}

let cachedOptions: AreaNode[] | null = null
function getOptions(): AreaNode[] {
  if (!cachedOptions) cachedOptions = buildOptions()
  return cachedOptions
}

const options = getOptions()

/* ---------------- 文本值 ↔ code 路径 互转 ---------------- */

/** 文本 → code 路径：逐级按名称反查（深度优先、同名歧义取能继续下钻的最深匹配） */
function matchPath(text: string, nodes: AreaNode[]): string[] {
  const names = String(text || '').split('/').map((s) => s.trim()).filter(Boolean)
  if (!names.length) return []
  let best: string[] = []
  const walk = (list: AreaNode[], idx: number, acc: string[]) => {
    let matched = false
    for (const node of list) {
      if (node.label === names[idx]) {
        matched = true
        walk(node.children || [], idx + 1, [...acc, node.value])
      }
    }
    if (!matched && acc.length > best.length) best = acc
  }
  walk(nodes, 0, [])
  return best
}

/** code 路径 → 拼接文本 */
function labelsOf(codes: string[]): string {
  return codes
    .map((c) => codeLabel.get(c) || '')
    .filter(Boolean)
    .join('/')
}

/** 回显值：拼接文本反查为 code 路径（反查失败显示为空，原值不丢） */
const innerValue = computed<string[]>(() => matchPath(props.modelValue, options))

function handleChange(value: unknown) {
  const codes = Array.isArray(value) ? (value as string[]) : []
  const text = codes.length ? labelsOf(codes) : ''
  emit('update:modelValue', text)
  emit('change', text)
}
</script>
