// ----- TDD: 发布链路 api 契约（Task 8.3 前端首个消费方） -----
// npx vitest run src/api/__tests__/release.test.ts
//
// 只钉路径/方法/请求体：路径拼错在单测里暴露，好过在 8082 上撞 404。
// 路径口径对齐后端：/api/v1/apps/{appId}/clients[/{clientId}[/pages|/releases[/{releaseId}[/build|/upload]]]

import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/utils/http', () => ({ default: httpMock }))

import { releaseApi } from '@/api/release'

const ok = (data: any) => ({ code: 200, data, msg: 'ok' })

describe('releaseApi — 发布链路 api 契约', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    httpMock.get.mockResolvedValue(ok([]))
    httpMock.post.mockResolvedValue(ok({}))
  })

  it('listClients：GET /v1/apps/{appId}/clients', async () => {
    await releaseApi.listClients('app1')
    expect(httpMock.get).toHaveBeenCalledWith('/v1/apps/app1/clients')
  })

  it('listClientPages：GET /v1/apps/{appId}/clients/{clientId}/pages（启用清单）', async () => {
    await releaseApi.listClientPages('app1', 'c1')
    expect(httpMock.get).toHaveBeenCalledWith('/v1/apps/app1/clients/c1/pages')
  })

  it('createRelease：POST /releases（无请求体——快照由后端按启用清单固化）', async () => {
    await releaseApi.createRelease('app1', 'c1')
    expect(httpMock.post).toHaveBeenCalledWith('/v1/apps/app1/clients/c1/releases')
  })

  it('buildRelease：POST /releases/{id}/build，files 序列化成字符串（后端 String 契约）', async () => {
    await releaseApi.buildRelease('app1', 'c1', 'r1', { 'src/pages.json': '{}' })
    expect(httpMock.post).toHaveBeenCalledWith('/v1/apps/app1/clients/c1/releases/r1/build', {
      files: JSON.stringify({ 'src/pages.json': '{}' }),
    })
  })

  it('uploadRelease：POST /releases/{id}/upload（凭证按 Client，请求体不带凭证）', async () => {
    await releaseApi.uploadRelease('app1', 'c1', 'r1')
    expect(httpMock.post).toHaveBeenCalledWith('/v1/apps/app1/clients/c1/releases/r1/upload')
  })
})