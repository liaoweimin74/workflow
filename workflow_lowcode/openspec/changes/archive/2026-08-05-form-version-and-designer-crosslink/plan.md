## File Structure

### 新增文件
- `backend/src/main/resources/db/migration/V16__clear_form_def_data.sql` — 清空 wf_form_def 表数据

### 修改文件
- `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java` — 重写 `update()` 和 `publish()`
- `backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java` — 新增 `findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc` 方法
- `backend/src/test/java/com/workflow/engine/form/FormDefinitionServiceTest.java` — 改写测试用例
- `frontend/src/views/designer/properties/FormPropertyTab.vue` — 加"编辑表单"跳转按钮
- `frontend/src/views/form/FormDesigner.vue` — handleBack() 支持 returnTo

---

## Task 1: 数据库迁移

### 1.1 创建 Flyway 清空脚本

创建 `backend/src/main/resources/db/migration/V16__clear_form_def_data.sql`：

```sql
-- 清空表单定义表数据（版本号语义变更，旧数据不兼容新规则）
DELETE FROM wf_form_def;
-- 重置自增（如果表有自增列的话）
-- wf_form_def 使用 UUID 主键，无 AUTO_INCREMENT，无需重置
```

**验证**: 启动后端，确认 Flyway 迁移成功无报错。

**提交点**: `chore(db): V16 清空 wf_form_def 表数据`

---

## Task 2: 后端 — 表单版本号语义改造

### 2.1 新增 Repository 方法

在 `FormDefinitionRepository.java` 新增方法，查找指定 key 的最近 PUBLISHED 记录：

```java
Optional<FormDefinition> findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
    String tenantId, String key, String status);
```

**验证**: 项目编译通过 `mvn compile -q`。

### 2.2 重写 update() — RED

在 `FormDefinitionServiceTest.java` 中替换现有的 `update` 测试用例。

**删除旧测试**（创建新版本的那个），**新增以下测试**：

```java
@Test
void update_draftForm_inPlaceUpdate_noNewVersion() {
    FormDefinition existing = new FormDefinition();
    existing.setId("form-1");
    existing.setTenantId(TENANT_ID);
    existing.setKey("leave-form");
    existing.setName("请假表单");
    existing.setSchema("[]");
    existing.setVersion(1);
    existing.setStatus("DRAFT");

    when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
        .thenReturn(Optional.of(existing));

    FormDefinition result = formDefService.update("form-1", "[{\"field\":\"reason\"}]");

    assertEquals("form-1", result.getId());
    assertEquals(1, result.getVersion());
    assertEquals("DRAFT", result.getStatus());
    assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
    verify(formDefRepository).save(existing);
}

@Test
void update_publishedForm_createsDraftCopy() {
    FormDefinition published = new FormDefinition();
    published.setId("form-1");
    published.setTenantId(TENANT_ID);
    published.setKey("leave-form");
    published.setName("请假表单");
    published.setSchema("[]");
    published.setVersion(2);
    published.setStatus("PUBLISHED");

    when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
        .thenReturn(Optional.of(published));

    FormDefinition result = formDefService.update("form-1", "[{\"field\":\"reason\"}]");

    assertNotEquals("form-1", result.getId());
    assertEquals(2, result.getVersion());
    assertEquals("DRAFT", result.getStatus());
    assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
    assertEquals("leave-form", result.getKey());
    verify(formDefRepository).save(any(FormDefinition.class));
    // 原 PUBLISHED 记录不被修改
    assertEquals("PUBLISHED", published.getStatus());
}
```

**验证**: `mvn test -Dtest=FormDefinitionServiceTest` — 期望编译失败或测试失败（update() 还未改）。

### 2.3 重写 update() — GREEN

在 `FormDefinitionService.java` 替换 `update()` 方法：

```java
/**
 * 更新表单定义 schema。
 * DRAFT 状态：原地更新当前记录，不创建新版本。
 * PUBLISHED 状态：创建新的 DRAFT 副本（同 key、同 version、同 schema），后续更新写入副本。
 *
 * @param id     表单定义 ID
 * @param schema 新的 schema JSON
 * @return 更新后的表单定义（DRAFT 状态时为原记录，PUBLISHED 状态时为新副本）
 */
@Transactional
public FormDefinition update(String id, String schema) {
    String tenantId = tenantProvider.getTenantId();
    FormDefinition current = formDefRepository.findByIdAndTenantId(id, tenantId)
            .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

    if ("PUBLISHED".equals(current.getStatus())) {
        // 已发布表单：创建 DRAFT 副本
        FormDefinition draft = new FormDefinition();
        draft.setId(UUID.randomUUID().toString().replace("-", ""));
        draft.setTenantId(tenantId);
        draft.setName(current.getName());
        draft.setKey(current.getKey());
        draft.setSchema(schema);
        draft.setVersion(current.getVersion());
        draft.setStatus("DRAFT");
        draft.setCreatedBy(current.getCreatedBy());
        return formDefRepository.save(draft);
    }

    // DRAFT 状态：原地更新
    current.setSchema(schema);
    return formDefRepository.save(current);
}
```

