#!/usr/bin/env python3
"""修复 BizData 测试的 BizDataService 构造调用：补第 8 参 FormLogicBindingService mock。"""
import re

MOCK = "mock(com.workflow.engine.logicflow.service.FormLogicBindingService.class)"
FILES = [
    "/home/z/my-project/workflow_lowcode/backend/src/test/java/com/workflow/engine/form/bizdata/BizDataHandlerTest.java",
    "/home/z/my-project/workflow_lowcode/backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java",
]
# 匹配构造调用第二行：以 List.of(...)); 或 List.of(...))) 结尾
TAIL = re.compile(r'^(\s*new ObjectMapper\(\), .*List\.of\([^)]*\))(\)+);\s*$')

for path in FILES:
    lines = open(path).read().split("\n")
    changed = 0
    prev_is_ctor = False
    for i, line in enumerate(lines):
        if "new BizDataService(jdbcTemplate" in line:
            prev_is_ctor = True
            continue
        if prev_is_ctor:
            m = TAIL.match(line)
            if m:
                lines[i] = f"{m.group(1)}, {MOCK}{m.group(2)};"
                changed += 1
            prev_is_ctor = False
    open(path, "w").write("\n".join(lines))
    print(f"{path.split('/')[-1]}: {changed} call sites fixed")
