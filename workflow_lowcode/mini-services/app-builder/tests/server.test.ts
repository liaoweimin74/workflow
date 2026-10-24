// Task 9.2 Step 3——app-builder HTTP 服务测试。
// 覆盖：/health、/build 形状校验（400）、构建成功（200 + artifactUrl）、
// 构建失败（500 + error）、未知路径 404；buildFn 注入替身，不真跑 uni build。
// Task 9.3 追加：/upload（体验版上传）成功/失败/形状校验；uploadFn 注入替身。
import { describe, expect, it } from 'vitest'
import { createAppBuilderServer, handleBuild, handleUpload } from '../src/server'

function listen(server: ReturnType<typeof createAppBuilderServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

async function post(port: number, pathName: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

const okBuild = {
  projectRoot: '/tmp/ignored',
  archiveRoot: '/tmp/ignored',
  buildFn: async () => ({ ok: true as const, artifactUrl: '/artifacts/rel1/h5', artifactPath: '/x/rel1/h5', output: '' }),
}

describe('createAppBuilderServer 路由', () => {
  it('GET /health 探活', async () => {
    const server = createAppBuilderServer({ projectRoot: 'x', archiveRoot: 'y' })
    const port = await listen(server)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, service: 'app-builder' })
    } finally {
      server.close()
    }
  })

  it('POST /build 成功 → 200 {ok:true, artifactUrl}', async () => {
    const server = createAppBuilderServer({ ...okBuild })
    const port = await listen(server)
    try {
      const { status, json } = await post(port, '/build', {
        releaseId: 'rel1',
        platform: 'h5',
        files: { 'src/pages.json': '{}' },
      })
      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.artifactUrl).toBe('/artifacts/rel1/h5')
    } finally {
      server.close()
    }
  })

  it('构建失败 → 500 {ok:false, error 可追溯}', async () => {
    const server = createAppBuilderServer({
      projectRoot: 'x',
      archiveRoot: 'y',
      buildFn: async () => ({ ok: false as const, error: 'uni build 失败（exit 1）：template syntax' }),
    })
    const port = await listen(server)
    try {
      const { status, json } = await post(port, '/build', {
        releaseId: 'rel2',
        platform: 'mp-weixin',
        files: { 'src/pages.json': '{}' },
      })
      expect(status).toBe(500)
      expect(json.ok).toBe(false)
      expect(json.error).toContain('uni build 失败')
    } finally {
      server.close()
    }
  })

  it('形状校验：缺 releaseId / platform / files → 400', async () => {
    const server = createAppBuilderServer({ ...okBuild })
    const port = await listen(server)
    try {
      const cases = [
        { platform: 'h5', files: {} },
        { releaseId: 'rel1', files: {} },
        { releaseId: 'rel1', platform: 'h5' },
      ]
      for (const body of cases) {
        const { status, json } = await post(port, '/build', body)
        expect(status, JSON.stringify(body)).toBe(400)
        expect(json.ok).toBe(false)
      }
    } finally {
      server.close()
    }
  })

  it('未知路径 404、请求体非法 JSON 400', async () => {
    const server = createAppBuilderServer({ ...okBuild })
    const port = await listen(server)
    try {
      const notFound = await fetch(`http://127.0.0.1:${port}/nope`)
      expect(notFound.status).toBe(404)

      const res = await fetch(`http://127.0.0.1:${port}/build`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{broken',
      })
      expect(res.status).toBe(400)
    } finally {
      server.close()
    }
  })
})

