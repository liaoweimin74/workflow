#!/usr/bin/env bash
# 一键推送 workflow 仓库到 GitHub（需要用户提供 PAT）
# 用法: bash push-with-token.sh <GITHUB_PAT>
#   PAT 需对 liaoweimin74/workflow 仓库有 push 权限（classic: repo scope；fine-grained: Contents: RW）
set -euo pipefail
REPO_DIR="/home/z/my-project"
ORIG_URL="https://github.com/liaoweimin74/workflow.git"

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: 缺少参数 <GITHUB_PAT>"; echo "用法: bash $0 <GITHUB_PAT>"; exit 1
fi

cd "$REPO_DIR"
echo "== 当前状态 =="
git log --oneline -1
echo "ahead/behind(origin/main): $(git rev-list --left-right --count origin/main...main)"

echo "== 使用临时凭证推送（不落盘，推完恢复原 URL）=="
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/liaoweimin74/workflow.git"
trap 'git remote set-url origin "$ORIG_URL"; echo "== 已恢复 origin URL（凭证不残留）==";' EXIT

GIT_TERMINAL_PROMPT=0 git push origin main 2>&1 | sed "s/${TOKEN}/<TOKEN>/g"

echo "== 核验 =="
git fetch origin >/dev/null 2>&1
if [ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ]; then
  echo "PASS: origin/main == main == $(git rev-parse main)，推送成功"
else
  echo "WARN: 推送后不一致 main=$(git rev-parse main) origin/main=$(git rev-parse origin/main)"
  exit 1
fi
