import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 【远程物料 import map（change: remote-materials，design D2）】
// 物料 bundle 里 import 的是裸模块名（vue / element-plus / @platform/sdk），
// 浏览器按 index.html 的 import map 把它们解析到宿主自身的模块 URL：
// - dev：直接指向 shim 源文件，vite 按普通模块编译（'vue' 走同一份预优化依赖 → 单实例）
// - build：shim 作为额外 entry 被打包，取实际产出的 chunk 文件名（带 hash）写入 map
const MATERIAL_HOST_SHIMS: Record<string, string> = {
  'vue': 'src/platform/hosts/vue-host.ts',
  'element-plus': 'src/platform/hosts/element-plus-host.ts',
  '@platform/sdk': 'src/platform/hosts/sdk-host.ts'
}

function materialImportMap(): PluginOption {
  return {
    name: 'material-import-map',
    config(config) {
      // 把 shim 注册为额外构建 entry（保留 index.html 作为默认 entry）
      const input: Record<string, string> = { main: 'index.html' }
      for (const [spec, file] of Object.entries(MATERIAL_HOST_SHIMS)) {
        input[spec.replace('@', '').replace('/', '-')] = path.resolve(__dirname, file)
      }
      void config
      return {
        build: {
          // preserveEntrySignatures 是 input 级选项（放 output 下会被忽略）：
          // shim entry 必须保留 re-export 签名，否则物料 import { ref } from 'vue' 取不到导出
          rollupOptions: {
            input,
            preserveEntrySignatures: 'allow-extension'
          }
        }
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const imports: Record<string, string> = {}
        if (ctx.server) {
          for (const [spec, file] of Object.entries(MATERIAL_HOST_SHIMS)) {
            imports[spec] = '/' + file
          }
        } else {
          const bundle = ctx.bundle
          if (!bundle) return []
          for (const [spec, file] of Object.entries(MATERIAL_HOST_SHIMS)) {
            const chunk = Object.values(bundle).find(
              (item) =>
                item.type === 'chunk' &&
                !!item.facadeModuleId &&
                item.facadeModuleId.replace(/\\/g, '/').endsWith(file)
            )
            if (!chunk) {
              this.error(`物料 import map 缺少宿主 chunk: ${file}`)
            }
            imports[spec] = '/' + (chunk as { fileName: string }).fileName
          }
        }
        return [
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            // map 必须先于任何 module 脚本出现
            injectTo: 'head-prepend',
            children: JSON.stringify({ imports })
          }
        ]
      }
    }
  }
}

// 【D+ 架构（用户 2026-10-08 定调）：低代码 vite 独占 3000】
// - Next.js 门户（next-server）按方案不再启动，节省约 1.5GB 内存；
//   原 reviveNextDev 看门狗随之移除（它的职责是把 next dev 拉回来，与方案相悖）。
// - vite 直接监听 3000，应用位于根路径（base=/），旧 /lowcode/ 路径随之作废；
//   router/http 均取 import.meta.env.BASE_URL，base 变更自动生效。
// - /api 反代到 8080 后端（用户口径「java 后端」，实际 node dist/main.js 引擎）。
// - allowedHosts 放行全部 Host：沙箱为内网开发服务，预览域名不固定；
//   外域探测（fcapp.run Host 头）与 preview-*.space-z.ai 预览均依赖此放行。
export default defineConfig({
  base: '/',
  // 内联空 PostCSS 配置：阻止 Vite 向上搜索到工作区根目录的 postcss.config.mjs
  // （那是 Next.js 门户的配置，依赖 @tailwindcss/postcss，本项目未安装 →
  //  "Invalid PostCSS Plugin found at: plugins[0]" 崩溃）。样式走 @tailwindcss/vite 插件。
  css: {
    postcss: {}
  },
  plugins: [vue(), tailwindcss(), materialImportMap()],
  build: {
    rollupOptions: {
      // 宿主 shim 被登记成额外 entry 后，Rollup 会把 element-plus 的传递依赖（@floating-ui）
      // 归进 shim 的 entry chunk，于是「shim chunk ↔ 库 chunk」互相 import。
      // 库 chunk 先求值时 shim 里的绑定还是 undefined，浏览器抛 "x is not a function"，
      // main.ts 的 app.mount 根本执行不到（dev 走源码不做分块，所以只在生产构建复现）。
      // 显式把 element-plus 与其依赖并到一个 chunk 断环。
      output: {
        manualChunks(id) {
          if (id.includes('platform/hosts/element-plus-host.ts')) return 'element-plus'
          if (/node_modules[\\/](?:element-plus|@floating-ui)[\\/]/.test(id)) return 'element-plus'
        }
      }
    }
  },
  optimizeDeps: {
    // @codemirror/lang-javascript 的 npm dist 预打包了 @codemirror/state/language 的完整副本；
    // esbuild 依赖预优化在特定分块形态下会把它内联成零 import 的自包含 chunk，
    // 产生第二个 CodeMirror 实例 → lang='groovy'（SCRIPT 节点）的 javascript() 扩展对象
    // 无法通过 EditorState.create 的 instanceof 校验（Unrecognized extension value）
    // → SCRIPT 面板挂载崩溃 → 整个画布瘫痪。
    // exclude 后该包走源码 ESM，其 import '@codemirror/state' 复用统一的优化 chunk（单实例）。
    exclude: ['@codemirror/lang-javascript']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // FcDesigner 使用项目内 vendor 源码（支持表单配置页签 formConfigExtra slot 扩展）
      '@form-create/designer': path.resolve(__dirname, 'src/vendor'),
      // 【真机探测 spike，未合并】出码产物按 @lc/runtime/<tag> 引用 runtime 组件，
      // @lc/runtime 包尚未抽出，先由 src/lc-runtime/ shim 指向现网真实组件
      '@lc/runtime': path.resolve(__dirname, 'src/lc-runtime')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
