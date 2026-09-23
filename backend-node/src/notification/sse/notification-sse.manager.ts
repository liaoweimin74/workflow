import { Injectable, Logger } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

/** SSE 事件（NestJS `@Sse()` 的帧格式：`event: <type>` + `data: <json>`）。 */
export interface SseEvent {
  type: string
  /** ⚠️ 类型刻意收窄成 `string | Record<string, unknown>`：Nest `@Sse()` 的 `MessageEvent`
   *  只接受这两种（`unknown` 不兼容，会在控制器返回类型处报错）。 */
  data: string | Record<string, unknown>
}

/**
 * SSE 连接管理器（对齐 Java `com.workflow.notification.sse.SseEmitterManager`）。
 *
 * ## 语义逐条对齐
 * | Java | Node |
 * |---|---|
 * | `Map<Long, SseEmitter> connections`，**每用户只保留一条连接** | `Map<number, Subject>`，注册时先 `complete()` 旧的 |
 * | `register(userId)`：旧连接 `complete()` 后新建，超时 30 分钟 | 同：旧 Subject `complete()`，新 Subject；超时由 `setTimeout` 兜底 |
 * | `sendToUser(userId, name, data)`：离线**静默跳过**（`log.debug`） | 同：无连接直接返回（**不报错**） |
 * | `getOnlineCount()` | 同 |
 *
 * ## 为什么用 rxjs Subject
 * NestJS 的 `@Sse()` 要求方法返回 `Observable<MessageEvent>`；「连接建立后由别处推送」
 * 正好是 Subject 的语义（订阅者拿到后续事件）。Java 的 `SseEmitter` 也是这个模型。
 *
 * ⚠️ **单实例语义**：Java 的 connections 是**进程内** Map —— 多实例部署时
 * 「A 实例收到消息、B 实例持有连接」就推不到。Node 照抄这一限制（与规格 U33 的
 * 单实例前提一致），**不要**在这里偷偷引入 Redis 广播而让行为与 Java 分叉。
 */
@Injectable()
export class NotificationSseManager {
  private readonly logger = new Logger(NotificationSseManager.name)
  private readonly connections = new Map<number, Subject<SseEvent>>()
  private readonly timers = new Map<number, NodeJS.Timeout>()

  /** Java `SseEmitterManager.TIMEOUT` = 30 分钟。 */
  static readonly TIMEOUT_MS = 30 * 60 * 1000

  /**
   * 注册用户的 SSE 连接：**同一用户只保留最新一条**（Java 先 `complete()` 旧的）。
   *
   * 旧连接被关闭是刻意的：浏览器 `EventSource` 重连时不会同时保留两条，
   * 若服务端留两条，同一条消息会被推两次。
   */
  register(userId: number): Observable<SseEvent> {
    const old = this.connections.get(userId)
    if (old !== undefined) {
      old.complete()
      this.clearTimer(userId)
      this.logger.debug(`SSE 旧连接被替换: userId=${userId}`)
    }

    const subject = new Subject<SseEvent>()
    this.connections.set(userId, subject)
    this.armTimeout(userId, subject)

    /**
     * ⚠️ 返回**包装后的 Observable**而不是 `subject.asObservable()`，是为了拿到 teardown：
     *    浏览器关闭页面 / 网络断开时，Nest 会 **unsubscribe** 这个 observable
     *    （不会调用 `complete`），只有 teardown 里才能把登记摘掉。
     *
     *    这正对应 Java 的 `emitter.onCompletion` / `onError` 回调 ——
     *    Java 靠回调摘连接，rxjs 靠 teardown 摘连接，**语义相同、机制不同**。
     *    少了它，断开的连接会一直留到 30 分钟超时，期间 `getOnlineCount()` 虚高。
     */
    return new Observable<SseEvent>((subscriber) => {
      const inner = subject.subscribe(subscriber)
      return () => {
        inner.unsubscribe()
        this.removeIfCurrent(userId, subject)
      }
    })
  }

  /**
   * 向指定用户推送事件；**用户不在线时静默跳过**（对齐 Java 的 `log.debug`）。
   *
   * ⚠️ 不能因为「没人在线」就抛错：消息落库是主流程，SSE 只是附带推送 ——
   *    抛错会让「发消息」这个动作在无人登录时失败。
   *
   * ⚠️ 这里**没有** Java 那种「push 抛 IOException 就摘掉连接」的 try/catch：
   *    rxjs 的 `Subject.next` 会把观察者抛出的异常交给观察者自己的 error 回调
   *    （不会冒到调用方），所以那种 catch 是**不可达代码**。
   *    客户端断开在 Node 侧表现为 **unsubscribe** ⇒ 由 `register` 的 teardown 摘连接。
   *    （单测 `notification-sse.spec.ts` 用「unsubscribe 后 onlineCount 归零」钉住这一点。）
   */
  sendToUser(userId: number, eventName: string, data: string | Record<string, unknown>): void {
    const subject = this.connections.get(userId)
    if (subject === undefined) {
      this.logger.debug(`用户不在线，跳过推送: userId=${userId}`)
      return
    }
    subject.next({ type: eventName, data })
  }

  /** 当前在线连接数（对齐 Java `getOnlineCount`）。 */
  getOnlineCount(): number {
    return this.connections.size
  }

  /** 30 分钟超时兜底：超时后关闭并摘除（对齐 Java 的 `SseEmitter(30min)` + `onTimeout`）。 */
  private armTimeout(userId: number, subject: Subject<SseEvent>): void {
    this.timers.set(
      userId,
      setTimeout(() => {
        if (this.connections.get(userId) === subject) {
          subject.complete()
          this.removeIfCurrent(userId, subject)
          this.logger.debug(`SSE 连接超时: userId=${userId}`)
        }
      }, NotificationSseManager.TIMEOUT_MS),
    )
  }

  /**
   * 只在「登记的还是这条连接」时摘除。
   *
   * 防的是这个竞态：旧连接被替换后才走到 teardown，此时 map 里已经是**新**连接 ——
   * 直接 `delete` 会把刚建立的新连接一起清掉，用户从此收不到推送。
   */
  private removeIfCurrent(userId: number, subject: Subject<SseEvent>): void {
    if (this.connections.get(userId) !== subject) return
    this.connections.delete(userId)
    this.clearTimer(userId)
  }

  private clearTimer(userId: number): void {
    const timer = this.timers.get(userId)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.timers.delete(userId)
    }
  }
}
