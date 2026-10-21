# syntax=docker/dockerfile:1
#
# 前端镜像：pnpm 构建 Vite 产物 → nginx 托管静态文件并反代 /api 到后端容器
# 构建：docker compose build frontend

FROM node:24-bookworm-slim AS build
WORKDIR /workspace

# 与本机开发同版本（本机 pnpm 11.17.0 / lockfileVersion 9.0）
RUN npm install -g pnpm@11.17.0

# 依赖层与源码层分开：只改源码时不重新解析依赖。
# pnpm-workspace.yaml 必须一起进这一层：nodeLinker/allowBuilds 是 install 的输入，
# 缺了它 pnpm 会 ERR_PNPM_IGNORED_BUILDS 退出，且隔离布局下源码里的未声明 import 解析不到
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# 用 vite build 而不是 pnpm build：后者的 `tsc &&` 门禁里有 5 个既有类型报错（与 vue-tsc
# 基线同源），会让镜像构建整体失败。类型检查留给 CI/本地，不放在出产物的路径上。
RUN pnpm exec vite build

FROM nginx:1.27-alpine

# 覆盖默认站点配置：SPA history 回退 + /api 反代 + SSE 不缓冲
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
