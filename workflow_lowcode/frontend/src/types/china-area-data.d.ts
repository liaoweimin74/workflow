/**
 * china-area-data 类型声明（Task 3-a）。
 *
 * 该包为 CommonJS（module.exports = require('./data.json')）且不带 TS 类型，
 * 数据结构为「行政区划代码 → 子级映射」的扁平字典：
 * - data['86']              → 省级：{ '110000': '北京市', '420000': '湖北省', ... }
 * - data[省级代码]           → 市级：{ '420100': '武汉市', ... }
 * - data[市级代码]           → 区县级：{ '420102': '江岸区', ... }
 * 叶子层级无子级映射（data[code] 为 undefined）。详见 AreaPicker.vue。
 */
declare module 'china-area-data' {
  const chinaAreaData: Record<string, Record<string, string>>
  export default chinaAreaData
}
