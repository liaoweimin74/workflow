/**
 * 流程引擎异常，对齐 Java 侧 FlowableException 的响应语义
 * （HTTP 400 + 消息前缀「流程引擎错误: 」）。
 *
 * 自研引擎替代 Flowable 后，引擎层抛出的可预期错误统一用它，
 * 以保证前端看到的错误响应与迁移前一致。
 */
export class EngineException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineException'
  }
}
