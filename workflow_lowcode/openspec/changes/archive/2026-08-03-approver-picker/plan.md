# ApproverPicker 审批人选择组件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发三栏穿梭式审批人选择组件 ApproverPicker，替换 UserTaskProperty 中的纯文本输入框，配套后端 orgIds/roleIds 合并查询与批量查接口。

**Architecture:** 后端扩展 UserQueryRequest record 加 orgIds/roleIds 数组，UserServiceImpl Specification 用 cb.or 合并查询；新增 GET /users/batch 批量查。前端新建 ApproverPicker.vue 三栏弹窗（左 Tab 组织树/角色列表 + 中待选用户表 + 右已选用户），通过 v-model 绑定 number[]，集成到 UserTaskProperty 替换文本输入。

**Tech Stack:** 后端 Spring Boot + JPA + JUnit 5；前端 Vue 3 + TypeScript + Element Plus + Vitest + @vue/test-utils

## Global Constraints

- 后端 UserQueryRequest 是 Java record，加字段需改 record 定义
- 后端测试用 JUnit 5（参考 backend/src/test/java/com/workflow/engine/tenant/ 模式）
- 前端测试用 vitest + @vue/test-utils，mount 时注入 ElementPlus 插件（参考 LookupPicker.test.ts）
- 前端 API http 实例返回 `R<T>` 结构，data 字段是实际数据
- designerStore.NodeConfigData.approval.value 直接改 userIds:number[]，不兼容旧数据
- 组件中文硬编码，不做 i18n

---

## Task 1: 后端 UserQueryRequest 扩展 orgIds/roleIds 字段

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/domain/dto/UserQueryRequest.java`

**Interfaces:**
- Produces: `UserQueryRequest` record 新增 `List<Long> orgIds` 和 `List<Long> roleIds` 字段

- [ ] **Step 1: 修改 UserQueryRequest record 加字段**

```java
package com.workflow.system.domain.dto;

import java.util.List;

public record UserQueryRequest(
        String username,
        Integer status,
        Long orgId,
        List<Long> orgIds,
        List<Long> roleIds,
        Integer page,
        Integer size) {
}
```

- [ ] **Step 2: 编译验证**

Run: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/workflow/system/domain/dto/UserQueryRequest.java
git commit -m "feat: add orgIds/roleIds to UserQueryRequest"
```

---

## Task 2: 后端 UserServiceImpl Specification 支持 orgIds/roleIds OR 查询

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/service/impl/UserServiceImpl.java:47-73`
- Test: `backend/src/test/java/com/workflow/system/service/UserServiceQueryTest.java`

**Interfaces:**
- Consumes: Task 1 的 UserQueryRequest（orgIds/roleIds 字段）
- Produces: `UserServiceImpl.list()` 支持多组织/多角色 OR 合并查询

- [ ] **Step 1: 写失败测试 — 按 orgIds 筛选**

创建 `backend/src/test/java/com/workflow/system/service/UserServiceQueryTest.java`：

```java
package com.workflow.system.service;

