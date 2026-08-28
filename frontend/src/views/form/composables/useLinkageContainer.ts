import { ref, computed, markRaw, type Ref } from 'vue'
import type { Rule } from '@form-create/element-ui'
import type { dataSourceApi } from '@/api/data-source'
import { createDsBindingEngine } from '../components/DsBindingEngine'
import type { DataSourceBindingContext } from '@/components/business/types'

export type ContainerDisplayMode = 'dialog' | 'inline' | 'newTab'

export interface ContainerButtons {
  showNew: boolean
  showCancel: boolean
  showConfirm: boolean
  showDelete: boolean
  showCopy: boolean
  custom: Array<{ key: string; label: string; type?: string }>
}

/**
 * 联动容器运行时状态（dialog / inline / newTab 统一复用）。
 * 三种显示模式共用：独立 formData + 独立数据引擎 + 按钮区，仅渲染位置不同
 * （dialog=弹窗 / inline=页内区域 / newTab=新页签）。
 */
export interface LinkageContainer {
  /** 页面内数据源标识（动作 target = props.dataSourceId） */
  key: string
  displayMode: ContainerDisplayMode
  /** 原始 formContainer 节点（保存格式，引擎 mount 用） */
  node: Record<string, any>
  /** 标题（tabTitle 或节点 title） */
  title: string
  /** 弹窗宽度（dialogWidth） */
  width: string
  /** 内容高度（dialogHeight） */
  height: string
  /** 可见性（dialog=弹窗开关 / inline=页内显示开关） */
  visible: boolean
  /** 容器子 rule（props.rule，容器内 form-create 渲染） */
  renderRule: Rule[]
  /** 容器独立表单数据（与主 formData 隔离，天然避免重名字段冲突） */
  formData: Record<string, any>
  /** 当前记录 ID（load-record 写入，引擎 recordId 定位用） */
  currentRecordId: string | undefined
  /** 容器数据引擎（独立读写数据源） */
  engine: ReturnType<typeof createDsBindingEngine> | null
  buttons: ContainerButtons
}

export interface ContainerComponentRef {
  refresh?: () => void
  setFilter?: (filter: Record<string, unknown>) => void
  setValue?: (field: string, value: unknown) => void
}

export interface UseLinkageContainerOptions {
  dsApi: typeof dataSourceApi
  /** 解析数据源绑定：dataSourceId → { refId } */
  dataSources: () => DataSourceBindingContext[]
  /** 容器表单数据读写（差异注入：渲染器可自定义读写容器 formData 的方式） */
  formDataApi: {
    getValue: (c: LinkageContainer, field: string) => unknown
    setValue: (c: LinkageContainer, field: string, value: unknown) => void
  }
  /** 新页签打开方式（open-container mode=newTab 时调用；容器可能未找到） */
  openNewTab?: (c: LinkageContainer | undefined, rid: string) => void
  /** 确认保存策略（默认 flush；可覆盖为 saveAll/createData 等） */
  saveContainer?: (c: LinkageContainer) => Promise<boolean>
  /** 按容器 key 找关联组件（确认/删除/复制后智能刷新表格用） */
  findComponent?: (key: string) => ContainerComponentRef | undefined
  /** 自定义按钮动作执行（默认仅提示；Page 版可执行 step 链） */
  onCustomAction?: (c: LinkageContainer, btn: ContainerButtons['custom'][number]) => void
  /** inline 容器是否保留在主规则树；默认 false（Form 独立渲染），Page 可开启页内渲染 */
  keepInlineOnTree?: boolean
  /** inline 容器是否由 open-container 打开；Form 默认打开，Page 可关闭以保留页内语义 */
  openInline?: boolean
  /** 渲染选项（容器内 form-create 用） */
  getRenderOption?: () => Record<string, any>
}

/**
 * 表格-容器联动统一机制（FormRenderer 与 PageRendererPage 复用）。
 * 封装：容器提取（从主树移除）、引擎挂载、按钮行为、open/load/save/close 动作。
 */