describe('handleBuild 直调（不占端口）', () => {
  it('透传 releaseId/platform/files 给 buildFn', async () => {
    const seen: Array<Record<string, unknown>> = []
    const { status, payload } = await handleBuild(
      { releaseId: 'rel9', platform: 'mp-weixin', buildConfig: { appid: 'wx1' }, files: { 'src/pages.json': '{}' } },
      {
        projectRoot: 'p',
        archiveRoot: 'a',
        buildFn: async (input) => {
          seen.push({ ...input })
          return { ok: true as const, artifactUrl: '/artifacts/rel9/mp-weixin', artifactPath: '/a/rel9/mp-weixin', output: '' }
        },
      },
    )
    expect(status).toBe(200)
    expect((payload as any).ok).toBe(true)
    expect(seen[0].releaseId).toBe('rel9')
    expect(seen[0].platform).toBe('mp-weixin')
    expect(seen[0].files).toEqual({ 'src/pages.json': '{}' })
  })
})

// ---------- Task 9.3：/upload 体验版上传 ----------

const okUpload = {
  archiveRoot: '/tmp/ignored',
  uploadFn: async () => ({ ok: true as const, qrUrl: '/artifacts/rel1/qr.png', qrPath: '/artifacts/rel1/qr.png' }),
}

describe('createAppBuilderServer /upload 路由', () => {
  it('POST /upload 成功 → 200 {ok:true, qrUrl}', async () => {
    const server = createAppBuilderServer({ projectRoot: 'p', archiveRoot: 'a', ...okUpload })
    const port = await listen(server)
    try {
      const { status, json } = await post(port, '/upload', {
        releaseId: 'rel1',
        appId: 'wx1234',
        privateKeyPath: '/keys/wx1234.key',
        version: '3',
      })
      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.qrUrl).toBe('/artifacts/rel1/qr.png')
    } finally {
      server.close()
    }
  })

  it('上传失败 → 500 {ok:false, error 可追溯}', async () => {
    const server = createAppBuilderServer({
      projectRoot: 'p',
      archiveRoot: 'a',
      uploadFn: async () => ({ ok: false as const, error: 'invalid ip, not in whitelist' }),
    })
    const port = await listen(server)
    try {
      const { status, json } = await post(port, '/upload', {
        releaseId: 'rel2',
        appId: 'wx1',
        privateKeyPath: '/k.key',
      })
      expect(status).toBe(500)
      expect(json.ok).toBe(false)
      expect(json.error).toContain('invalid ip')
    } finally {
      server.close()
    }
  })

  it('形状校验：缺 releaseId / appId / privateKeyPath → 400', async () => {
    const server = createAppBuilderServer({ projectRoot: 'p', archiveRoot: 'a', ...okUpload })
    const port = await listen(server)
    try {
      const cases = [
        { appId: 'wx1', privateKeyPath: '/k.key' },
        { releaseId: 'rel1', privateKeyPath: '/k.key' },
        { releaseId: 'rel1', appId: 'wx1' },
      ]
      for (const body of cases) {
        const { status, json } = await post(port, '/upload', body)
        expect(status, JSON.stringify(body)).toBe(400)
        expect(json.ok).toBe(false)
      }
    } finally {
      server.close()
    }
  })
})

describe('handleUpload 直调（不占端口）', () => {
  it('透传 archiveRoot/releaseId/platform/appId/privateKeyPath 给 uploadFn', async () => {
    const seen: Array<Record<string, unknown>> = []
    const { status, payload } = await handleUpload(
      { releaseId: 'rel9', platform: 'mp-weixin', appId: 'wx9', privateKeyPath: '/k9.key', version: 'v9', desc: '体验版 v9' },
      {
        archiveRoot: 'a',
        uploadFn: async (input) => {
          seen.push({ ...input })
          return { ok: true as const, qrUrl: '/artifacts/rel9/qr.png', qrPath: '/a/rel9/qr.png' }
        },
      },
    )
    expect(status).toBe(200)
    expect((payload as any).ok).toBe(true)
    expect((payload as any).qrUrl).toBe('/artifacts/rel9/qr.png')
    expect(seen[0]).toMatchObject({
      archiveRoot: 'a',
      releaseId: 'rel9',
      platform: 'mp-weixin',
      appId: 'wx9',
      privateKeyPath: '/k9.key',
      version: 'v9',
      desc: '体验版 v9',
    })
  })
})
