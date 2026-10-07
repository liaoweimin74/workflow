import { ElMessageBox } from 'element-plus'

/**
 * 全局弹层可拖动默认值（用户需求：系统中所有弹出对话框都允许拖动）
 *
 * - el-dialog：在 main.ts 的 app.use(ElementPlus, { draggable: true }) 全局开启
 *   （EP use-dialog 读取 globalConfig.draggable；fullscreen 对话框自动排除，
 *   个别对话框仍可用 :draggable="false" 显式关闭）
 * - ElMessageBox（confirm/alert/prompt）：无全局配置入口，这里包装其工厂方法，
 *   为每次调用默认注入 draggable: true；调用方显式传 draggable 可覆盖
 */
export function patchMessageBoxDraggable(): void {
  const isOptions = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null

  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (message: unknown, title?: unknown, options?: unknown, appContext?: unknown): unknown => {
      // 与 EP messageBoxFactory 的归一化一致：title 传对象时视为 options（原 options 参数被忽略）
      if (isOptions(title)) {
        return fn(message, { draggable: true, ...title }, undefined, appContext)
      }
      const injected: Record<string, unknown> = {
        draggable: true,
        ...(isOptions(options) ? options : {}),
      }
      return fn(message, title, injected, appContext)
    }

  const box = ElMessageBox as unknown as Record<
    'alert' | 'confirm' | 'prompt',
    (...args: unknown[]) => unknown
  >
  box.alert = wrap(box.alert)
  box.confirm = wrap(box.confirm)
  box.prompt = wrap(box.prompt)
}
