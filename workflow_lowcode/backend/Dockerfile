# syntax=docker/dockerfile:1
#
# Java 后端镜像（Spring Boot 4 / Java 21 / Flowable 8）
# 构建：docker compose build backend（需 BuildKit，compose v2 默认开启 —— 依赖缓存挂载依赖它）
# 运行期只留 JRE + 可执行 jar；测试不在镜像构建门禁内（见 docs/ops 与本地 mvn test）。

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY . .

# -Dmaven.test.skip=true：既不跑测试也不编译测试源码（src/test 有既有失败用例，见仓库基线记录）
# 缓存挂载让重复构建不重新下载依赖；注意容器内没有本机 ~/.m2/settings.xml，
# 依赖直连 Maven Central（pom 里 maven-central-direct 仓库就是为此准备的）
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -Dmaven.test.skip=true package

FROM eclipse-temurin:21-jre-jammy

# curl 供健康检查使用；tzdata 让 TZ 生效（库连接串按 Asia/Shanghai 存时间）
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai \
    ATTACHMENT_STORAGE_PATH=/app/data/attachments \
    WORKFLOW_MATERIAL_STORAGE_PATH=/app/data/materials

WORKDIR /app
COPY --from=build /workspace/target/*.jar /app/app.jar
RUN mkdir -p /app/data

EXPOSE 8080

# GET /api/auth/login 返回 401/405 也算通过：curl 不带 -f，只要收到 HTTP 响应就退出 0，
# 连接被拒（进程没起来）才返回非 0
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -s -o /dev/null --max-time 3 http://127.0.0.1:8080/api/auth/login || exit 1

# 额外 JVM 参数用 JAVA_TOOL_OPTIONS 注入（JVM 原生读该环境变量，无需 shell 拼接）
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
