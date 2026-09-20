#!/bin/bash
# ============================================================
# 工作流低代码平台 - 沙箱重置后一键恢复脚本（幂等）
#
# 背景（worklog Task 6）：沙箱工作区可能被重置，丢失
#   - /home/z/tools/jdk21、/home/z/tools/maven（工具链）
#   - backend/target/*.jar（后端构建产物）
#   - frontend/node_modules（前端依赖）
# 本脚本检测缺失项并自动重建，最后调用 start-services.sh 拉起服务。
# 重复执行安全：所有步骤均先检测再动作。
#
# 用法：bash /home/z/my-project/scripts/bootstrap-after-reset.sh
# ============================================================
set -u

TOOLS=/home/z/tools
BACKEND=/home/z/my-project/workflow_lowcode/backend
FRONTEND=/home/z/my-project/workflow_lowcode/frontend
JAR="$BACKEND/target/workflow-platform-1.0.0-SNAPSHOT.jar"
JDK="$TOOLS/jdk21"
MAVEN="$TOOLS/maven"

log() { echo "[bootstrap] $*"; }

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

# ---- 3. 前端依赖 ----
if [ -d "$FRONTEND/node_modules" ] && [ -x "$FRONTEND/node_modules/.bin/vite" ]; then
  log "前端依赖已存在，跳过"
else
  log "安装前端依赖 (bun install)..."
  (cd "$FRONTEND" && bun install) || { log "bun install 失败"; exit 1; }
fi

# ---- 4. 后端构建 ----
if [ -f "$JAR" ]; then
  log "后端 jar 已存在，跳过构建"
else
  log "构建后端 jar（首次构建需下载依赖，可能耗时数分钟）..."
  (cd "$BACKEND" && JAVA_HOME="$JDK" "$MAVEN/bin/mvn" -B -DskipTests package) \
    || { log "mvn package 失败"; exit 1; }
  [ -f "$JAR" ] && log "jar 就绪: $(du -h "$JAR" | cut -f1)" || { log "构建后未找到 jar"; exit 1; }
fi

# ---- 5. 拉起服务（内部自带探活与清场逻辑）----
log "调用 start-services.sh 拉起服务..."
bash /home/z/my-project/scripts/start-services.sh

log "恢复完成。验证：3000(网关) / 5173(Vite) / 8080(后端)"
exit 0
