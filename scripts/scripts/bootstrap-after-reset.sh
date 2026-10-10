#!/bin/bash
# ============================================================
# 工作流低代码平台 - 沙箱重置后一键恢复脚本（幂等）
#
# Task 15-R2 重构（Node 优先）：
#   主引擎自 Task 13 起为 backend-node（bun + Express + SQLite），
#   本脚本默认模式只恢复 Node 生态（前端/后端依赖 + 引擎标记），
#   不再无条件构建 Java 工具链——历史版本「默认 mvn 构建 jar」
#   曾导致发布重置后看门狗把用户劫持回 Java 引擎（worklog 14-R1）。
#
# 用法：
#   bash scripts/bootstrap-after-reset.sh                # Node 优先恢复（默认）
#   bash scripts/bootstrap-after-reset.sh --build-java   # 构建 Java 版工具链 + 恢复
#                                                        # （仅由门户页「一键构建」按钮调用）
#
# 持久化信号（Task 15-R1）：
#   backend-node/data/engine-choice 记录用户显式引擎选择（重置后幸存）；
#   默认模式尊重 choice=java 且 jar 存在的场景（不覆盖），其余一律写回 Node。
# ============================================================
set -u

TOOLS=/home/z/tools
BACKEND=/home/z/my-project/workflow_lowcode/backend
FRONTEND=/home/z/my-project/workflow_lowcode/frontend
NODE_BACKEND=/home/z/my-project/workflow_lowcode/backend-node
JAR="$BACKEND/target/workflow-platform-1.0.0-SNAPSHOT.jar"
JDK="$TOOLS/jdk21"
MAVEN="$TOOLS/maven"
ENGINE_CHOICE_FILE="$NODE_BACKEND/data/engine-choice"

MODE="node"
[ "${1:-}" = "--build-java" ] && MODE="java"

log() { echo "[bootstrap] $*"; }

read_choice() {
  local c=""
  [ -f "$ENGINE_CHOICE_FILE" ] && c=$(tr -d '[:space:]' < "$ENGINE_CHOICE_FILE" | tr '[:upper:]' '[:lower:]')
  echo "$c"
}

ensure_frontend_deps() {
  if [ -d "$FRONTEND/node_modules" ] && [ -x "$FRONTEND/node_modules/.bin/vite" ]; then
    log "前端依赖已存在，跳过"
  else
    log "安装前端依赖 (bun install)..."
    (cd "$FRONTEND" && bun install) || { log "bun install 失败"; exit 1; }
  fi
}

ensure_node_backend_deps() {
  if [ -d "$NODE_BACKEND/node_modules/express" ]; then
    log "Node 后端依赖已存在，跳过"
  else
    log "安装 Node 后端依赖 (bun install)..."
    (cd "$NODE_BACKEND" && bun install) || { log "Node 后端 bun install 失败"; exit 1; }
  fi
}

# ============================================================
# 默认模式：Node 优先恢复
# ============================================================
if [ "$MODE" = "node" ]; then
  CHOICE=$(read_choice)
  if [ "$CHOICE" = "java" ] && [ -f "$JAR" ]; then
    log "检测到持久化显式选择 = Java 版且 jar 存在，保持 Java 引擎不覆盖"
  else
    log "Node 引擎（主引擎）：写入持久化选择与引擎标记..."
    mkdir -p "$TOOLS" "$NODE_BACKEND/data"
    echo -n node > "$ENGINE_CHOICE_FILE" 2>/dev/null || true
    touch "$NODE_BACKEND/.engine-node" "$TOOLS/backend-engine-node" 2>/dev/null || true
  fi
  ensure_frontend_deps
  ensure_node_backend_deps
  log "调用 start-services.sh 拉起服务..."
  bash /home/z/my-project/scripts/start-services.sh
  log "恢复完成。验证：3000(网关) / 5173(Vite) / 8080(后端)"
  exit 0
fi

# ============================================================
# --build-java 模式：Java 版工具链构建（门户「一键构建」专用路径）
# 注意：本模式不写 engine-choice——构建 jar ≠ 切换引擎，
#       引擎切换必须经门户页 switchBackendEngine（显式写持久选择）。
# ============================================================

# ---- 架构识别（Adoptium 下载需要）----
case "$(uname -m)" in
  x86_64)  AARCH="x64" ;;
  aarch64) AARCH="aarch64" ;;
  *) log "未知架构 $(uname -m)，退出"; exit 1 ;;
esac

# ---- 1. JDK 21（系统自带 JRE 无 javac，构建必须用 JDK）----
if [ -x "$JDK/bin/javac" ]; then
  log "JDK 已存在，跳过 ($JDK)"
else
  log "下载 Temurin JDK 21 ($AARCH)..."
  mkdir -p "$TOOLS"
  curl -sL -o /tmp/jdk21.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/$AARCH/jdk/hotspot/normal/eclipse" \
    || { log "JDK 下载失败"; exit 1; }
  tar -xzf /tmp/jdk21.tar.gz -C "$TOOLS"
  SRC_DIR=$(tar -tzf /tmp/jdk21.tar.gz | head -1 | cut -d/ -f1)
  rm -rf "$JDK" && mv "$TOOLS/$SRC_DIR" "$JDK"
  rm -f /tmp/jdk21.tar.gz
  [ -x "$JDK/bin/javac" ] && log "JDK 就绪: $("$JDK/bin/javac" -version 2>&1)" || { log "JDK 安装校验失败"; exit 1; }
fi

# ---- 2. Maven ----
if [ -x "$MAVEN/bin/mvn" ]; then
  log "Maven 已存在，跳过 ($MAVEN)"
else
  # Task 13-R5：archive.apache.org 限速严重（曾挂起 15+ 分钟），改用 Maven Central CDN 首选；
  # curl 带 --max-time 防挂起 + --retry 抗抖动，失败回落原镜像
  log "下载 Maven 3.9.9（repo.maven.apache.org 高速镜像）..."
  mkdir -p "$TOOLS"
  curl -sL --max-time 600 --retry 2 -o /tmp/maven.tar.gz \
    "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.tar.gz" \
    || curl -sL --max-time 600 --retry 2 -o /tmp/maven.tar.gz \
    "https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz" \
    || { log "Maven 下载失败"; exit 1; }
  tar -xzf /tmp/maven.tar.gz -C "$TOOLS"
  rm -rf "$MAVEN" && mv "$TOOLS/apache-maven-3.9.9" "$MAVEN"
  rm -f /tmp/maven.tar.gz
  [ -x "$MAVEN/bin/mvn" ] && log "Maven 就绪" || { log "Maven 安装校验失败"; exit 1; }
fi

# ---- 3. 后端构建 ----
if [ -f "$JAR" ]; then
  log "后端 jar 已存在，跳过构建"
else
  log "构建后端 jar（首次构建需下载依赖，可能耗时数分钟）..."
  (cd "$BACKEND" && JAVA_HOME="$JDK" "$MAVEN/bin/mvn" -B -DskipTests package) \
    || { log "mvn package 失败"; exit 1; }
  [ -f "$JAR" ] && log "jar 就绪: $(du -h "$JAR" | cut -f1)" || { log "构建后未找到 jar"; exit 1; }
fi

# ---- 4. 拉起服务（内部自带探活、引擎决策与清场逻辑）----
ensure_frontend_deps
log "调用 start-services.sh 拉起服务..."
bash /home/z/my-project/scripts/start-services.sh

log "恢复完成。验证：3000(网关) / 5173(Vite) / 8080(后端)"
exit 0
