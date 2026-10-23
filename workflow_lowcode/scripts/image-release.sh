#!/usr/bin/env bash
# 镜像打包 + 推送到阿里云容器镜像服务（ACR 个人版）的一体化入口。
#
# docker daemon 在 WSL，所以从 Windows 侧这样跑：
#   wsl -u root bash /mnt/d/aicode/workflow_zai/workflow_lowcode/scripts/image-release.sh              # 两个镜像
#   wsl -u root bash .../scripts/image-release.sh backend                                             # 只 backend
#   IMAGE_TAG=v1.0.0 wsl -u root bash .../scripts/image-release.sh                                     # 指定版本 tag
#   NO_PUSH=1 wsl -u root bash .../scripts/image-release.sh                                            # 只打包不推远程
#
# 做的事：docker compose build → 按 ${ACR_REGISTRY}/${ACR_NAMESPACE}/<仓库>:<tag> 追加 tag（同时更新
# :latest）→ docker push。compose 里的 image: 仍是本地名，本地 up 不依赖 namespace。
#
# 凭据：密码只从环境变量 DOCKER_REPO_KEY 读取（Windows 用户级环境变量也能取到），经
# --password-stdin 交给 docker；不写进仓库任何文件，也不进 .env（避免被 compose 注入后端容器）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 优先真实环境变量，其次 .env（compose 同源），空则用默认
envval() {
  local key="$1" dflt="${2-}"
  if [ -n "${!key-}" ]; then printf '%s' "${!key}"; return; fi
  if [ -f .env ]; then
    local v
    v="$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
    if [ -n "$v" ]; then printf '%s' "$v"; return; fi
  fi
  printf '%s' "$dflt"
}

# ACR 全名 = 仓库地址/命名空间/前缀-服务名:tag
ACR_REGISTRY="$(envval ACR_REGISTRY crpi-n1ozehviwgruhtx0.cn-hangzhou.personal.cr.aliyuncs.com)"
ACR_NAMESPACE="$(envval ACR_NAMESPACE)"
ACR_USER="$(envval ACR_USER)"
ACR_PREFIX="$(envval ACR_REPO_PREFIX workflow-lowcode)"
LOCAL_PREFIX="workflow-lowcode"
NO_PUSH="${NO_PUSH:-0}"

IMAGE_TAG="$(envval IMAGE_TAG "$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M)")"

targets=()
for a in "$@"; do
  case "$a" in
    backend|frontend) targets+=("$a") ;;
    *) echo "用法: $0 [backend|frontend ...]（缺省两个都打）" >&2; exit 2 ;;
  esac
done
[ ${#targets[@]} -gt 0 ] || targets=(backend frontend)

echo "== 打包: ${targets[*]}  tag=${IMAGE_TAG}"
docker compose build "${targets[@]}"

if [ "$NO_PUSH" = "1" ]; then
  echo "== NO_PUSH=1，跳过推送"
  exit 0
fi

missing=()
[ -n "$ACR_REGISTRY" ] || missing+=(ACR_REGISTRY)
[ -n "$ACR_NAMESPACE" ] || missing+=(ACR_NAMESPACE)
[ -n "$ACR_USER" ] || missing+=(ACR_USER)
if [ ${#missing[@]} -gt 0 ]; then
  echo "缺少配置: ${missing[*]}（写在 .env 或环境变量里，见 .env.example 的「镜像仓库」段）" >&2
  exit 2
fi

PASS="${DOCKER_REPO_KEY:-}"
if [ -z "$PASS" ]; then
  # WSL 的 interop 关掉了 PATH 里的 Windows 目录（appendWindowsPath=false），用绝对路径
  PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
  if [ -x "$PS" ]; then
    PASS="$("$PS" -NoProfile -Command '[Environment]::GetEnvironmentVariable("DOCKER_REPO_KEY","User")' 2>/dev/null | tr -d '\r\n' || true)"
  fi
fi
if [ -z "$PASS" ]; then
  echo "取不到 DOCKER_REPO_KEY：在 Windows 用户环境变量里设好，或 export 后再跑" >&2
  exit 2
fi

printf '%s' "$PASS" | docker login "$ACR_REGISTRY" --username "$ACR_USER" --password-stdin >/dev/null
echo "== 已登录 $ACR_REGISTRY"

for t in "${targets[@]}"; do
  for tag in "$IMAGE_TAG" latest; do
    ref="$ACR_REGISTRY/$ACR_NAMESPACE/$ACR_PREFIX-$t:$tag"
    docker tag "$LOCAL_PREFIX-$t:latest" "$ref"
    docker push "$ref"
    echo "   推送 $ref"
  done
done

echo "== 完成。要在别机部署：docker pull 上述 ref 后 compose up -d"
echo "   推送被拒时先确认 ACR 控制台里命名空间已建（个人版需开「自动创建仓库」或手建同名仓库）"
