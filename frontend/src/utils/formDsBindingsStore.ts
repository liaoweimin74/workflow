/**
 * 表单级数据源绑定上下文的模块级存储。
 *
 * 解决 provide/inject 跨 form-create 边界断裂的问题：
 * LookupPicker / DataPicker 通过 FcDesigner.component() 全局注册，
 * 由 form-create 内部引擎渲染，不在 FormRenderer 的组件树内，
 * 因此无法通过 Vue provide/inject 获取绑定上下文。
 *
 * FormRenderer / PageRendererPage 在加载 schema 后写入绑定；
 * LookupPicker / DataPicker 从这里读取。
 */
import { ref } from 'vue'
import type { DataSourceBindingContext } from '@/components/business/types'

/** 当前活跃表单/页面的数据源绑定列表（单例，最后写入者生效） */
export const activeDsBindings = ref<DataSourceBindingContext[]>([])
