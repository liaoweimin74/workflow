#!/usr/bin/env bash
# ============================================================================
# patch-flowable-h2.sh —— Flowable 8.0.0 H2 脚本兼容 H2 2.x（沙箱运行时补丁）
#
# 背景（2026-10-01，Task 125）：
#   Flowable 8.0.0 的 H2 建表脚本使用 `identity` 列类型（H2 1.4 语法）。
#   H2 2.x 已删除该类型（保留 GENERATED ... AS IDENTITY 语法），导致
#   Spring Boot 4（托管 h2-2.4.240）+ Flowable 8.0.0 组合在 H2 上
#   Flowable schema create 阶段必然失败：
#     Unknown data type: "IDENTITY"  →  ACT_ 表部分创建 → 后续每次启动
#     dbVersionProperty is null NPE → Java 后端无法启动（崩溃循环）。
#   本项目正式部署用 MySQL（flowable.mysql 脚本，无此问题）；仅沙箱
#   sandbox profile（H2）受影响，故对 ~/.m2 内两个 flowable jar 打
#   机器本地补丁（identity → bigint auto_increment，H2 2.x MySQL 模式等价）。
#
# 幂等：已补丁（无残留 identity 列类型）则跳过。
# 重打包：补丁后需 mvn -DskipTests package 重刷 fat jar 的 BOOT-INF/lib。
# ============================================================================
set -euo pipefail

M2="${HOME}/.m2/repository/org/flowable"
JDK_JAR="${JDK_JAR:-${HOME}/tools/jdk21/bin/jar}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# (jar 相对路径, 脚本类路径)
TARGETS=(
  "flowable-engine-common/8.0.0/flowable-engine-common-8.0.0.jar org/flowable/common/db/create/flowable.h2.create.common.sql"
  "flowable-engine/8.0.0/flowable-engine-8.0.0.jar org/flowable/db/create/flowable.h2.create.engine.sql"
)

for spec in "${TARGETS[@]}"; do
  rel="$(echo "$spec" | awk '{print $1}')"
  script="$(echo "$spec" | awk '{print $2}')"
  jar="${M2}/${rel}"
  name="$(basename "$rel")"
  if [ ! -f "$jar" ]; then
    echo "[patch-flowable-h2] 跳过（jar 不存在）: $jar"
    continue
  fi
  # 已补丁判定：脚本内不再有「列名 identity,」形态
  if ! unzip -p "$jar" "$script" | grep -qE " identity,? *$"; then
    echo "[patch-flowable-h2] 已是补丁态，跳过: $name $script"
    continue
  fi
  mkdir -p "$WORK/$name/$(dirname "$script")"
  unzip -p "$jar" "$script" > "$WORK/$name/$script"
  sed -i 's/ identity,/ bigint auto_increment,/; s/ identity$/ bigint auto_increment/' "$WORK/$name/$script"
  ( cd "$WORK/$name" && "$JDK_JAR" uf "$jar" "$script" )
  echo "[patch-flowable-h2] 已补丁: $name :: $script（identity → bigint auto_increment）"
done

echo "[patch-flowable-h2] 完成。如用于 fat jar，请重跑：mvn -DskipTests package"