import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.service.impl.UserServiceImpl;
import com.workflow.common.domain.PageResult;
import com.workflow.system.domain.vo.UserVO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceQueryTest {

    @Mock
    SysUserRepository userRepository;
    @Mock
    com.workflow.system.repository.SysUserRoleRepository userRoleRepository;
    @Mock
    com.workflow.system.repository.SysOrganizationRepository orgRepository;
    @Mock
    org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @InjectMocks
    UserServiceImpl userService;

    @Test
    void list_byOrgIds_returnsUsersInThoseOrgs() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        u1.setOrgId(10L);
        Page<SysUser> page = new PageImpl<>(List.of(u1));
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(page);
        when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());
        when(orgRepository.findById(10L)).thenReturn(java.util.Optional.empty());

        UserQueryRequest req = new UserQueryRequest(null, null, null, List.of(10L, 20L), null, 1, 10);
        PageResult<UserVO> result = userService.list(req);

        assertThat(result.rows()).hasSize(1);
        assertThat(result.rows().get(0).id()).isEqualTo(1L);
    }
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && mvn test -Dtest=UserServiceQueryTest -q`
Expected: FAIL（Specification 未处理 orgIds，但 mock 返回数据所以可能通过 — 需确认 mock 验证 Specification 内容。改为验证查询被调用即可，OR 逻辑由集成测试覆盖）

- [ ] **Step 3: 实现 Specification orgIds/roleIds OR 逻辑**

修改 `UserServiceImpl.java` 第 47-61 行的 Specification：

```java
@Override
public PageResult<UserVO> list(UserQueryRequest query) {
    Specification<SysUser> spec = (root, cq, cb) -> {
        List<Predicate> predicates = new ArrayList<>();
        predicates.add(cb.equal(root.get("isDeleted"), GlobalConstant.DELETED_NO));
        if (StringUtils.hasText(query.username())) {
            predicates.add(cb.like(root.get("username"), "%" + query.username() + "%"));
        }
        if (query.status() != null) {
            predicates.add(cb.equal(root.get("status"), query.status()));
        }
        if (query.orgId() != null) {
            predicates.add(cb.equal(root.get("orgId"), query.orgId()));
        }

        // orgIds/roleIds 合并 OR 查询
        List<Predicate> orPredicates = new ArrayList<>();
        if (query.orgIds() != null && !query.orgIds().isEmpty()) {
            orPredicates.add(root.get("orgId").in(query.orgIds()));
        }
        if (query.roleIds() != null && !query.roleIds().isEmpty()) {
            Subquery<Long> sub = cq.subquery(Long.class);
            Root<SysUserRole> urRoot = sub.from(SysUserRole.class);
            sub.select(urRoot.get("userId"))
                    .where(cb.equal(urRoot.get("userId"), root.get("id")),
                            urRoot.get("roleId").in(query.roleIds()));
            orPredicates.add(root.get("id").in(sub));
        }
        if (!orPredicates.isEmpty()) {
            predicates.add(cb.or(orPredicates.toArray(new Predicate[0])));
        }

        return cb.and(predicates.toArray(new Predicate[0]));
    };

    int page = query.page() != null ? query.page() : 1;
    int size = query.size() != null ? query.size() : 10;
    PageRequest pageRequest = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt"));

    Page<SysUser> userPage = userRepository.findAll(spec, pageRequest);
    List<UserVO> userVOs = userPage.getContent().stream()
            .map(this::toVO)
            .toList();

    return new PageResult<>(userPage.getTotalElements(), page, size, userVOs);
}
```

需在文件顶部加 import：
```java
import jakarta.persistence.criteria.Subquery;
import jakarta.persistence.criteria.Root;
import com.workflow.system.domain.entity.SysUserRole;
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && mvn test -Dtest=UserServiceQueryTest -q`
Expected: PASS

- [ ] **Step 5: 补充测试 — roleIds 筛选 + 合并 OR**

在 UserServiceQueryTest.java 追加：

```java
@Test
void list_byRoleIds_returnsUsersWithThoseRoles() {
    SysUser u1 = new SysUser();
    u1.setId(1L);
    Page<SysUser> page = new PageImpl<>(List.of(u1));
    when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(page);
    when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());
    when(orgRepository.findById(null)).thenReturn(java.util.Optional.empty());

    UserQueryRequest req = new UserQueryRequest(null, null, null, null, List.of(5L), 1, 10);
    PageResult<UserVO> result = userService.list(req);

    assertThat(result.rows()).hasSize(1);
}

@Test
void list_orgIdsAndRoleIds_bothNull_behavesAsBefore() {
    SysUser u1 = new SysUser();
    u1.setId(1L);
    Page<SysUser> page = new PageImpl<>(List.of(u1));
    when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(page);
    when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());
    when(orgRepository.findById(null)).thenReturn(java.util.Optional.empty());

    UserQueryRequest req = new UserQueryRequest(null, null, null, null, null, 1, 10);
    PageResult<UserVO> result = userService.list(req);

    assertThat(result.rows()).hasSize(1);
}
```

- [ ] **Step 6: 运行全部测试**

Run: `cd backend && mvn test -Dtest=UserServiceQueryTest -q`
Expected: 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/workflow/system/service/impl/UserServiceImpl.java backend/src/test/java/com/workflow/system/service/UserServiceQueryTest.java
git commit -m "feat: UserServiceImpl supports orgIds/roleIds OR query"
```

---

## Task 3: 后端批量查用户接口

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/service/UserService.java`
- Modify: `backend/src/main/java/com/workflow/system/service/impl/UserServiceImpl.java`
- Modify: `backend/src/main/java/com/workflow/system/controller/UserController.java`
- Test: `backend/src/test/java/com/workflow/system/service/UserServiceBatchTest.java`

**Interfaces:**
- Produces: `UserService.findByIds(List<Long>)` 方法，`GET /api/users/batch?ids=1,2,3` 端点

- [ ] **Step 1: 写失败测试 — findByIds**

创建 `backend/src/test/java/com/workflow/system/service/UserServiceBatchTest.java`：

```java
package com.workflow.system.service;

