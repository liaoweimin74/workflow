#!/bin/bash
# ============================================================
# Task 147 图片组件后端端到端验证脚本（dev-147-deploy lane）
# 验证点：V52 列落库 / upload-image 尺寸回写 / 类型强校验 /
#         thumbnail 缩略图（缓存）/ preview / download
# ============================================================
set -u
BASE=http://127.0.0.1:8080/api
TENANT='X-Tenant-Id: default'
WORK=/tmp/task147-verify
mkdir -p "$WORK"

echo "== 0. V52 列落库检查 =="
/home/z/my-project/mariadb-user/root/bin/mariadb -S /home/z/my-project/mariadb-user/mysql.sock -D workflow \
  -e "SHOW COLUMNS FROM sys_attachment LIKE 'img%';" 2>&1 | sed 's/^/  /'

echo "== 1. 登录取 token =="
TOKEN=$(curl -s -m 10 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -H "$TENANT" \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('accessToken',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  # 兼容字段名变体
  TOKEN=$(curl -s -m 10 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -H "$TENANT" \
    -d '{"n":"n123"}' \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('accessToken',''))" 2>/dev/null)
fi
[ -n "$TOKEN" ] && echo "  token OK (${#TOKEN} chars)" || { echo "  LOGIN FAILED"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

echo "== 2. 生成测试图片（PNG 320x200 + 大尺寸 PNG 1200x900）=="
python3 - <<'PY'
from PIL import Image
Image.new('RGB', (320, 200), (66, 133, 244)).save('/tmp/task147-verify/small.png')
Image.new('RGB', (1200, 900), (219, 68, 55)).save('/tmp/task147-verify/large.png')
open('/tmp/task147-verify/evil.txt', 'w').write('not an image')
print('  fixtures ready')
PY

echo "== 3. upload-image 正常图片（期待 code=200 且 width/height 回写）=="
curl -s -m 30 -X POST "$BASE/attachments/upload-image" -H "$AUTH" -H "$TENANT" \
  -F "files=@$WORK/small.png;type=image/png" -F "bizType=verify147" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=',d.get('code'),'msg=',d.get('msg'),'data=',d.get('data'))"

echo "== 4. upload-image 非图片拒绝（期待 code!=200）=="
curl -s -m 30 -X POST "$BASE/attachments/upload-image" -H "$AUTH" -H "$TENANT" \
  -F "files=@$WORK/evil.txt;type=text/plain" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=',d.get('code'),'msg=',d.get('msg'))"

echo "== 5. 普通 upload 图片（对照：width/height 应为 null）=="
curl -s -m 30 -X POST "$BASE/attachments/upload" -H "$AUTH" -H "$TENANT" \
  -F "files=@$WORK/large.png;type=image/png" -F "bizType=verify147" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=',d.get('code'),'data=',d.get('data'))"

echo "== 6. 取最新两个 id，验证 thumbnail / preview / download =="
IDS=$(/home/z/my-project/mariadb-user/root/bin/mariadb -S /home/z/my-project/mariadb-user/mysql.sock -D workflow -N \
  -e "SELECT id FROM sys_attachment WHERE biz_type='verify147' AND is_deleted=0 ORDER BY id DESC LIMIT 2;" 2>/dev/null | tr '\n' ' ')
echo "  ids=[$IDS]"
for ID in $IDS; do
  echo "  --- attachment $ID ---"
  curl -s -o /dev/null -w '  thumbnail(w=100): code=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
    -m 30 "$BASE/attachments/$ID/thumbnail?w=100" -H "$AUTH" -H "$TENANT"
  curl -s -o /dev/null -w '  thumbnail cache : code=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
    -m 30 "$BASE/attachments/$ID/thumbnail?w=100" -H "$AUTH" -H "$TENANT"
  curl -s -o /dev/null -w '  preview         : code=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
    -m 30 "$BASE/attachments/$ID/preview" -H "$AUTH" -H "$TENANT"
  curl -s -o /dev/null -w '  download        : code=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
    -m 30 "$BASE/attachments/$ID/download" -H "$AUTH" -H "$TENANT"
  curl -s -o /dev/null -w '  meta(ids)       : code=%{http_code}\n' \
    -m 30 "$BASE/attachments?ids=$ID" -H "$AUTH" -H "$TENANT"
done

echo "== 7. 缩略图磁盘缓存文件 =="
ls -l /home/z/my-project/workflow_lowcode/backend/data/attachments/.thumbs/ 2>/dev/null | tail -5 || echo "  (no .thumbs dir —— 回退原图或路径不同)"

echo "== 8. 元数据 width/height 字段回读 =="
curl -s -m 10 "$BASE/attachments?ids=$(echo $IDS | tr ' ' ',')" -H "$AUTH" -H "$TENANT" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);[print('  id=',m['id'],'name=',m['fileName'],'size=',m['fileSize'],'w=',m.get('width'),'h=',m.get('height')) for m in (d.get('data') or [])]"
echo "DONE"