export function useLinkageContainer(options: UseLinkageContainerOptions) {
  const containers = ref<LinkageContainer[]>([]) as Ref<LinkageContainer[]>

  const dialogContainers = computed(() => containers.value.filter((c) => c.displayMode === 'dialog' || c.displayMode === 'newTab'))
  const inlineContainers = computed(() => containers.value.filter((c) => c.displayMode === 'inline'))

  /** 各容器显示模式索引（dataSourceId → displayMode），动作分发用 */
  const containerModes = new Map<string, ContainerDisplayMode>()

  function findContainer(target: string): LinkageContainer | undefined {
    return containers.value.find((c) => c.key === target)
  }

  /** 构造联动容器运行时状态 */
  function makeContainer(node: Record<string, any>, displayMode: ContainerDisplayMode): LinkageContainer {
    const props = node.props || {}
    return {
      key: props.dataSourceId,
      displayMode,
      node,
      title: props.tabTitle || node.title || '编辑记录',
      width: props.dialogWidth || '800px',
      height: props.dialogHeight || '600px',
      visible: false,
      renderRule: (Array.isArray(props.rule) ? props.rule : []) as Rule[],
      formData: {},
      currentRecordId: undefined,
      engine: null,
      buttons: {
        showNew: props.showNewButton !== false,
        showCancel: props.showCancelButton !== false,
        showConfirm: props.showConfirmButton !== false,
        showDelete: props.showDeleteButton === true,
        showCopy: props.showCopyButton === true,
        custom: Array.isArray(props.customButtons) ? props.customButtons : [],
      },
    }
  }

  /** 为容器挂载独立数据引擎（读写容器自身 formData，与主表单隔离） */
  function mountContainerEngine(c: LinkageContainer) {
    const key = c.key
    const engine = createDsBindingEngine(
      { dsApi: options.dsApi } as any,
      {
        api: {
          getValue: (field: string) => {
            const rc = containers.value.find((x) => x.key === key)
            return rc ? options.formDataApi.getValue(rc, field) : undefined
          },
          setValue: (field: string, value: unknown) => {
            const rc = containers.value.find((x) => x.key === key)
            if (rc) options.formDataApi.setValue(rc, field, value)
          },
        },
        recordId: () => {
          const rc = containers.value.find((x) => x.key === key)
          return rc?.currentRecordId
        },
        onRecordChange: () => { /* load-record 动作显式驱动 */ },
        onFieldChange: () => { /* 容器内字段变化由容器 formData 驱动 */ },
        onConflict: (msg: string) => console.warn(msg),
      },
    )
    // mount 用保存格式节点（collectContainers 递归 props.rule 收集子字段）
    engine.mount([c.node])
    // containers.value 尚未赋值时传入的是原始对象，需通过 find 取 reactive proxy；
    // 引擎闭包已通过 containers.value.find 定位，故此处直接缓存原始 engine 即可
    c.engine = markRaw(engine) as any
  }

  /**
   * 从 rule 树提取联动容器（须在 normalizeForRender 之前调用）。
   * 默认所有容器从树移除；keepInlineOnTree=true 时 inline 保留在树（页内区域渲染）。
   * 返回移除容器后的主树，同时填充 containers 数组。
   */
  function extractContainers(rules: Rule[]): Rule[] {
    const found: LinkageContainer[] = []
    containerModes.clear()
    const walk = (list: Rule[]): Rule[] =>
      list
        .filter((n) => {
          const node = n as Record<string, any>
          if (node.type === 'formContainer' && node.props?.dataSourceId) {
            const mode = (node.props.displayMode as ContainerDisplayMode) || 'dialog'
            containerModes.set(node.props.dataSourceId, mode)
            found.push(makeContainer(node, mode))
            return mode === 'inline' && options.keepInlineOnTree === true // 可选保留 inline；其他从树移除
          }
          return true
        })
        .map((n) => {
          const node = n as Record<string, any>
          if (Array.isArray(node.children)) node.children = walk(node.children as Rule[])
          if (node.props && Array.isArray(node.props.rule)) node.props.rule = walk(node.props.rule as Rule[])
          return n
        })
    const mainTree = walk(rules)
    containers.value = []
    for (const c of found) {
      mountContainerEngine(c)
      containers.value.push(c)
    }
    return mainTree
  }

  /** 打开容器并加载触发行记录（open-container）；rid 来自事件行 */
  function openContainer(target: string, rid: string, displayMode?: ContainerDisplayMode) {
    const mode = displayMode || containerModes.get(target) || 'dialog'
    if (mode === 'newTab') {
      options.openNewTab?.(findContainer(target) as LinkageContainer, rid)
      return
    }
    if (mode === 'inline' && options.openInline === false) {
      // 页面 inline 容器平铺在主树，不控制 visible；只重置 formData/currentRecordId
      const c = findContainer(target)
      if (!c) return
      c.formData = {}
      c.currentRecordId = undefined
      return
    }
    // dialog 模式：弹窗控制 visible
    const c = findContainer(target)
    if (!c) return
    c.formData = {}
    c.currentRecordId = undefined
    c.visible = true
    if (rid && c.engine) {
      c.currentRecordId = rid
      void c.engine.loadRecord(rid)
    }
  }

  /** 加载记录到容器引擎（load-record）；无容器时回退调用方处理 */
  function loadRecord(target: string, rid: string, fallback?: () => void) {
    if (!rid) return
    const c = findContainer(target)
    if (c?.engine) {
      c.currentRecordId = rid
      void c.engine.loadRecord(rid)
    } else {
      fallback?.()
    }
  }

  /** 保存容器数据（save-container）；无容器时回退调用方处理 */
  function flushContainer(target: string, fallback?: () => void) {
    const c = findContainer(target)
    if (c?.engine) void c.engine.flush()
    else fallback?.()
  }

  /** 关闭容器（close-container） */
  function closeContainer(target: string) {
    const c = findContainer(target)
    if (c) c.visible = false
  }

  /** 容器内数据源对应的全局 refId */
  function containerRefId(c: LinkageContainer): string | undefined {
    return options.dataSources().find((d) => d.id === c.key)?.refId
  }

  /** footer 按钮区是否有任何可见按钮；无则整块 footer 不显示 */
  function hasContainerButtons(c: LinkageContainer): boolean {
    return (
      c.buttons.showNew ||
      c.buttons.showCopy ||
      c.buttons.showDelete ||
      c.buttons.showConfirm ||
      c.buttons.showCancel ||
      c.buttons.custom.length > 0
    )
  }

  /** 默认按钮行为：new=清空建新 / cancel=关闭 / confirm=保存关闭 / delete=删除记录 / copy=复制新记录 */
  async function containerAction(c: LinkageContainer, action: 'new' | 'cancel' | 'confirm' | 'delete' | 'copy') {
    if (action === 'new') {
      c.formData = {}
      c.currentRecordId = undefined
    } else if (action === 'cancel') {
      c.visible = false
    } else if (action === 'confirm') {
      // 确定：编辑记录 → saveAll（含乐观锁版本）；新增记录 → createData 创建
      let ok = true
      if (c.currentRecordId) {
        ok = (await c.engine?.saveAll(c.currentRecordId)) !== false
      } else {
        const refId = containerRefId(c)
        if (refId && Object.keys(c.formData).length > 0) {
          try {
            await options.dsApi.createData(refId, { ...c.formData })
          } catch {
            ok = false // http 拦截器已提示；失败不关闭容器，避免丢失输入
          }
        }
      }
      if (!ok) return
      // 智能同步：刷新容器关联的表格
      options.findComponent?.(c.key)?.refresh?.()
      c.visible = false
    } else if (action === 'delete') {
      const refId = containerRefId(c)
      if (!refId || !c.currentRecordId) return
      try {
        const { ElMessageBox } = await import('element-plus')
        await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await options.dsApi.deleteData(refId, c.currentRecordId)
        options.findComponent?.(c.key)?.refresh?.()
        c.visible = false
      } catch {
        // http 拦截器已提示
      }
    } else if (action === 'copy') {
      const refId = containerRefId(c)
      if (!refId) return
      const data = { ...c.formData }
      delete data.id
      delete data.version
      try {
        await options.dsApi.createData(refId, data)
        options.findComponent?.(c.key)?.refresh?.()
        c.visible = false
      } catch {
        // http 拦截器已提示
      }
    }
  }

  /** 自定义按钮行为（调用方注入执行逻辑） */
  function containerCustomAction(c: LinkageContainer, btn: ContainerButtons['custom'][number]) {
    options.onCustomAction?.(c, btn)
  }

  return {
    containers,
    dialogContainers,
    inlineContainers,
    containerModes,
    findContainer,
    makeContainer,
    mountContainerEngine,
    extractContainers,
    openContainer,
    loadRecord,
    flushContainer,
    closeContainer,
    containerRefId,
    hasContainerButtons,
    containerAction,
    containerCustomAction,
  }
}
