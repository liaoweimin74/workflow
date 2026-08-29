/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// sortablejs（vuedraggable 依赖，无内置类型声明）——用于 el-table 行拖拽排序
declare module 'sortablejs' {
  export interface SortableOptions {
    handle?: string
    animation?: number
    filter?: string | ((evt: any) => boolean)
    onEnd?: (evt: any) => void
    onStart?: (evt: any) => void
    [key: string]: any
  }
  export default class Sortable {
    constructor(el: HTMLElement, options?: SortableOptions)
    destroy(): void
    static create(el: HTMLElement, options?: SortableOptions): Sortable
  }
}