/**
 * 数据容器接入链路回归防护。
 *
 * 组件本身（取数 + 作用域插值）已有单测，这里守的是三条容易漏的接线：
 *  1. 设计器面板注册形态——容器要靠 loadRule/parseRule 在画布态与保存态之间往返，
 *     少一处就会变成「画布能拖保存就丢」或「能存不能编辑」；
 *  2. 运行时注册——设计器认得类型不等于 form-create 运行态渲染得出来；
 *  3. 宿主 normalize——子规则必须换到 props.childRules 并停止主树递归，否则同一份
 *     子组件被渲染两遍（主树一遍、容器内嵌一遍）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const designer = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
const renderer = readFileSync(resolve(__dirname, '../PageRendererPage.vue'), 'utf8')
const configPanel = readFileSync(resolve(__dirname, '../../../components/business/DataSourceConfigPanel.vue'), 'utf8')

describe('PageDesigner 注册形态', () => {
  it('按自有类型注册面板项，并挂上画布态/保存态双向转换', () => {
    expect(designer).toContain('name: PAGE_DATA_CONTAINER_NAME')
    expect(designer).toContain('rule: () => pageDataContainerRule() as any')
    expect(designer).toContain('loadRule: loadDataContainerRule')
    expect(designer).toContain('parseRule: saveDataContainerRule')
  })

  it('导入三个形态函数与类型常量', () => {
    expect(designer).toContain("from './dataContainer'")
    for (const symbol of [
      'PAGE_DATA_CONTAINER_NAME',
      'pageDataContainerRule',
      'loadDataContainerRule',
      'saveDataContainerRule',
    ]) {
      expect(designer, `PageDesigner 应导入 ${symbol}`).toContain(symbol)
    }
  })

  it('注册形态与已验证可用的容器（formContainer/group/subForm）保持一致', () => {
    // inside:false + drag:true 才有「把组件拖进容器」的内层 DragBox；mask 不设 false 会盖住拖入区
    expect(designer).toMatch(/name: PAGE_DATA_CONTAINER_NAME[\s\S]{0,320}inside: false/)
    expect(designer).toMatch(/name: PAGE_DATA_CONTAINER_NAME[\s\S]{0,320}drag: true/)
    expect(designer).toMatch(/name: PAGE_DATA_CONTAINER_NAME[\s\S]{0,320}mask: false/)
  })

  it('配置入口用组件自己的弹窗，不挤进仪表盘配置弹窗（画布态类型是 fcRow，按类型匹配的链路套不上）', () => {
    expect(designer).toContain('DataContainerConfigDialog')
    expect(designer).toContain("openDataContainerConfig")
    // 反向保护：不要图省事把它塞进 DASH_CONFIG_TYPES，那里靠 active.type 相等判定
    expect(designer).not.toMatch(/container:\s*PAGE_DATA_CONTAINER_NAME/)
  })

  it('容器改名同步节点 title：画布上容器是行容器，标题读的是节点不是 props', () => {
    expect(designer).toMatch(/handleDataContainerConfirm[\s\S]{0,400}active\.title = propsPatch\.title/)
  })
})

describe('运行时注册与宿主接线', () => {
  it('渲染器按页面轨惯例把组件注册给 form-create', () => {
    expect(renderer).toContain("formCreate.component('page-data-container', PageDataContainer)")
  })

  it('transformComponent 命中容器时走 normalize，并把子规则继续交给 transformComponent 递归', () => {
    expect(renderer).toContain('normalizeDataContainerForRender')
    expect(renderer).toMatch(/childRules = [^)]*\.map\(transformComponent\)/)
  })

  it('容器实例既按 dataSourceId 也按自身 field 进 componentRefs', () => {
    // 只按数据源寻址会被同源的表格/KPI 抢位（实测 componentRefs['ds_x'] 是内嵌 KPI，
    // refresh 打到 KPI 上、两个容器毫无反应）。field 是容器独有地址，动作总线用它才指得准。
    expect(renderer).toMatch(/PAGE_DATA_CONTAINER_NAME[\s\S]{0,1200}componentRefs\[normalized\.field\]/)
    expect(renderer).toMatch(/PAGE_DATA_CONTAINER_NAME[\s\S]{0,1200}componentRefs\[normalized\.props\.dataSourceId\]/)
  })

  it('设计器把容器地址候选喂给动作总线面板', () => {
    expect(designer).toContain('collectDataContainerTargets')
    expect(designer).toMatch(/:data-targets="dataContainerTargets"/)
  })

  it('数据源配置面板：数据类动作的 target 下拉里要能选到数据容器', () => {
    expect(configPanel).toContain('dataTargets?: { value: string; label: string }[]')
    expect(configPanel).toMatch(/dataTargetList[\s\S]{0,260}label="数据容器"/)
  })
})

describe('宿主事件接线：连字符事件名必须换成 camelCase 键', () => {
  // @form-create/core/src/frame/util.js 的 toProps 把 rule.on 转成 props 时先做
  // `if (k.indexOf('-') > 0) k = toCase(k)`，随后却用改写后的 k 去取 rule.on[k]：
  // 'filter-change' 于是读成了 rule.on['filterChange']，结果是 props.onFilterChange = undefined。
  // 实测表现：筛选器选了值、组件 selectValue 也变了，宿主里 next.on['filter-change'] 的处理器
  // 一次都没被调用（同一条 rule 上无连字符的 ready 正常触发）。所以处理器要直接用 camelCase 键写；
  // 组件侧仍然 $emit('filter-change')，Vue 会把事件名 camelize 后再找 onFilterChange，能对上。
  it('筛选器与表格的处理器都以 camelCase 键写入 rule.on', () => {
    for (const key of ["on['filterChange']", "on['nodeClick']", "on['rowClick']"]) {
      expect(renderer, `渲染器应以 camelCase 键挂 ${key}`).toContain(key)
    }
  })

  it('反向保护：不再出现连字符键（写回去就等于把广播链路关掉）', () => {
    for (const bad of ["on['filter-change']", "on['node-click']", "on['row-click']"]) {
      expect(renderer, `${bad} 会被 form-create 的 toProps 读成 undefined`).not.toContain(bad)
    }
  })
})