**验证**: `mvn test -Dtest=FormDefinitionServiceTest` — update 相关测试通过。

**提交点**: `feat(form): update() 改为原地更新 DRAFT，PUBLISHED 创建副本`

### 2.4 重写 publish() — RED

在 `FormDefinitionServiceTest.java` 中替换现有的 `publish` 测试用例。

**删除旧测试**（直接改状态的那个），**新增以下测试**：

```java
@Test
void publish_draftForm_createsNewVersion_oldPublishedArchived() {
    FormDefinition draft = new FormDefinition();
    draft.setId("form-draft");
    draft.setTenantId(TENANT_ID);
    draft.setKey("leave-form");
    draft.setName("请假表单");
    draft.setSchema("[{\"field\":\"reason\"}]");
    draft.setVersion(1);
    draft.setStatus("DRAFT");

    FormDefinition oldPublished = new FormDefinition();
    oldPublished.setId("form-old-pub");
    oldPublished.setTenantId(TENANT_ID);
    oldPublished.setKey("leave-form");
    oldPublished.setSchema("[{\"field\":\"name\"}]");
    oldPublished.setVersion(1);
    oldPublished.setStatus("PUBLISHED");

    when(formDefRepository.findByIdAndTenantId("form-draft", TENANT_ID))
        .thenReturn(Optional.of(draft));
    when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            TENANT_ID, "leave-form", "PUBLISHED"))
        .thenReturn(Optional.of(oldPublished));
    when(formDefRepository.findMaxVersionByTenantIdAndKey(TENANT_ID, "leave-form"))
        .thenReturn(1);

    FormDefinition result = formDefService.publish("form-draft");

    assertEquals(2, result.getVersion());
    assertEquals("PUBLISHED", result.getStatus());
    assertEquals(2, result.getPublishedVersion());
    assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
    // 旧 PUBLISHED 降为 ARCHIVED
    assertEquals("ARCHIVED", oldPublished.getStatus());
    verify(formDefRepository).save(oldPublished);
    verify(formDefRepository).save(any(FormDefinition.class));
}

@Test
void publish_schemaUnchanged_throwsException() {
    FormDefinition draft = new FormDefinition();
    draft.setId("form-draft");
    draft.setTenantId(TENANT_ID);
    draft.setKey("leave-form");
    draft.setName("请假表单");
    draft.setSchema("[{\"field\":\"reason\"}]");
    draft.setVersion(1);
    draft.setStatus("DRAFT");

    FormDefinition oldPublished = new FormDefinition();
    oldPublished.setId("form-old-pub");
    oldPublished.setTenantId(TENANT_ID);
    oldPublished.setKey("leave-form");
    oldPublished.setSchema("[{\"field\":\"reason\"}]");
    oldPublished.setVersion(1);
    oldPublished.setStatus("PUBLISHED");

    when(formDefRepository.findByIdAndTenantId("form-draft", TENANT_ID))
        .thenReturn(Optional.of(draft));
    when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            TENANT_ID, "leave-form", "PUBLISHED"))
        .thenReturn(Optional.of(oldPublished));

    BusinessException ex = assertThrows(BusinessException.class,
        () -> formDefService.publish("form-draft"));
    assertTrue(ex.getMessage().contains("表单内容未变化"));
}

@Test
void publish_noPreviousPublished_createsVersion1() {
    FormDefinition draft = new FormDefinition();
    draft.setId("form-draft");
    draft.setTenantId(TENANT_ID);
    draft.setKey("leave-form");
    draft.setName("请假表单");
    draft.setSchema("[{\"field\":\"reason\"}]");
    draft.setVersion(1);
    draft.setStatus("DRAFT");

    when(formDefRepository.findByIdAndTenantId("form-draft", TENANT_ID))
        .thenReturn(Optional.of(draft));
    when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            TENANT_ID, "leave-form", "PUBLISHED"))
        .thenReturn(Optional.empty());
    when(formDefRepository.findMaxVersionByTenantIdAndKey(TENANT_ID, "leave-form"))
        .thenReturn(null);

    FormDefinition result = formDefService.publish("form-draft");

    assertEquals(1, result.getVersion());
    assertEquals("PUBLISHED", result.getStatus());
    assertEquals(1, result.getPublishedVersion());
}
```

**验证**: `mvn test -Dtest=FormDefinitionServiceTest` — publish 相关测试失败（publish() 还未改）。

### 2.5 重写 publish() — GREEN

在 `FormDefinitionService.java` 替换 `publish()` 方法：

