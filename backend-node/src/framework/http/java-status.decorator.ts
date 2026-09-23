import { HttpCode } from '@nestjs/common'

/**
 * 类级装饰器：让本 Controller 的所有路由返回 HTTP **200**（对齐 Spring MVC）。
 *
 * 【为什么必须有】
 *   NestJS 默认让 **POST 返回 201**，而 Spring MVC 全站返回 200。
 *   实测踩到过：不加这个，所有 POST 端点的状态码都与 Java 不一致，
 *   契约比对直接报 `HTTP 状态码: Java 200 vs Node 201`。
 *   （PUT / DELETE / PATCH 的默认值本来就是 200，只有 POST 需要纠正。）
 *
 * 【为什么不直接写 `@HttpCode(200)` 到类上】
 *   `@nestjs/common` 把它声明成 `MethodDecorator & ClassDecorator`，
 *   TypeScript 无法把它当类装饰器调用（TS1238：
 *   「The runtime will invoke the decorator with 1 arguments, but the decorator expects 3」）。
 *   这里改为把同一份元数据逐个写到原型方法上 —— 效果等价、类型安全，
 *   而且不依赖 Nest 是否读取类级 `__httpCode__` 元数据这一未文档化的细节。
 *
 * 【约定】**本项目所有 Controller 都应当带这个装饰器。**
 */
export function JavaStatusOk(): ClassDecorator {
  return (target) => {
    const prototype = (target as { prototype?: object }).prototype
    if (prototype === undefined) return

    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') continue
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      // 只处理实例方法；getter / 字段跳过
      if (descriptor === undefined || typeof descriptor.value !== 'function') continue
      // MethodDecorator 的 descriptor 形参类型是 TypedPropertyDescriptor<T>，
      // 而 getOwnPropertyDescriptor 给出的是 PropertyDescriptor —— 语义兼容，这里显式收窄。
      HttpCode(200)(prototype, key, descriptor as TypedPropertyDescriptor<() => void>)
    }
  }
}