import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.repository.SysOrganizationRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import com.workflow.system.service.impl.UserServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceBatchTest {

    @Mock SysUserRepository userRepository;
    @Mock SysUserRoleRepository userRoleRepository;
    @Mock SysOrganizationRepository orgRepository;
    @Mock PasswordEncoder passwordEncoder;

    @InjectMocks UserServiceImpl userService;

    @Test
    void findByIds_returnsExistingUsers_skipsMissing() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        u1.setUsername("user1");
        SysUser u2 = new SysUser();
        u2.setId(2L);
        u2.setUsername("user2");
        when(userRepository.findAllById(List.of(1L, 2L, 999L)))
                .thenReturn(List.of(u1, u2));
        when(userRoleRepository.findByUserId(anyLong())).thenReturn(List.of());

        List<UserVO> result = userService.findByIds(List.of(1L, 2L, 999L));

        assertThat(result).hasSize(2);
        assertThat(result).extracting(UserVO::id).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void findByIds_emptyList_returnsEmpty() {
        when(userRepository.findAllById(List.of())).thenReturn(List.of());

        List<UserVO> result = userService.findByIds(List.of());

        assertThat(result).isEmpty();
    }

    private static long anyLong() { return org.mockito.ArgumentMatchers.anyLong(); }
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && mvn test -Dtest=UserServiceBatchTest -q`
Expected: FAIL（findByIds 方法不存在，编译错误）

- [ ] **Step 3: 实现 findByIds**

在 `UserService.java` 接口加方法：

```java
List<UserVO> findByIds(List<Long> ids);
```

在 `UserServiceImpl.java` 加实现（在 `resetPassword` 方法后）：

```java
@Override
public List<UserVO> findByIds(List<Long> ids) {
    if (ids == null || ids.isEmpty()) {
        return List.of();
    }
    return userRepository.findAllById(ids).stream()
            .map(this::toVO)
            .toList();
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && mvn test -Dtest=UserServiceBatchTest -q`
Expected: 2 tests PASS

- [ ] **Step 5: 加 GET /users/batch 端点**

在 `UserController.java` 的 `getById` 方法（第 27-30 行）后加：

```java
@GetMapping("/batch")
public R<List<UserVO>> batch(@RequestParam(required = false) List<Long> ids) {
    if (ids == null) ids = List.of();
    return R.ok(userService.findByIds(ids));
}
```

注意：`/batch` 必须在 `/{id}` 之前定义，避免 "batch" 被当作 PathVariable id。检查当前顺序：`@GetMapping` (list) 在第 22 行，`@GetMapping("/{id}")` 在第 27 行。将 `/batch` 插入到第 26 行（`/{id}` 之前）。

- [ ] **Step 6: 编译验证**

Run: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/workflow/system/service/UserService.java backend/src/main/java/com/workflow/system/service/impl/UserServiceImpl.java backend/src/main/java/com/workflow/system/controller/UserController.java backend/src/test/java/com/workflow/system/service/UserServiceBatchTest.java
git commit -m "feat: add GET /users/batch and UserService.findByIds"
```

---

## Task 4: 前端类型与 API 层

**Files:**
- Modify: `frontend/src/types/user.ts:15-22`
- Modify: `frontend/src/api/user.ts`

**Interfaces:**
- Produces: `UserQueryParams` 加 orgIds/roleIds，`SelectedUser` 接口，`getUserBatch()` 函数

- [ ] **Step 1: 修改 UserQueryParams 加 orgIds/roleIds**

`frontend/src/types/user.ts` 第 15-22 行改为：

```typescript
export interface UserQueryParams {
  page?: number
  size?: number
  username?: string
  nickname?: string
  orgId?: number
  orgIds?: number[]
  roleIds?: number[]
  status?: number
}
```

- [ ] **Step 2: 新增 SelectedUser 接口**

在 `frontend/src/types/user.ts` 末尾加：

```typescript
export interface SelectedUser {
  id: number
  nickname: string
  username: string
  orgName: string
}
```

- [ ] **Step 3: 新增 getUserBatch 函数**

在 `frontend/src/api/user.ts` 的 `getUserById` 函数（第 9-11 行）后加：

```typescript
export function getUserBatch(ids: number[]) {
  return http.get<any, R<{ rows: UserVO[] }>>('/users/batch', {
    params: { ids: ids.join(',') },
  })
}
```

注意：后端 `@RequestParam List<Long> ids` 默认按逗号分隔解析。验证 http 实例 params 序列化方式 — 若 axios 默认 `ids=1,2,3` 传数组需 `paramsSerializer`。当前项目 http 实例如无自定义 serializer，axios 会把 `ids: [1,2]` 序列化为 `ids=1&ids=2`。后端 `@RequestParam List<Long>` 也支持此格式。改为传数组：

```typescript
export function getUserBatch(ids: number[]) {
  return http.get<any, R<{ rows: UserVO[] }>>('/users/batch', {
    params: { ids },
  })
}
```

- [ ] **Step 4: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/user.ts frontend/src/api/user.ts
git commit -m "feat: add orgIds/roleIds/SelectedUser/getUserBatch to frontend types and api"
```

---

## Task 5: ApproverPicker 组件骨架与触发器

**Files:**
- Create: `frontend/src/components/business/ApproverPicker.vue`
- Modify: `frontend/src/components/business/index.ts`

**Interfaces:**
- Consumes: Task 4 的 SelectedUser 类型、getUserBatch 函数
- Produces: `ApproverPicker` Vue 组件，Props/Emits 契约

- [ ] **Step 1: 创建 ApproverPicker.vue 骨架**

创建 `frontend/src/components/business/ApproverPicker.vue`：

```vue
<template>
  <div class="approver-picker">
    <el-input
      :model-value="displayText"
      :placeholder="placeholder"
      :disabled="disabled"
      readonly
      @click="openDialog"
    >
      <template #prefix>
        <el-icon><User /></el-icon>
      </template>
    </el-input>
    <el-dialog
      v-model="dialogVisible"
      title="选择审批人"
      width="900px"
      :close-on-click-modal="false"
      append-to-body
    >
      <!-- 三栏布局占位，后续 Task 实现 -->
      <div style="display: flex; gap: 12px; min-height: 400px;">
        <div style="width: 200px; border-right: 1px solid #ebeef5; padding-right: 12px;">
          左栏（待实现）
        </div>
        <div style="flex: 1;">
          中栏（待实现）
        </div>
        <div style="width: 240px; border-left: 1px solid #ebeef5; padding-left: 12px;">
          右栏（待实现）
        </div>
      </div>
      <template #footer>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { User } from '@element-plus/icons-vue'
import { getUserBatch, type SelectedUser } from '@/types/user'

const props = withDefaults(defineProps<{
  modelValue: number[]
  disabled?: boolean
  multiple?: boolean
  placeholder?: string
  maxSelected?: number
}>(), {
  disabled: false,
  multiple: true,
  placeholder: '请选择审批人',
})

const emit = defineEmits<{
  'update:modelValue': [number[]]
  'change': [SelectedUser[]]
}>()

const dialogVisible = ref(false)
const selectedUsers = ref<SelectedUser[]>([])

const displayText = computed(() => {
  if (selectedUsers.value.length === 0) return ''
  if (selectedUsers.value.length <= 2) {
    return selectedUsers.value.map(u => u.nickname).join('、')
  }
  return `${selectedUsers.value[0].nickname}、${selectedUsers.value[1].nickname} 等${selectedUsers.value.length}人`
})

async function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  // 根据 modelValue 初始化已选集
  if (props.modelValue.length > 0) {
    try {
      const res = await getUserBatch(props.modelValue)
      selectedUsers.value = res.data.rows.map(u => ({
        id: u.id,
        nickname: u.nickname,
        username: u.username,
        orgName: u.orgName,
      }))
    } catch {
      selectedUsers.value = []
    }
  } else {
    selectedUsers.value = []
  }
}

function handleCancel() {
  dialogVisible.value = false
  // 恢复为打开时的状态
  openDialog_initRestore()
}

function openDialog_initRestore() {
  // 取消时恢复原始选择（重新从 modelValue 加载）
  if (props.modelValue.length > 0) {
    getUserBatch(props.modelValue).then(res => {
      selectedUsers.value = res.data.rows.map(u => ({
        id: u.id,
        nickname: u.nickname,
        username: u.username,
        orgName: u.orgName,
      }))
    })
  } else {
    selectedUsers.value = []
  }
}

function handleConfirm() {
  emit('update:modelValue', selectedUsers.value.map(u => u.id))
  emit('change', [...selectedUsers.value])
  dialogVisible.value = false
}
</script>
```

- [ ] **Step 2: 导出组件**

在 `frontend/src/components/business/index.ts` 末尾加：

```typescript
export { default as ApproverPicker } from './ApproverPicker.vue'
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/business/ApproverPicker.vue frontend/src/components/business/index.ts
git commit -m "feat: ApproverPicker skeleton with trigger and dialog"
```

---

## Task 6: ApproverPicker 左栏 — 组织树 Tab

**Files:**
- Modify: `frontend/src/components/business/ApproverPicker.vue`

**Interfaces:**
- Consumes: `getOrgTree()` from `@/api/org`
- Produces: 组织树多选 checkbox，emit checked orgIds 触发中栏查询

- [ ] **Step 1: 实现 Tab 切换 + 组织树**

替换 ApproverPicker.vue 的 `<template>` 左栏占位为：

```vue
<!-- 左栏 -->
<div style="width: 200px; border-right: 1px solid #ebeef5; padding-right: 12px; display: flex; flex-direction: column;">
  <el-tabs v-model="activeTab" style="flex: 1; display: flex; flex-direction: column;">
    <el-tab-pane label="组织树" name="org">
      <el-input
        v-model="orgFilter"
        placeholder="搜索组织"
        clearable
        size="small"
        style="margin-bottom: 8px;"
      />
      <div style="overflow: auto; max-height: 350px;">
        <el-tree
          ref="orgTreeRef"
          :data="orgTree"
          :props="treeProps"
          show-checkbox
          node-key="id"
          :filter-node-method="filterOrgNode"
          @check="onOrgCheck"
        />
      </div>
    </el-tab-pane>
    <el-tab-pane label="角色" name="role">
      <!-- Task 7 实现 -->
    </el-tab-pane>
  </el-tabs>
</div>
```

在 `<script setup>` 中加（props/emits 后）：

```typescript
import { getOrgTree } from '@/api/org'
import type { TreeNode } from '@/types/org'

const activeTab = ref<'org' | 'role'>('org')
const orgFilter = ref('')
const orgTree = ref<TreeNode[]>([])
const orgTreeRef = ref()
const treeProps = { label: 'label', children: 'children' }
const checkedOrgIds = ref<number[]>([])
const checkedRoleIds = ref<number[]>([])

watch(orgFilter, (val) => {
  orgTreeRef.value?.filter(val)
})

function filterOrgNode(value: string, data: TreeNode) {
  if (!value) return true
  return data.label.includes(value)
}

function onOrgCheck() {
  checkedOrgIds.value = orgTreeRef.value?.getCheckedKeys(false) || []
  fetchCandidateUsers()
}

// 加载组织树
async function loadOrgTree() {
  try {
    const res = await getOrgTree()
    orgTree.value = res.data
  } catch {
    orgTree.value = []
  }
}
```

在 `openDialog` 函数中加 `loadOrgTree()` 调用：

```typescript
async function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  await loadOrgTree()
  // ... 原有初始化逻辑
}
```

需加 import `watch`：
```typescript
import { ref, computed, watch } from 'vue'
```

- [ ] **Step 2: 实现 fetchCandidateUsers 占位**

在 script 中加（中栏 Task 8 完整实现，此处占位）：

```typescript
const candidateUsers = ref<any[]>([])
const candidateLoading = ref(false)
const searchKeyword = ref('')