```java
/**
 * 发布表单定义。
 * 创建新版本记录（version 自增），状态为 PUBLISHED。
 * 若存在旧 PUBLISHED 版本，将其状态改为 ARCHIVED。
 * 若当前 schema 与上次 PUBLISHED 的 schema 一致，拒绝发布。
 *
 * @param id 表单定义 ID（DRAFT 版本）
 * @return 新发布的表单定义
 */
@Transactional
public FormDefinition publish(String id) {
    String tenantId = tenantProvider.getTenantId();
    FormDefinition draft = formDefRepository.findByIdAndTenantId(id, tenantId)
            .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

    if (!"DRAFT".equals(draft.getStatus())) {
        throw new RuntimeException("Only DRAFT forms can be published, current status: " + draft.getStatus());
    }

    // 查找上次 PUBLISHED 记录，校验 schema 是否变化
    Optional<FormDefinition> lastPublished = formDefRepository
            .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, draft.getKey(), "PUBLISHED");

    if (lastPublished.isPresent() && Objects.equals(lastPublished.get().getSchema(), draft.getSchema())) {
        throw new BusinessException(400, "表单内容未变化，无需发布");
    }

    // 创建新版本记录
    Integer maxVersion = formDefRepository.findMaxVersionByTenantIdAndKey(tenantId, draft.getKey());
    int newVersion = (maxVersion != null ? maxVersion : 0) + 1;

    FormDefinition newPublished = new FormDefinition();
    newPublished.setId(UUID.randomUUID().toString().replace("-", ""));
    newPublished.setTenantId(tenantId);
    newPublished.setName(draft.getName());
    newPublished.setKey(draft.getKey());
    newPublished.setSchema(draft.getSchema());
    newPublished.setVersion(newVersion);
    newPublished.setStatus("PUBLISHED");
    newPublished.setPublishedVersion(newVersion);
    newPublished.setCreatedBy(draft.getCreatedBy());

    // 旧 PUBLISHED 降为 ARCHIVED
    lastPublished.ifPresent(old -> {
        old.setStatus("ARCHIVED");
        formDefRepository.save(old);
    });

    return formDefRepository.save(newPublished);
}
```

需要在文件顶部添加 import：
```java
import com.workflow.common.exception.BusinessException;
import java.util.Objects;
```

**验证**: `mvn test -Dtest=FormDefinitionServiceTest` — 全部测试通过。

**提交点**: `feat(form): publish() 改为创建新版本记录，对齐流程定义语义`

---

## Task 3: 前端 — 流程设计器跳转表单设计器

### 3.1 FormPropertyTab.vue 加跳转按钮

在 `FormPropertyTab.vue` 的 template 中，"关联表单"的 `el-form-item` 内，`el-select` 后面加按钮：

```vue
<el-form-item label="关联表单">
  <div style="display: flex; gap: 8px; width: 100%;">
    <el-select
      v-model="formConfig.formDefId"
      placeholder="请选择已发布的表单"
      filterable
      clearable
      style="flex: 1"
      @change="handleFormChange"
    >
      <el-option
        v-for="form in formList"
        :key="form.id"
        :label="`${form.name} (v${form.version})`"
        :value="form.id"
      />
    </el-select>
    <el-button
      v-if="formConfig.formDefId"
      :icon="Edit"
      size="small"
      @click="jumpToFormDesigner"
    >
      编辑表单
    </el-button>
  </div>
</el-form-item>
```

在 `<script setup>` 中添加：

```ts
import { useRouter, useRoute } from 'vue-router'
import { Edit } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

function jumpToFormDesigner() {
  if (!formConfig.formDefId) return
  router.push({
    name: 'FormDesigner',
    query: {
      id: formConfig.formDefId,
      returnTo: `/designer?id=${route.query.id}`
    }
  })
}
```

**验证**: `cd frontend && npx vue-tsc --noEmit` — 无类型错误。

**提交点**: `feat(frontend): FormPropertyTab 加跳转表单设计器按钮`

### 3.2 FormDesigner.vue 返回按钮支持 returnTo

在 `FormDesigner.vue` 的 `handleBack()` 函数中修改：

```ts
function handleBack() {
  const returnTo = route.query.returnTo as string
  if (returnTo) {
    router.push(returnTo)
  } else {
    router.back()
  }
}
```

**验证**: `cd frontend && npx vue-tsc --noEmit` — 无类型错误。

**提交点**: `feat(frontend): FormDesigner 返回按钮支持 returnTo 回跳`

---

## Task 4: 验证

### 4.1 后端测试

```bash
cd backend && mvn test -Dtest=FormDefinitionServiceTest
```

**期望**: 全部测试通过。

### 4.2 前端类型检查

```bash
cd frontend && npx vue-tsc --noEmit
```

**期望**: 无新增类型错误。

### 4.3 LSP 诊断

对修改的文件运行 `lsp_diagnostics`，确认无新增 error。

### 4.4 手动验证流程

1. 启动后端 + 前端
2. 进入表单设计器，创建表单，保存多次 → 确认 version 不变
3. 发布表单 → 确认 version +1，status=PUBLISHED
4. 再次保存（无变化）后发布 → 确认被拒绝
5. 进入流程设计器，选中用户任务节点，关联表单 → 确认出现"编辑表单"按钮
6. 点击"编辑表单" → 跳转到表单设计器
7. 点击返回 → 回到流程设计器

**提交点**: `test: 验证表单版本号语义和设计器跳转`
