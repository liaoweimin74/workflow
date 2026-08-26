/**
 * 表单级数据源绑定上下文的模块级存储。
 *
 * 解决 provide/inject 跨 form-create 边界断裂的问题：
 * LookupPicker / DataPicker 通过 FcDesigner.component() 全局注册，
 * 由 form-create 内部引擎渲染，不在 FormRenderer 的组件树内，
 * 因此无法通过 Vue provide/inject 获取绑定上下文。
 *
 * FormRenderer / PageRendererPage / FormDesigner 在加载 schema 后写入绑定；
 * LookupPicker / DataPicker 从这里读取。
 *
 * 写入策略：非空数据可覆盖空数据，空数据不覆盖非空数据，
 * 防止多个 FormRenderer 实例互相覆盖（如子表弹窗无 dataSources 的实例）。
 */
import { ref } from 'vue'
import type { DataSourceBindingContext } from '@/components/business/types'

/** 当前活跃表单/页面的数据源绑定列表（单例，非空优先） */
export const activeDsBindings = ref<DataSourceBindingContext[]>([])

/** 安全写入：非空数据可覆盖，空数据不覆盖已有非空数据 */
export function setActiveDsBindings(bindings: DataSourceBindingContext[]) {
  if (bindings.length > 0 || activeDsBindings.value.length === 0) {
    activeDsBindings.value = bindings
  }
}
