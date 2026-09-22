#!/bin/bash
# ============================================================
# UI 改造一键回滚脚本（Task 16 备份点）
# 用法：bash scripts/rollback-ui.sh [备份时间戳]
#   不带参数 = 使用最新备份；示例：bash scripts/rollback-ui.sh 20260922-111422
# ============================================================
set -euo pipefail

BACKUP_DIR=/home/z/my-project/backups
TS="${1:-}"

if [ -z "$TS" ]; then
  TS=$(ls -1 "$BACKUP_DIR"/frontend-ui-backup-*.tar.gz 2>/dev/null | sort | tail -1 | sed -E 's/.*frontend-ui-backup-([0-9-]+)\.tar\.gz/\1/')
fi
[ -z "$TS" ] && { echo "未找到任何备份"; exit 1; }

FRONTEND_TGZ="$BACKUP_DIR/frontend-ui-backup-$TS.tar.gz"
PORTAL_TGZ="$BACKUP_DIR/portal-ui-backup-$TS.tar.gz"
[ -f "$FRONTEND_TGZ" ] || { echo "备份不存在: $FRONTEND_TGZ"; exit 1; }

echo "回滚到备份点 $TS ..."
rm -rf /home/z/my-project/workflow_lowcode/frontend/src
tar -xzf "$FRONTEND_TGZ" -C /home/z/my-project/workflow_lowcode/frontend
if [ -f "$PORTAL_TGZ" ]; then
  tar -xzf "$PORTAL_TGZ" -C /home/z/my-project
fi
echo "✅ 已回滚。刷新浏览器即可看到旧版界面（Vite 热更新自动生效）。"
