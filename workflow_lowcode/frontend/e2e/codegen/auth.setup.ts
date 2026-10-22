import { expect, test } from '@playwright/test'

import { AUTH_STATE } from '../../playwright.config'

/**
 * 双渲染两侧都要打后端接口（宿主吃活库定义、列表数据来自同一张业务表），所以先登录。
 * 走 dev server 的 /api 代理而不是 8080：这样 token 落在 127.0.0.1:5300 这个 origin 上，
 * storageState 才带得起来（直接打 8080 拿到的 token 存的是后端 origin，浏览器侧读不到）。
 *
 * 凭证默认用开发库的 admin，可用 E2E_USER/E2E_PASS 覆盖；写进 .auth/ 的文件不进 git。
 */
const USERNAME = process.env.E2E_USER || 'admin'
const PASSWORD = process.env.E2E_PASS || 'admin123'

test('登录并落 storageState', async ({ page, request }) => {
  const res = await request.post('/api/auth/login', {
    data: { username: USERNAME, password: PASSWORD },
  })
  expect(res.ok(), `登录接口没通：${await res.text()}`).toBeTruthy()

  const body = (await res.json()) as {
    code: number
    msg: string
    data?: { accessToken: string; refreshToken: string }
  }
  expect(body.code, `登录失败：${body.msg}`).toBe(200)
  const token = body.data?.accessToken
  expect(token, '响应里没有 accessToken').toBeTruthy()

  // 必须先停在同一 origin，localStorage 才会被 storageState 收录；/login 是 meta.public 免登录
  await page.goto('/login')
  await page.evaluate(([access, refresh]) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
  }, [token, body.data!.refreshToken])

  await page.context().storageState({ path: AUTH_STATE })
})
