import { defineComponent, h, type Component } from 'vue'

/**
 * 契约组件薄封装工厂（@lc/ui-mobile 内部实现件，不经包入口导出）。
 *
 * props/attrs/插槽透传内核组件，modelValue 双写 update:modelValue
 * （uni-ui 与 el-* 的 v-model 契约同名）。uni 风格附加事件（input 等）在
 * 各组件按需补发；staticAttrs 是契约固定值（如 datetime-picker 的 type），
 * 优先级高于调用方 attrs。
 */
export function thin(
  name: string,
  inner: Component,
  props: Record<string, unknown> = {},
  staticAttrs: Record<string, unknown> = {},
) {
  return defineComponent({
    name,
    props: { modelValue: { type: null, default: undefined }, ...props },
    emits: ['update:modelValue'],
    setup(p, { emit, attrs, slots }) {
      return () =>
        h(
          inner,
          {
            ...attrs,
            ...staticAttrs,
            modelValue: (p as Record<string, unknown>).modelValue,
            'onUpdate:modelValue': (v: unknown) => emit('update:modelValue', v),
          },
          slots,
        )
    },
  })
}
