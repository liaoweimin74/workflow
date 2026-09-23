import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import type { Request } from 'express'
import { R } from '../../common/domain/r'
import { ValidationError } from '../../common/exception/validation-error'
import { CurrentUser } from '../../framework/security/current-user.decorator'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'
import { Public } from '../../framework/security/jwt-auth.guard'
import { AuthService, type LoginResponseVO, type MenuTreeVO } from '../service/auth.service'

/**
 * 认证接口，逐条对齐 Java `AuthController`（前缀 `/api/auth`）。
 *
 * SecurityConfig 只对 `/api/auth/login` 与 `/api/v1/notifications/sse` 放行，
 * **`refresh` 与 `logout` 都需要认证** —— 这一点由黄金样本实测确认
 * （最初把 refresh 标成不需要认证，实测返回 401）。
 *
 * ⚠️ `@HttpCode(200)` 是**契约要求**，不是风格选择：
 *   NestJS 默认让 POST 返回 **201**，而 Spring MVC 默认返回 **200**。
 *   若不加，所有 POST 端点的 HTTP 状态码都会与 Java 不一致（实测踩到过）。
 *   **本项目所有 Controller 都必须带这个类级装饰器。**
 */
@Controller('api/auth')
@JavaStatusOk()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  async login(@Body() body: LoginBody): Promise<R<LoginResponseVO>> {
    const { username, password } = validateLoginBody(body)
    return R.ok(await this.authService.login(username, password))
  }

  @Post('logout')
  async logout(@Req() request: Request): Promise<R<null>> {
    void request
    this.authService.logout()
    return R.ok()
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }): Promise<R<LoginResponseVO>> {
    const refreshToken = body?.refreshToken
    if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      throw new ValidationError('refreshToken 不能为空')
    }
    return R.ok(await this.authService.refreshToken(refreshToken))
  }

  @Get('userinfo')
  async userinfo(@CurrentUser() user: LoginUser): Promise<R<LoginResponseVO>> {
    return R.ok(await this.authService.getCurrentUser(user.userId))
  }

  @Get('menus')
  async menus(@CurrentUser() user: LoginUser): Promise<R<MenuTreeVO[]>> {
    return R.ok(await this.authService.getCurrentUserMenus(user.userId))
  }
}

interface LoginBody {
  username?: unknown
  password?: unknown
}

/**
 * 登录参数校验，对齐 Java 的 `@NotBlank(message = "用户名不能为空")` / `"密码不能为空"`。
 *
 * ⚠️ 这里有一段**踩坑记录，改动前务必读完**：
 *   Java 的 GlobalExceptionHandler 取 `getFieldError()` 拿「第一个」字段错误，
 *   而这个「第一个」**在 JVM 之间并不稳定** —— 同一份请求体 `{username:"",password:""}`，
 *   先后两次录制分别返回 **"密码不能为空"** 与 **"用户名不能为空"**。
 *
 *   我最初只录了一次、看到是「密码」，就把校验顺序倒过来写；第二次录制立刻翻车。
 *   现在按**声明顺序**（username 先）校验，与最近两次连续录制一致。
 *
 *   → 结论：这一步天然可能 flaky。若**只有** loginBlank 失败，应先怀疑 Java 侧的非确定性，
 *     而不是先改实现。已记入规格风险清单 R15。
 */
function validateLoginBody(body: LoginBody): { username: string; password: string } {
  const username = body?.username
  if (typeof username !== 'string' || username.trim() === '') {
    throw new ValidationError('用户名不能为空')
  }
  const password = body?.password
  if (typeof password !== 'string' || password.trim() === '') {
    throw new ValidationError('密码不能为空')
  }
  return { username, password }
}