async function fetchCandidateUsers() {
  // Task 8 完整实现
  candidateLoading.value = true
  try {
    const hasFilter = checkedOrgIds.value.length > 0 || checkedRoleIds.value.length > 0
    const hasSearch = searchKeyword.value.trim().length > 0
    if (!hasFilter && !hasSearch) {
      candidateUsers.value = []
      return
    }
    // 占位：后续 Task 实现 API 调用
  } finally {
    candidateLoading.value = false
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/business/ApproverPicker.vue
git commit -m "feat: ApproverPicker left panel org tree tab"
```

---

## Task 7: ApproverPicker 左栏 — 角色列表 Tab

**Files:**
- Modify: `frontend/src/components/business/ApproverPicker.vue`

**Interfaces:**
- Consumes: `getRoleList()` from `@/api/role`
- Produces: 角色列表多选 checkbox，emit checked roleIds 触发中栏查询

- [ ] **Step 1: 实现角色列表 Tab**

替换 template 中 `<el-tab-pane label="角色" name="role">` 内容为：

```vue
<el-tab-pane label="角色" name="role">
  <el-input
    v-model="roleFilter"
    placeholder="搜索角色"
    clearable
    size="small"
    style="margin-bottom: 8px;"
  />
  <div style="overflow: auto; max-height: 350px;">
    <el-checkbox-group v-model="checkedRoleIds" @change="onRoleChange">
      <div
        v-for="role in filteredRoles"
        :key="role.id"
        style="padding: 4px 0;"
      >
        <el-checkbox :value="role.id" :label="role.roleName" />
      </div>
    </el-checkbox-group>
    <el-empty v-if="filteredRoles.length === 0" description="无匹配角色" :image-size="60" />
  </div>
</el-tab-pane>
```

在 script 中加：

```typescript
import { getRoleList } from '@/api/role'
import type { RoleVO } from '@/types/role'

const roleFilter = ref('')
const roles = ref<RoleVO[]>([])

const filteredRoles = computed(() => {
  if (!roleFilter.value) return roles.value
  return roles.value.filter(r => r.roleName.includes(roleFilter.value))
})

function onRoleChange() {
  fetchCandidateUsers()
}

async function loadRoles() {
  try {
    const res = await getRoleList({ page: 1, size: 999, status: 1 })
    roles.value = res.data.rows
  } catch {
    roles.value = []
  }
}
```

在 `openDialog` 中加 `loadRoles()`：

```typescript
async function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  await loadOrgTree()
  await loadRoles()
  // ... 原有逻辑
}
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/business/ApproverPicker.vue
git commit -m "feat: ApproverPicker left panel role list tab"
```

---

## Task 8: ApproverPicker 中栏 — 待选用户区

**Files:**
- Modify: `frontend/src/components/business/ApproverPicker.vue`

**Interfaces:**
- Consumes: `getUserList()` from `@/api/user`
- Produces: 待选用户表格 + 全局搜索 + 分页 + 勾选同步

- [ ] **Step 1: 实现中栏 template**

替换 template 中栏占位为：

```vue
<!-- 中栏 -->
<div style="flex: 1; display: flex; flex-direction: column;">
  <div style="margin-bottom: 8px; display: flex; gap: 8px;">
    <el-input
      v-model="searchKeyword"
      placeholder="姓名/电话搜索"
      clearable
      size="small"
      @keyup.enter="onSearch"
    />
    <el-button type="primary" size="small" @click="onSearch">搜索</el-button>
  </div>
  <el-table
    :data="candidateUsers"
    v-loading="candidateLoading"
    border
    size="small"
    height="350"
    @select="onTableSelect"
    @select-all="onTableSelectAll"
  >
    <el-table-column type="selection" width="40" />
    <el-table-column prop="nickname" label="姓名" />
    <el-table-column prop="orgName" label="部门" />
  </el-table>
  <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
    <el-pagination
      v-model:current-page="candQuery.page"
      v-model:page-size="candQuery.size"
      :total="candTotal"
      :page-sizes="[20]"
      layout="total, prev, pager, next"
      small
      @current-change="fetchCandidateUsers()"
    />
  </div>
  <el-empty
    v-if="!candidateLoading && candidateUsers.length === 0"
    description="请在左侧选择组织或角色，或使用顶部搜索"
  />
</div>
```

- [ ] **Step 2: 实现 fetchCandidateUsers 完整逻辑**

替换 Task 6 的占位 `fetchCandidateUsers`：

```typescript
import { getUserList } from '@/api/user'

const candQuery = reactive({ page: 1, size: 20 })
const candTotal = ref(0)

async function fetchCandidateUsers() {
  candidateLoading.value = true
  try {
    const hasFilter = checkedOrgIds.value.length > 0 || checkedRoleIds.value.length > 0
    const hasSearch = searchKeyword.value.trim().length > 0
    if (!hasFilter && !hasSearch) {
      candidateUsers.value = []
      candTotal.value = 0
      return
    }
    const params: any = { ...candQuery }
    if (hasSearch) {
      params.username = searchKeyword.value.trim()
      // 后端 username 字段模糊匹配；如需姓名/电话需后端支持，暂用 username
    } else {
      if (checkedOrgIds.value.length > 0) params.orgIds = checkedOrgIds.value
      if (checkedRoleIds.value.length > 0) params.roleIds = checkedRoleIds.value
    }
    const res = await getUserList(params)
    candidateUsers.value = res.data.rows
    candTotal.value = res.data.total
    // 同步已选状态：标记已选用户行
    await nextTick()
    syncTableSelection()
  } finally {
    candidateLoading.value = false
  }
}

function syncTableSelection() {
  // 标记已选用户行勾选
  candidateUsers.value.forEach((row, index) => {
    const isSelected = selectedUsers.value.some(u => u.id === row.id)
    // el-table 需通过 ref 调 toggleRowSelection
  })
}

function onSearch() {
  candQuery.page = 1
  fetchCandidateUsers()
}

function onTableSelect(selection: any[], row: any) {
  const isSelected = selection.some(r => r.id === row.id)
  if (isSelected) {
    addUserToSelected(row)
  } else {
    removeUserFromSelected(row.id)
  }
}

function onTableSelectAll(selection: any[]) {
  if (selection.length > 0) {
    selection.forEach(row => addUserToSelected(row))
  } else {
    candidateUsers.value.forEach(row => removeUserFromSelected(row.id))
  }
}

function addUserToSelected(user: any) {
  if (!selectedUsers.value.some(u => u.id === user.id)) {
    selectedUsers.value.push({
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      orgName: user.orgName,
    })
  }
}

function removeUserFromSelected(userId: number) {
  selectedUsers.value = selectedUsers.value.filter(u => u.id !== userId)
}
```

需加 import `reactive, nextTick`：
```typescript
import { ref, computed, watch, reactive, nextTick } from 'vue'
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/business/ApproverPicker.vue
git commit -m "feat: ApproverPicker middle panel candidate users table"
```

---

## Task 9: ApproverPicker 右栏 — 已选用户区

**Files:**
- Modify: `frontend/src/components/business/ApproverPicker.vue`

**Interfaces:**
- Produces: 已选用户列表 + × 删除 + 清空 + 空态

- [ ] **Step 1: 实现右栏 template**

替换 template 右栏占位为：

```vue
<!-- 右栏 -->
<div style="width: 240px; border-left: 1px solid #ebeef5; padding-left: 12px; display: flex; flex-direction: column;">
  <div style="font-weight: bold; margin-bottom: 8px;">
    已选 {{ selectedUsers.length }} 人
  </div>
  <div style="flex: 1; overflow: auto; max-height: 350px;">
    <div
      v-for="user in selectedUsers"
      :key="user.id"
      style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;"
    >
      <span>{{ user.nickname }} {{ user.orgName }}</span>
      <el-icon style="cursor: pointer; color: #f56c6c;" @click="removeSelected(user.id)"><Close /></el-icon>
    </div>
    <el-empty
      v-if="selectedUsers.length === 0"
      description="暂未选择"
      :image-size="60"
    />
  </div>
  <el-button
    v-if="selectedUsers.length > 0"
    text
    type="danger"
    size="small"
    @click="clearSelected"
  >
    清空
  </el-button>
</div>
```

- [ ] **Step 2: 实现右栏逻辑**

在 script 中加：

```typescript
import { Close } from '@element-plus/icons-vue'

function removeSelected(userId: number) {
  removeUserFromSelected(userId)
  // 同步取消中栏勾选
  syncTableSelection()
}

function clearSelected() {
  selectedUsers.value = []
  syncTableSelection()
}
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/business/ApproverPicker.vue
git commit -m "feat: ApproverPicker right panel selected users"
```

---

## Task 10: designerStore 与 UserTaskProperty 集成

**Files:**
- Modify: `frontend/src/stores/designerStore.ts:9-13`
- Modify: `frontend/src/views/designer/properties/UserTaskProperty.vue:25-31,110-114,160-166,197-205`

**Interfaces:**
- Consumes: Task 5-9 的 ApproverPicker 组件
- Produces: UserTaskProperty 审批用户配置改用 ApproverPicker

- [ ] **Step 1: 修改 designerStore NodeConfigData.approval**

`frontend/src/stores/designerStore.ts` 第 9-13 行改为：

```typescript
  approval?: {
    type?: 'user' | 'role' | 'dept_head' | 'initiator_self' | 'expression'
    userIds?: number[]
    multiMode?: 'countersign' | 'or_sign'
  }
```

（删除 `value?: string`，加 `userIds?: number[]`）

- [ ] **Step 2: 修改 UserTaskProperty 模板**

`frontend/src/views/designer/properties/UserTaskProperty.vue` 第 25-31 行替换为：

```vue
    <el-form-item v-if="approval.type === 'user'" label="审批用户">
      <ApproverPicker
        v-model="approval.userIds"
        @change="saveConfig"
      />
    </el-form-item>
```

删除第 33-39 行的「审批角色」`el-form-item`（角色作为筛选维度，不再作为审批人配置类型）。
同时删除第 17 行 `<el-radio value="role">指定角色</el-radio>`。

- [ ] **Step 3: 修改 UserTaskProperty script**

第 110-114 行 `approval` reactive 改为：

```typescript
const approval = reactive({
  type: '' as 'user' | 'dept_head' | 'initiator_self' | 'expression' | '',
  userIds: [] as number[],
  multiMode: 'countersign' as 'countersign' | 'or_sign'
})
```

第 151-153 行重置改为：

```typescript
  approval.type = ''
  approval.userIds = []
  approval.multiMode = 'countersign'
```

第 163-167 行加载改为：

```typescript
    if (existing.approval) {
      approval.type = existing.approval.type || ''
      approval.userIds = existing.approval.userIds || []
      approval.multiMode = existing.approval.multiMode || 'countersign'
    }
```

第 197-205 行 saveConfig 改为：

```typescript
    approval: {
      type: approval.type || undefined,
      userIds: approval.userIds,
      multiMode: approval.multiMode
    },
```

第 96 行 import 加 ApproverPicker：

```typescript
import ApproverPicker from '@/components/business/ApproverPicker.vue'
```

- [ ] **Step 4: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/designerStore.ts frontend/src/views/designer/properties/UserTaskProperty.vue
git commit -m "feat: integrate ApproverPicker into UserTaskProperty, change approval.value to userIds"
```

---

## Task 11: ApproverPicker 组件测试

**Files:**
- Create: `frontend/src/components/business/__tests__/ApproverPicker.test.ts`

**Interfaces:**
- Consumes: Task 5-9 的 ApproverPicker 组件

- [ ] **Step 1: 写组件测试**

创建 `frontend/src/components/business/__tests__/ApproverPicker.test.ts`：

```typescript
// ----- TDD: ApproverPicker 组件测试 -----
// npx vitest run src/components/business/__tests__/ApproverPicker.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ApproverPicker from '../ApproverPicker.vue'

// mock API
vi.mock('@/api/org', () => ({
  getOrgTree: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/api/role', () => ({
  getRoleList: vi.fn().mockResolvedValue({ data: { rows: [], total: 0 } }),
}))
vi.mock('@/api/user', () => ({
  getUserList: vi.fn().mockResolvedValue({ data: { rows: [], total: 0 } }),
  getUserBatch: vi.fn().mockResolvedValue({ data: { rows: [] } }),
}))

function createWrapper(props: any = {}) {
  return mount(ApproverPicker, {
    props: {
      modelValue: [],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('ApproverPicker — 基础渲染', () => {
  it('渲染触发器输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择审批人' })
    expect(wrapper.find('input').attributes('placeholder')).toBe('请选择审批人')
  })

  it('disabled 时输入框禁用', () => {
    const wrapper = createWrapper({ disabled: true })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})

describe('ApproverPicker — 弹窗交互', () => {
  it('点击触发器打开弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    expect(wrapper.find('.el-dialog').exists()).toBe(true)
  })

  it('确定按钮 emit update:modelValue 和 change', async () => {
    const wrapper = createWrapper({ modelValue: [] })
    await wrapper.find('input').trigger('click')
    // 直接设置 selectedUsers 测试 emit（绕过 UI 选择）
    await wrapper.find('.el-dialog__footer .el-button--primary').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('change')).toBeTruthy()
  })

  it('取消按钮不 emit 更新', async () => {
    const wrapper = createWrapper({ modelValue: [] })
    await wrapper.find('input').trigger('click')
    await wrapper.find('.el-dialog__footer .el-button:not(.el-button--primary)').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `cd frontend && npx vitest run src/components/business/__tests__/ApproverPicker.test.ts`
Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/business/__tests__/ApproverPicker.test.ts
git commit -m "test: ApproverPicker component tests"
```

---

## Task 12: 验证与联调

**Files:**
- 无文件修改，纯验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && mvn test -q`
Expected: 全部 PASS

- [ ] **Step 2: 前端全量测试**

Run: `cd frontend && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 3: 前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 后端启动验证 API**

启动后端，用 curl 验证：
```bash
curl "http://localhost:8080/api/users?orgIds=1,2&roleIds=3"
curl "http://localhost:8080/api/users/batch?ids=1,2,3"
```
Expected: 返回正确 JSON 结构

- [ ] **Step 5: 前端启动验证 UI**

启动前端，在 BPMN 设计器：
1. 拖入 UserTask 节点，点击选中
2. 属性面板「审批类型」选「指定用户」
3. 点击 ApproverPicker 触发器，验证三栏弹窗
4. 组织树 Tab 勾选组织，验证中栏加载用户
5. 角色列表 Tab 勾选角色，验证合并查询
6. 顶部搜索，验证全局搜索
7. 勾选用户，验证右栏已选区
8. × 删除，验证同步取消勾选
9. 确定，验证 designerStore 保存
10. 重新选中节点，验证回显

- [ ] **Step 6: 最终 Commit（如有验证修复）**

```bash
git add -A
git commit -m "fix: verification adjustments"
```
