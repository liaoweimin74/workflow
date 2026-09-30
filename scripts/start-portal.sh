#!/bin/bash
# 门户 3000 幂等重启（OOM 铁律⑦配套：3000 挂掉时一键恢复）
# 用法: bash scripts/start-portal.sh
# 探活注意：Next 冷启动编译可达 17s+，超时必须放宽并双次确认，否则会误杀编译中的健康进程
cd /home/z/my-project || exit 1
alive() { local c; c=$(curl -s -o /dev/null -m 20 -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null); [ "$c" != "000" ] && [ -n "$c" ]; }
if alive; then echo "[start-portal] 门户已存活，跳过"; exit 0; fi
sleep 3
if alive; then echo "[start-portal] 门户已存活（二次确认，编译慢而已），跳过"; exit 0; fi
# 确认死亡后才清场：只匹配门户 dev 脚本的 next 进程
pkill -f "next dev -p 3000" 2>/dev/null; sleep 2
echo "[start-portal] 启动门户…"
nohup bun run dev >> dev.log 2>&1 &
for i in $(seq 1 16); do
  sleep 5
  if alive; then echo "[start-portal] 门户已恢复 (等待 $((i*5))s)"; exit 0; fi
done
echo "[start-portal] 启动失败，请查 dev.log"; exit 1
