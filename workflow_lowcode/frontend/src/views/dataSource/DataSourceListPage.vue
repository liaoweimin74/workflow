<template>
  <div class="data-source-list-page">
    <el-card class="ds-list-card" style="overflow: hidden">
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :default-page-size="20"
        :max-visible-buttons="5"
      >
        <template #default>
          <el-button type="primary" :icon="Plus" v-permission="'data-source:manage'" @click="openCreate">
            新建
          </el-button>
        </template>
        <template #type="{ row }">
          <!-- 系统内建行：类型列只显示「内建」（预置 SYSTEM 数据源无需再暴露「系统结构」类型名） -->
          <el-tooltip v-if="isBuiltIn(row)" content="系统内建数据源，随迁移脚本自动预置，不可编辑/删除/禁用" placement="top">
            <el-tag type="success">内建</el-tag>
          </el-tooltip>
          <el-tag v-else :type="typeTagType(row.type)">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
        <template #bound="{ row }">
          <span>{{ row.formKey || row.sourceKey || '—' }}</span>
        </template>
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #updatedAt="{ row }">
          {{ formatDate(row.updatedAt) }}
        </template>
      </SearchTable>
    </el-card>

      <!-- 查看/新建/编辑数据源：内嵌表单覆盖层（formMode=inline 样式） -->
      <div v-if="inlineVisible" class="inline-form-overlay">
        <div class="inline-form-container">
          <div class="inline-form-header">
            <span class="inline-form-title">{{ dialogTitle }}</span>
            <el-button text :icon="Close" @click="inlineVisible = false" />
          </div>
          <div class="inline-form-body">
        <el-form :model="form" label-width="auto" label-position="top">
          <!-- 标识 / 数据源名称 / 数据源类型 / 业务表单：四个输入项一行，label 在输入项上方 -->
          <el-row :gutter="16">
            <el-col :span="6">
              <!-- ============ 统一标识：FORM/SYSTEM 只读，API/SQL 手动填写 ============ -->
              <el-form-item label="标识">
                <template v-if="form.type === 'FORM' || form.type === 'WORKFLOW'">
                  <el-input :model-value="form.formKey" disabled placeholder="表单 key 即数据源标识" data-testid="ds-key-input" />
                </template>
                <template v-else-if="form.type === 'SYSTEM'">
                  <el-select v-model="form.sourceKey" placeholder="选择系统结构" style="width: 100%" disabled>
                    <el-option label="部门树" value="dept-tree" />
                    <el-option label="用户列表" value="user-tree" />
                  </el-select>
                </template>
                <template v-else>
                  <el-input
                    v-model="form.sourceKey"
                    data-testid="ds-source-key-input"
                    placeholder="请输入唯一标识，如 external-stock（租户内唯一）"
                    :disabled="isReadonlyForm"
                  />
                </template>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="数据源名称">
                <el-input v-model="form.name" placeholder="请输入数据源名称" maxlength="50" :disabled="isReadonlyForm" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="数据源类型">
                <template v-if="!editingId && !viewOnly">
                  <el-radio-group v-model="form.type">
                    <el-radio-button value="API">第三方 API</el-radio-button>
                    <el-radio-button value="SQL">SQL 查询</el-radio-button>
                  </el-radio-group>
                </template>
                <template v-else>
                  <el-tag :type="typeTagType(form.type)">{{ typeLabel(form.type) }}</el-tag>
                </template>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <!-- ============ 业务表单：API/SQL 可选绑定（默认表单提供 CRUD schema），FORM/WORKFLOW 固定 ============ -->
              <el-form-item>
                <template #label>
                  <span style="display: inline-flex; align-items: center" data-testid="ds-form-key-label">
                    业务表单
                    <el-tooltip
                      v-if="form.type === 'SQL' || form.type === 'API'"
                      content="有值时合并表单列，CRUD 映射到主表"
                      placement="top"
                    >
                      <el-icon data-testid="ds-form-key-hint" class="sql-key-hint-icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <template v-if="form.type === 'FORM'">
                  <el-select v-model="form.formKey" placeholder="选择已发布的业务表单" filterable style="width: 100%" disabled>
                    <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
                <template v-else-if="form.type === 'WORKFLOW'">
                  <el-select v-model="form.formKey" placeholder="选择已发布的工作流表单" filterable style="width: 100%" disabled>
                    <el-option v-for="f in publishedWorkflowForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
                <template v-else-if="form.type === 'SYSTEM'">
                  <el-input disabled placeholder="系统数据源无需绑定业务表单" value="" />
                </template>
                <template v-else-if="form.type === 'SQL' || form.type === 'API'">
                  <el-select
                    v-model="form.formKey"
                    placeholder="绑定主表单（可选）"
                    filterable
                    clearable
                    style="width: 100%"
                    :disabled="isReadonlyForm"
                  >
                    <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <el-tabs v-model="activeTab" @tab-click="onTabClick" style="margin-top: 4px">
          <el-tab-pane label="接口配置" name="config">
            <!-- 可滚动操作区 -->

            <div class="ops-scroll">

              <!-- ===== API：可编辑表单 ===== -->
              <template v-if="form.type === 'API'">
        <el-form :model="form" label-width="110px" label-position="left">
                  <el-form-item :label="opLabel.list">
                    <div class="op-editor">
                      <el-input v-model="apiOps.list.action" placeholder="如 /v1/products" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.list.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                      <el-input v-model="apiOps.list.parse" placeholder="列表解析（如 records / content / data.records）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-input v-model="apiOps.list.totalParse" placeholder="总数解析（留空取数组长度）" style="width: 180px" :disabled="isReadonlyForm" />
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.get">
                    <div class="op-editor">
                      <el-input v-model="apiOps.get.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.get.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.create">
                    <div class="op-editor">
                      <el-input v-model="apiOps.create.action" placeholder="如 /v1/products" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.create.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.update">
                    <div class="op-editor">
                      <el-input v-model="apiOps.update.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.update.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.delete">
                    <div class="op-editor">
                      <el-input v-model="apiOps.delete.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.delete.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item label="搜索参数">
                    <div class="op-editor">
                      <el-input v-model="form.searchParam" placeholder="搜索参数名（如 kw，默认 keyword）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-input v-model="form.keywordColumn" placeholder="搜索列名（如 name）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-select v-model="form.pageBase" style="width: 130px" :disabled="isReadonlyForm">
                        <el-option label="页码从 1 开始" :value="1" />
                        <el-option label="页码从 0 开始" :value="0" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item label="固定参数 JSON">
                    <el-input v-model="form.data" placeholder='可选，如 {"dept":"IT"}' rows="2" type="textarea" :disabled="isReadonlyForm" />
                  </el-form-item>
                  <el-form-item label="请求头 JSON">
                    <el-input v-model="form.headers" placeholder='可选，如 {"X-Api-Key":"abc"}' rows="2" type="textarea" :disabled="isReadonlyForm" />
                  </el-form-item>
                </el-form>
              </template>

              <!-- ===== SQL：可视化配置/SQL 模式按钮切换 ===== -->
              <template v-else-if="form.type === 'SQL'">
                <el-radio-group v-model="sqlConfig.queryMode" style="margin-bottom: 12px" @change="onSqlModeChange">
                  <el-radio-button value="visual">可视化配置</el-radio-button>
                  <el-radio-button value="sql">SQL 模式</el-radio-button>
                </el-radio-group>
                <div v-if="sqlConfig.queryMode === 'visual'">
                  <el-alert v-if="sqlConfig.isStale" title="SQL 已手动修改，可视化配置已锁定" type="warning" show-icon :closable="false" style="margin-bottom: 12px">
                    <template #default>
                      <el-button size="small" type="primary" plain @click="resetToVisual">重置为可视化</el-button>
                    </template>
                  </el-alert>
                  <VisualQueryBuilder
                    v-if="!sqlConfig.isStale"
                    v-model="sqlConfig.visual"
                    v-model:params="sqlConfig.declaredParams"
                    :tables="visualTableCandidates"
                    :table-fields="sqlTableFields"
                    :disabled="isReadonlyForm"
                  />
                </div>
                <div v-else>
                  <SqlEditor
                    v-model="sqlConfig.queryText"
                    v-model:columns="sqlConfig.declaredColumns"
                    v-model:params="sqlConfig.declaredParams"
                    :disabled="isReadonlyForm"
                    @update:model-value="markSqlEdited"
                  />
                </div>
              </template>

              <!-- ===== FORM / SYSTEM：只读端点展示 ===== -->
              <template v-else-if="generateEndpoints()">
                <div class="auto-params-display">
                  <div v-for="(op, name) in generateEndpoints()" :key="name" class="op-row">
                    <el-tag :type="op.readonly ? 'info' : op.method === 'GET' ? 'primary' : op.method === 'POST' ? 'success' : 'warning'" size="small">
                      {{ op.method }}
                    </el-tag>
                    <code>{{ op.action }}</code>
                    <span class="op-label">（{{ name }}）</span>
                    <el-tag v-if="op.readonly" type="danger" size="small">只读</el-tag>
                    <template v-if="op.parse">
                      <span class="op-meta">parse: {{ op.parse }}</span>
                    </template>
                    <template v-if="op.totalParse">
                      <span class="op-meta">totalParse: {{ op.totalParse }}</span>
                    </template>
                  </div>
                </div>
                <!-- FORM：关联查询配置（单表 / 声明式 JOIN / SQL 模板 三模式） -->
                <template v-if="form.type === 'FORM'">
                  <el-divider content-position="left">关联查询配置</el-divider>
                  <FormJoinConfig
                    v-model="formJoin"
                    :main-form-key="form.formKey"
                    :target-form-options="formJoinTargets"
                    :disabled="formJoinDisabled"
                  />
                </template>
              </template>

            </div>
          </el-tab-pane>

          <el-tab-pane label="字段元数据" name="metadata">
            <div class="metadata-section">
              <template v-if="isEditableType">
                <div class="metadata-toolbar-inline">
                  <el-button v-if="form.type === 'SQL'" size="small" type="primary" plain :loading="probeLoading" @click="handleExploreSql">
                    获取字段
                  </el-button>
                  <el-button v-else-if="form.type === 'API'" size="small" type="primary" plain :loading="probeLoading" @click="handleExploreApi">
                    推断字段
                  </el-button>
                  <el-button v-if="form.formKey" size="small" plain :loading="overlayLoading" @click="handleOverlayFromForm">
                    从主表单覆盖
                  </el-button>
                </div>
                <el-table :data="metadataColumns" size="small" border style="width: 100%" :max-height="300">
                  <el-table-column label="标识" min-width="120">
                    <template #default="{ row }">
                      <el-input v-model="row.key" placeholder="标识" size="small" />
                    </template>
                  </el-table-column>
                  <el-table-column label="字段名" min-width="130">
                    <template #default="{ row }">
                      <el-input v-model="row.label" placeholder="字段名" size="small" />
                    </template>
                  </el-table-column>
                  <el-table-column label="DB类型" min-width="100">
                    <template #default="{ row }">
                      <el-select v-model="row.columnType" clearable filterable placeholder="—" size="small" style="width: 100%">
                        <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column label="长度" width="80">
                    <template #default="{ row }">
                      <el-input-number v-model="row.length" :min="0" :max="10000" controls-position="right" size="small" style="width: 100%" />
                    </template>
                  </el-table-column>
                  <el-table-column label="精度" width="70">
                    <template #default="{ row }">
                      <el-input-number v-model="row.scale" :min="0" :max="10" controls-position="right" size="small" style="width: 100%" />
                    </template>
                  </el-table-column>
                  <el-table-column label="必填" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.required" />
                    </template>
                  </el-table-column>
                  <el-table-column label="唯一" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.unique" />
                    </template>
                  </el-table-column>
                  <el-table-column label="索引" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.indexed" />
                    </template>
                  </el-table-column>
                  <el-table-column label="隐藏" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.hidden" />
                    </template>
                  </el-table-column>
                  <el-table-column label="排序" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.sortable" />
                    </template>
                  </el-table-column>
                  <el-table-column label="筛选" width="55" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.filterable" />
                    </template>
                  </el-table-column>
                  <el-table-column label="查询方式" min-width="100">
                    <template #default="{ row }">
                      <el-select v-model="row.matchType" clearable placeholder="按类型" size="small" style="width: 100%">
                        <el-option v-for="opt in matchTypeOptions(row)" :key="opt.value" :label="opt.label" :value="opt.value" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column label="" width="80" align="center" fixed="right">
                    <template #default="{ row }">
                      <el-button :icon="Edit" circle size="small" text @click="openColumnDetail(row)" title="详情" />
                      <el-button :icon="Delete" circle size="small" text type="danger" @click="removeMetadataColumn(row)" title="删除" />
                    </template>
                  </el-table-column>
                </el-table>
                <el-button type="primary" plain size="small" style="margin-top: 4px" @click="addMetadataColumn">添加列</el-button>

                <el-dialog v-model="columnDialogVisible" title="字段详情" width="800px" append-to-body>
                  <el-form v-if="editingColumn" label-position="top">
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <el-form-item label="标识">
                          <el-input v-model="editingColumn.key" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="字段名">
                          <el-input v-model="editingColumn.label" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="DB类型">
                          <el-select v-model="editingColumn.columnType" style="width: 100%">
                            <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <el-form-item label="长度">
                          <el-input-number v-model="editingColumn.length" :min="0" :max="10000" controls-position="right" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="精度">
                          <el-input-number v-model="editingColumn.scale" :min="0" :max="10" controls-position="right" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16">
                      <el-col :span="4">
                        <el-form-item label="必填">
                          <el-checkbox v-model="editingColumn.required">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                      <el-col :span="4">
                        <el-form-item label="唯一">
                          <el-checkbox v-model="editingColumn.unique">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                      <el-col :span="4">
                        <el-form-item label="索引">
                          <el-checkbox v-model="editingColumn.indexed">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                      <el-col :span="4">
                        <el-form-item label="隐藏">
                          <el-checkbox v-model="editingColumn.hidden">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                      <el-col :span="4">
                        <el-form-item label="排序">
                          <el-checkbox v-model="editingColumn.sortable">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                      <el-col :span="4">
                        <el-form-item label="筛选">
                          <el-checkbox v-model="editingColumn.filterable">启用</el-checkbox>
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <el-form-item label="查询方式">
                          <el-select v-model="editingColumn.matchType" clearable placeholder="按类型推导" style="width: 100%">
                            <el-option v-for="opt in matchTypeOptions(editingColumn)" :key="opt.value" :label="opt.label" :value="opt.value" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </el-form>
                  <template #footer>
                    <el-button @click="columnDialogVisible = false">取消</el-button>
                    <el-button type="primary" @click="columnDialogVisible = false">保存</el-button>
                  </template>
                </el-dialog>
              </template>

              <template v-else>
                <el-table
                  :data="metadata?.columns || []"
                  v-loading="metadataLoading"
                  style="width: 100%"
                  :max-height="300"
                >
                  <template #empty>
                    <el-empty
                      :description="form.type === 'FORM' || form.type === 'WORKFLOW'
                        ? '绑定表单尚未发布，发布表单后此处将展示字段元数据'
                        : '暂无字段元数据'"
                      :image-size="64"
                    />
                  </template>
                  <el-table-column prop="label" label="字段名" min-width="150" show-overflow-tooltip />
                  <el-table-column prop="key" label="标识" min-width="140" show-overflow-tooltip />
                  <el-table-column prop="componentType" label="组件" min-width="90" />
                  <el-table-column prop="columnType" label="DB类型" min-width="80" />
                  <el-table-column label="长度" width="60" align="center">
                    <template #default="{ row }">{{ row.length ?? '—' }}</template>
                  </el-table-column>
                  <el-table-column label="精度" width="60" align="center">
                    <template #default="{ row }">{{ row.scale ?? '—' }}</template>
                  </el-table-column>
                  <el-table-column label="必填" width="50" align="center">
                    <template #default="{ row }">
                      <span :style="boolIconStyle(row.required)">{{ row.required ? '✓' : '✗' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="唯一" width="50" align="center">
                    <template #default="{ row }">
                      <span :style="boolIconStyle(row.unique)">{{ row.unique ? '✓' : '✗' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="隐藏" width="55" align="center">
                    <template #default="{ row }">
                      <span :style="boolIconStyle(row.hidden)">{{ row.hidden ? '✓' : '✗' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="排序" width="55" align="center">
                    <template #default="{ row }">
                      <span :style="boolIconStyle(row.sortable)">{{ row.sortable ? '✓' : '✗' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="筛选" width="55" align="center">
                    <template #default="{ row }">
                      <span :style="boolIconStyle(row.filterable)">{{ row.filterable ? '✓' : '✗' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="查询方式" min-width="85">
                    <template #default="{ row }">{{ row.matchType || '按类型' }}</template>
                  </el-table-column>
                </el-table>
              </template>

              <div v-if="metadataError" class="metadata-error">
                <el-alert :title="metadataError" type="error" />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="数据预览" name="data">
            <div class="preview-section">
              <div class="preview-toolbar-inline">
                <el-input
                  v-model="previewKeyword"
                  placeholder="搜索关键词"
                  style="width: 200px"
                  size="small"
                />
                <el-button type="primary" size="small" :loading="dataLoading" @click="onSearch">
                  搜索
                </el-button>
              </div>
              <el-table
                :data="previewTableData"
                v-loading="dataLoading"
                style="width: 100%"
                :max-height="300"
              >
                <el-table-column
                  v-for="col in displayColumns"
                  :key="col.key"
                  :prop="col.key"
                  :label="col.label"
                  min-width="120"
                  show-overflow-tooltip
                />
              </el-table>
              <el-row :gutter="8" class="preview-pagination" style="margin-top: 8px">
                <el-col style="display: flex; justify-content: flex-end">
                  <el-pagination
                    layout="total, prev, pager, next"
                    :page-size="previewSize"
                    :total="previewTotal"
                    :current-page="previewPage"
                    @size-change="onPageSizeChange"
                    @current-change="onPageChange"
                  />
                </el-col>
              </el-row>
              <div v-if="dataError" class="preview-error">
                <el-alert :title="dataError" type="error" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
          </div>
          <div class="inline-form-footer">
            <template v-if="viewOnly">
              <el-button type="primary" @click="inlineVisible = false">关闭</el-button>
            </template>
            <template v-else>
              <el-button @click="inlineVisible = false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
            </template>
          </div>
        </div>
      </div>
   </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DataSourceList' })

import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Edit, Delete, Close, QuestionFilled, Grid } from '@element-plus/icons-vue'
import { clearHttpCache } from '@/utils/http'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton } from '@/components/business/types'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO } from '@/api/data-source'
import type { ColumnConfigItem, BizDataVO } from '@/api/bizData'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import VisualQueryBuilder, { type VisualQueryConfig } from './components/VisualQueryBuilder.vue'
import SqlEditor from './components/SqlEditor.vue'
import FormJoinConfig, { type FormJoinConfigValue, type JoinConfigItem } from './components/FormJoinConfig.vue'
import { SYSTEM_JOIN_TARGET_KEYS } from './components/joinColumns'

const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（FORM 类型 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])
/** 数据库全部基础表名（SQL 可视化主表/JOIN 目标表下拉候选，真实 schema，排除 flyway） */
const dbTables = ref<string[]>([])
/** SQL 可视化主表候选：已选主表首位 + 数据库全表去重（不再依赖已发布表单白名单） */
const visualTableCandidates = computed(() => {
  const main = (sqlConfig.visual.mainTable || '').trim()
  const list = main ? [main] : []
  const seen = new Set(list)
  for (const t of dbTables.value) {
    if (!seen.has(t)) {
      list.push(t)
      seen.add(t)
    }
  }
  return list
})

/** 已发布工作流表单（WORKFLOW 类型 formKey 下拉候选） */
const publishedWorkflowForms = ref<FormDefinitionDTO[]>([])

/** API 操作 HTTP 方法候选 */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const

/** 列定义字段类型候选（第一版：仅列定义字段，不含 componentType） */
const COLUMN_TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DECIMAL', 'DATETIME', 'DATE', 'TEXT', 'TINYINT'] as const

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '数据源名称', prop: 'name', placeholder: '搜索数据源名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '业务表单', value: 'FORM' },
      { label: '工作流表单', value: 'WORKFLOW' },
      { label: '系统结构', value: 'SYSTEM' },
      { label: '第三方 API', value: 'API' },
      { label: 'SQL 查询', value: 'SQL' },
    ],
    style: 'width: 140px',
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '全部',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已启用', value: 'ENABLED' },
      { label: '已禁用', value: 'DISABLED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '数据源名称', minWidth: 180 },
  { prop: 'type', label: '类型', width: 110, align: 'center', slotName: 'type' },
  { prop: 'bound', label: '绑定对象', minWidth: 160, slotName: 'bound' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await dataSourceApi.getDataSources({
      page: params.page || 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 新建/编辑内嵌覆盖层状态 ==========
const inlineVisible = ref(false)
/** 保存进行中（footer 保存按钮 loading） */
const saving = ref(false)
const editingId = ref<string | null>(null)
/** 纯查看模式（openView 打开，区别于可编辑的 API 编辑模式） */
const viewOnly = ref(false)

/** 是否为查看模式（弹窗处于打开态） */
const isViewMode = computed(() => editingId.value !== null)

/** 是否为可手动编辑的类型（API + SQL） */
const isEditableType = computed(() => form.type === 'API' || form.type === 'SQL')

/** 表单整体只读：纯查看模式，或非可编辑类型（FORM/WORKFLOW/SYSTEM 由系统管理） */
const isReadonlyForm = computed(() => viewOnly.value || !isEditableType.value)

/** 弹窗标题 */
const dialogTitle = computed(() => {
  if (viewOnly.value) {
    return '查看数据源'
  }
  return isEditableType.value ? (editingId.value ? '编辑数据源' : '新建数据源') : '数据源详情'
})
/** 单操作配置（多操作 params 结构） */
interface ApiOpConfig {
  action: string
  method: string
  parse?: string
  totalParse?: string
}

/** 弹窗表单（类型无关字段 + API 公共字段） */
const form = reactive({
  name: '',
  type: 'FORM' as string,
  formKey: '',
  sourceKey: '',
  searchParam: '',
  keywordColumn: '',
  pageBase: 1 as 0 | 1,
  data: '',
  headers: '',
})

/** API 类型：五个操作配置 */
const apiOps = reactive<Record<'list' | 'get' | 'create' | 'update' | 'delete', ApiOpConfig>>({
  list: { action: '', method: 'GET' },
  get: { action: '', method: 'GET' },
  create: { action: '', method: 'POST' },
  update: { action: '', method: 'PUT' },
  delete: { action: '', method: 'DELETE' },
})

/** API 类型：列定义 */
const apiColumns = ref<ColumnConfigItem[]>([])

/** SQL 类型：查询配置（复用 VisualQueryBuilder 导出的类型） */
const sqlConfig = reactive({
  queryMode: 'visual' as 'visual' | 'sql',
  visual: { mainTable: '', mainAlias: 'm', joins: [], selectColumns: [] as string[], selectColumnsInput: '', where: [], orderBy: [] } as VisualQueryConfig,
  queryText: '',
  declaredColumns: [] as ColumnConfigItem[],
  declaredParams: [] as string[],
  isStale: false,  // SQL 手改后标记为过期
})

/** FORM 类型：关联查询配置（queryMode 选择 + config joins / sql 模板） */
const formJoin = ref<FormJoinConfigValue>({
  queryMode: 'none',
  joins: [] as JoinConfigItem[],
  query: '',
  columns: [] as ColumnConfigItem[],
  params: [] as string[],
})

/** FORM JOIN 目标表候选：enabled 的 FORM 类型数据源 + 5 个结构化内建数据源（targetFormKey 下拉） */
const formJoinTargets = ref<{ key: string; name: string }[]>([])

/** 内建 JOIN 目标白名单（与 joinColumns.ts SYSTEM_JOIN_TARGET_COLUMNS 同源） */
const JOIN_BUILTIN_TARGET_KEYS = SYSTEM_JOIN_TARGET_KEYS

/** FORM 原始 params 端点段（list/get/create/update/delete），保存时保留并叠加 queryMode 配置 */
const formJoinBaseParams = ref<Record<string, any>>({})

/** FORM 关联查询配置是否可编辑：仅编辑模式（非查看）的 FORM 类型 */
const formJoinDisabled = computed(() => viewOnly.value || form.type !== 'FORM')

/** SQL 可视化：主表/JOIN 目标表字段懒加载缓存（表名 → 字段 key 列表） */
const sqlTableFields = ref<Record<string, string[]>>({})

/** 按数据库真实表结构懒加载字段（information_schema 列，不再剥前缀查表单定义） */
async function ensureTableFields(table: string) {
  if (!table || sqlTableFields.value[table]) return
  try {
    const res = await dataSourceApi.getDbSchemaColumns(table)
    const cols = res.data || []
    sqlTableFields.value[table] = cols.map((c) => c.key).filter(Boolean)
  } catch {
    // 列加载失败不阻断主流程
  }
}

// 主表变化 → 懒加载字段
watch(
  () => sqlConfig.visual.mainTable,
  (t) => {
    if (t) ensureTableFields(t)
  },
)
// JOIN 目标表变化 → 懒加载字段
watch(
  () => sqlConfig.visual.joins.map((j) => j.targetTable),
  (targets) => {
    targets.forEach((t) => {
      if (t) ensureTableFields(t)
    })
  },
)

/** 当前激活标签：config / metadata / data */
const activeTab = ref('config')

/** ================ 字段元数据 ================= */
const metadata = ref<DataSourceMetadataDTO | null>(null)
const metadataLoading = ref(false)
const metadataError = ref<string | null>(null)

/** 布尔值图标样式：true 蓝色，false 灰色 */
function boolIconStyle(v: boolean | undefined): Record<string, string> {
  return { color: v ? '#409EFF' : '#c0c4cc', cursor: 'default' }
}

/** 查询方式选项（按列类型裁剪）：数值/日期 → 等值/范围；文本 → 等值/模糊 */
function matchTypeOptions(col: { columnType?: string }): { label: string; value: string }[] {
  const t = col.columnType || ''
  if (t === 'INT' || t === 'BIGINT' || t === 'TINYINT' || t === 'DECIMAL'
    || t === 'DATE' || t === 'DATETIME') {
    return [
      { label: '等值', value: 'eq' },
      { label: '范围', value: 'range' },
    ]
  }
  return [
    { label: '等值', value: 'eq' },
    { label: '模糊', value: 'like' },
  ]
}

/** ================ 数据预览 ================= */
const previewData = ref<BizDataVO[]>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewSize = ref(20)
const previewKeyword = ref('')
const dataLoading = ref(false)
const dataError = ref<string | null>(null)

/** 操作表单标签（统一界面，所有类型显示相同标签） */
const opLabel = computed(() => ({ list: '列表查询 (list)', get: '单条查询 (get)', create: '新增 (create)', update: '修改 (update)', delete: '删除 (delete)' }))

/** 元数据表格列定义（用于渲染） */
const displayColumns = computed(() => metadata.value?.columns || [])

/** 数据预览表格显示数据（扁平化 BizDataVO.data） */
const previewTableData = computed(() => {
  return previewData.value.map((row) => ({
    id: row.id,
    _version: row.version,
    ...(row.data || {})
  }))
})

/** 重置元数据/预览状态（每次打开弹窗时清空） */
function resetMetadataState() {
  metadata.value = null
  metadataLoading.value = false
  metadataError.value = null
}

function resetPreviewState() {
  previewData.value = []
  previewTotal.value = 0
  previewPage.value = 1
  previewKeyword.value = ''
  dataLoading.value = false
  dataError.value = null
}

/** 处理标签切换 (el-tabs @tab-click 事件) */
async function onTabClick(tab: { props: { name: string } }) {
  await handleTabChange(tab.props.name)
}

/** 处理标签切换 (直接调用用) */
async function handleTabChange(tab: string) {
  activeTab.value = tab
  if (tab === 'metadata' && editingId.value && !metadata.value) {
    await loadMetadata()
  }
  if (tab === 'data' && editingId.value) {
    // 数据预览需要列定义：若元数据未加载，先加载元数据
    if (!metadata.value) {
      await loadMetadata()
    }
    await loadPreviewData()
  }
}

/** 加载元数据 */
async function loadMetadata() {
  if (!editingId.value) return
  metadataLoading.value = true
  metadataError.value = null
  try {
    const res = await dataSourceApi.getMetadata(editingId.value)
    metadata.value = res.data
  } catch (e: any) {
    metadataError.value = e?.message || '加载字段元数据失败'
  } finally {
    metadataLoading.value = false
  }
}

/** ================ 字段元数据编辑（SQL/API 单一来源：sqlConfig.declaredColumns / apiColumns） ================ */

/** 编辑对象：SQL → declaredColumns，API → apiColumns */
const metadataColumns = computed(() =>
  form.type === 'API' ? apiColumns.value : sqlConfig.declaredColumns,
)

const probeLoading = ref(false)
const overlayLoading = ref(false)
const editingColumn = ref<ColumnConfigItem | null>(null)
const columnDialogVisible = ref(false)

/** 执行 SQL 探测：完整 SQL（visual 预览或手写）→ 全量替换 declaredColumns */
async function handleExploreSql() {
  const sql = sqlConfig.queryMode === 'visual' ? generatePreviewSql() : sqlConfig.queryText
  if (!sql?.trim()) {
    ElMessage.warning('请先填写 SQL（可视化或 SQL 模式）')
    return
  }
  probeLoading.value = true
  try {
    const res = await dataSourceApi.exploreSql(sql)
    sqlConfig.declaredColumns = (res.data || []).map(toColumnConfigItem)
    ElMessage.success(`已获取 ${sqlConfig.declaredColumns.length} 个字段`)
  } catch (e: any) {
    ElMessage.error(e?.message || 'SQL 探测失败')
  } finally {
    probeLoading.value = false
  }
}

/** 从接口推断字段：list 操作拉样例 → 全量替换 apiColumns */
async function handleExploreApi() {
  const op = apiOps.list
  if (!op.action?.trim()) {
    ElMessage.warning('请先配置 list 操作地址')
    return
  }
  probeLoading.value = true
  try {
    const res = await dataSourceApi.exploreApi({
      action: op.action.trim(),
      method: op.method || 'GET',
      data: parseParamsJson(form.data) || undefined,
    })
    apiColumns.value = (res.data || []).map(toColumnConfigItem)
    ElMessage.success(`已获取 ${apiColumns.value.length} 个字段`)
  } catch (e: any) {
    ElMessage.error(e?.message || '接口字段推断失败')
  } finally {
    probeLoading.value = false
  }
}

/** 从主表单覆盖（策略 C）：key 命中 → 全属性覆盖；表单多出的 key → 追加 */
async function handleOverlayFromForm() {
  if (!form.formKey) {
    ElMessage.warning('未绑定主表单，无法覆盖')
    return
  }
  overlayLoading.value = true
  try {
    const res = await formApi.getFormDefinitionByKey(form.formKey)
    const data = res.data as any
    const cfg = data?.columnConfig
    let formCols: ColumnConfigItem[] = []
    if (typeof cfg === 'string' && cfg) {
      try {
        formCols = JSON.parse(cfg) as ColumnConfigItem[]
      } catch {
        formCols = []
      }
    } else if (Array.isArray(cfg)) {
      formCols = cfg as ColumnConfigItem[]
    }
    if (formCols.length === 0) {
      ElMessage.warning('主表单无可用列定义')
      return
    }
    overlayFromFormColumns(formCols)
    ElMessage.success(`已按主表单覆盖 ${formCols.length} 个字段`)
  } catch (e: any) {
    ElMessage.error(e?.message || '主表单覆盖失败')
  } finally {
    overlayLoading.value = false
  }
}

/** 覆盖策略 C：命中 key 全属性覆盖（保留 key），表单多出的 key 追加，当前列保留 */
function overlayFromFormColumns(formCols: ColumnConfigItem[]) {
  const target = form.type === 'API' ? apiColumns.value : sqlConfig.declaredColumns
  const byKey = new Map(target.map((c) => [c.key, c]))
  for (const fc of formCols) {
    if (byKey.has(fc.key)) {
      Object.assign(byKey.get(fc.key)!, fc, { key: fc.key })
    } else {
      target.push({ ...fc })
      byKey.set(fc.key, target[target.length - 1])
    }
  }
}

/** 探测结果 → ColumnConfigItem（全字段初始化，布尔默认值防 v-model undefined） */
function toColumnConfigItem(c: any): ColumnConfigItem {
  return {
    key: c.key,
    label: c.label || c.key,
    columnType: c.columnType || 'VARCHAR',
    length: c.length ?? null,
    scale: c.scale ?? null,
    required: false,
    unique: false,
    indexed: false,
    hidden: false,
    sortable: true,
    filterable: true,
    matchType: c.matchType ?? null,
  }
}

/** ColumnConfigItem → 全字段序列化（保存 params.columns，字段元数据 tab 编辑结果单一来源） */
function serializeColumnConfig(c: ColumnConfigItem): Record<string, any> {
  const item: Record<string, any> = {
    key: c.key.trim(),
    label: c.label || c.key.trim(),
    columnType: c.columnType || 'VARCHAR',
    sortable: !!c.sortable,
    filterable: !!c.filterable,
  }
  if (c.length != null) item.length = c.length
  if (c.scale != null) item.scale = c.scale
  // 布尔约束显式输出（false 也写回，保证全字段往返一致）
  item.required = !!c.required
  item.unique = !!c.unique
  item.indexed = !!c.indexed
  item.hidden = !!c.hidden
  if (c.matchType) item.matchType = c.matchType
  return item
}

function openColumnDetail(row: ColumnConfigItem) {
  editingColumn.value = row
  columnDialogVisible.value = true
}

function addMetadataColumn() {
  metadataColumns.value.push(toColumnConfigItem({ key: '', label: '', columnType: 'VARCHAR' }))
}

function removeMetadataColumn(row: ColumnConfigItem) {
  const idx = metadataColumns.value.indexOf(row)
  if (idx >= 0) {
    metadataColumns.value.splice(idx, 1)
  }
}

/** 加载数据预览 */
async function loadPreviewData() {
  if (!editingId.value) return
  dataLoading.value = true
  dataError.value = null
  try {
    const res = await dataSourceApi.queryData(editingId.value, {
      page: previewPage.value,
      size: previewSize.value,
      keyword: previewKeyword.value || undefined,
    })
    previewData.value = res.data.records || []
    previewTotal.value = res.data.total || 0
  } catch (e: any) {
    dataError.value = e?.message || '加载数据失败'
  } finally {
    dataLoading.value = false
  }
}

/** 搜索 */
function onSearch() {
  previewPage.value = 1
  loadPreviewData()
}

/** 分页尺寸改变 */
function onPageSizeChange(size: number) {
  previewSize.value = size
  previewPage.value = 1
  loadPreviewData()
}

/** 页码改变 */
function onPageChange(page: number) {
  previewPage.value = page
  loadPreviewData()
}

function openCreate() {
  editingId.value = null
  viewOnly.value = false
  form.name = ''
  // 支持手动新建 API 和 SQL 数据源
  form.type = 'API'
  form.formKey = ''
  form.sourceKey = ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
  apiColumns.value = []
  // SQL 类型初始化
  sqlConfig.queryMode = 'visual'
  sqlConfig.visual = { mainTable: '', mainAlias: 'm', joins: [], selectColumns: [], selectColumnsInput: '', where: [], orderBy: [] }
  sqlConfig.queryText = ''
  sqlConfig.declaredColumns = []
  sqlConfig.declaredParams = []
  sqlConfig.isStale = false
  // FORM 关联查询配置重置
  formJoin.value.queryMode = 'none'
  formJoin.value.joins = []
  formJoin.value.query = ''
  formJoin.value.columns = []
  formJoin.value.params = []
  formJoinBaseParams.value = {}
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
}

async function openEdit(row: DataSourceDTO) {
  editingId.value = row.id
  viewOnly.value = false
  form.name = row.name
  form.type = row.type
  form.formKey = row.formKey || ''
  form.sourceKey = row.sourceKey || ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
   apiColumns.value = []
  // 解析 params JSON：API类型手动配置；FORM/SYSTEM则根据标识自动填充
  let p: Record<string, any> = {}
  if (row.params) {
    try {
      p = JSON.parse(row.params)
    } catch {
      p = {}
    }
  }
  if (row.type === 'API') {
    for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
      const cfg = p[op]
      if (cfg && typeof cfg === 'object') {
        apiOps[op] = {
          action: cfg.action || '',
          method: (cfg.method || 'GET').toUpperCase(),
          parse: cfg.parse || '',
          totalParse: cfg.totalParse || '',
        }
      }
    }
    form.searchParam = p.searchParam || ''
    form.keywordColumn = p.keywordColumn || ''
    form.pageBase = p.pageBase === 0 ? 0 : 1
    form.data = p.data ? JSON.stringify(p.data) : ''
    form.headers = p.headers ? JSON.stringify(p.headers) : ''
    apiColumns.value = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
  } else if (row.type === 'SQL') {
    // SQL 类型：解析 queryMode + visual/query
    sqlConfig.queryMode = (p.queryMode as 'visual' | 'sql') || 'visual'
    sqlConfig.isStale = false
    if (p.visual) {
      sqlConfig.visual.mainTable = p.visual.mainTable || ''
      sqlConfig.visual.mainAlias = p.visual.mainAlias || 'm'
      sqlConfig.visual.joins = p.visual.joins || []
      sqlConfig.visual.selectColumns = p.visual.selectColumns || []
      sqlConfig.visual.selectColumnsInput = (p.visual.selectColumns || []).join(', ')
      sqlConfig.visual.where = p.visual.where || []
      sqlConfig.visual.orderBy = p.visual.orderBy || []
    }
    sqlConfig.queryText = p.query || ''
    sqlConfig.declaredColumns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    sqlConfig.declaredParams = Array.isArray(p.params) ? (p.params as string[]) : []
  } else if (row.type === 'FORM' || row.type === 'SYSTEM') {
    // FORM/SYSTEM：只读端点展示由模板根据 formKey/sourceKey 响应式计算，无需填充 apiOps
  }
  if (row.type === 'FORM') {
    // FORM 关联查询配置：queryMode + config joins / sql query+columns+params
    formJoin.value.queryMode = (p.queryMode as FormJoinConfigValue['queryMode']) || 'none'
    formJoin.value.joins = Array.isArray(p.joins) ? (p.joins as JoinConfigItem[]) : []
    formJoin.value.query = p.query || ''
    formJoin.value.columns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    formJoin.value.params = Array.isArray(p.params) ? (p.params as string[]) : []
    // 保留原始端点段（list/get/create/update/delete），保存时叠加 queryMode 配置
    formJoinBaseParams.value = { ...p }
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
}

/** 查看数据源详情（只读模式） */
function openView(row: DataSourceDTO) {
  editingId.value = row.id
  viewOnly.value = true
  form.name = row.name
  form.type = row.type
  form.formKey = row.formKey || ''
  form.sourceKey = row.sourceKey || ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
  apiColumns.value = []
  // 解析 params JSON
  let p: Record<string, any> = {}
  if (row.params) {
    try {
      p = JSON.parse(row.params)
    } catch {
      p = {}
    }
  }
  if (row.type === 'API') {
    for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
      const cfg = p[op]
      if (cfg && typeof cfg === 'object') {
        apiOps[op] = {
          action: cfg.action || '',
          method: (cfg.method || 'GET').toUpperCase(),
          parse: cfg.parse || '',
          totalParse: cfg.totalParse || '',
        }
      }
    }
    form.searchParam = p.searchParam || ''
    form.keywordColumn = p.keywordColumn || ''
    form.pageBase = p.pageBase === 0 ? 0 : 1
    form.data = p.data ? JSON.stringify(p.data) : ''
    form.headers = p.headers ? JSON.stringify(p.headers) : ''
    apiColumns.value = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
  } else if (row.type === 'SQL') {
    // SQL 类型：查看模式同样填充 sqlConfig（表单整体只读）
    sqlConfig.queryMode = (p.queryMode as 'visual' | 'sql') || 'visual'
    sqlConfig.isStale = false
    if (p.visual) {
      sqlConfig.visual.mainTable = p.visual.mainTable || ''
      sqlConfig.visual.mainAlias = p.visual.mainAlias || 'm'
      sqlConfig.visual.joins = p.visual.joins || []
      sqlConfig.visual.selectColumns = p.visual.selectColumns || []
      sqlConfig.visual.selectColumnsInput = (p.visual.selectColumns || []).join(', ')
      sqlConfig.visual.where = p.visual.where || []
      sqlConfig.visual.orderBy = p.visual.orderBy || []
    }
    sqlConfig.queryText = p.query || ''
    sqlConfig.declaredColumns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    sqlConfig.declaredParams = Array.isArray(p.params) ? (p.params as string[]) : []
  }
  if (row.type === 'FORM') {
    // FORM 关联查询配置（查看模式同样填充，表单整体只读）
    formJoin.value.queryMode = (p.queryMode as FormJoinConfigValue['queryMode']) || 'none'
    formJoin.value.joins = Array.isArray(p.joins) ? (p.joins as JoinConfigItem[]) : []
    formJoin.value.query = p.query || ''
    formJoin.value.columns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    formJoin.value.params = Array.isArray(p.params) ? (p.params as string[]) : []
    formJoinBaseParams.value = { ...p }
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
}

   function needsLength(type?: string | null): boolean {
   return type === 'VARCHAR' || type === 'DECIMAL' || type === 'INTEGER' || type === 'BIGINT' || type === 'TINYINT'
 }

 /** 解析 params JSON 为对象，空/非法返回 undefined */
 function parseParamsJson(text: string | null | undefined): Record<string, any> | undefined {
   if (!text || !text.trim()) return undefined
   try {
     const parsed = JSON.parse(text)
     if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
     return undefined
   } catch {
     return undefined
   }
 }

 /** API 类型：组装多操作 params（未配置的操作省略；列定义仅写入非空 key 行） */
 function buildApiParams(): Record<string, any> {
   const params: Record<string, any> = {}
   // 五个操作：action 为空则整体省略
   for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
     const cfg = apiOps[op]
     if (cfg.action && cfg.action.trim()) {
       const item: Record<string, any> = { action: cfg.action.trim(), method: (cfg.method || 'GET').toUpperCase() }
       if (op === 'list') {
         if (cfg.parse && cfg.parse.trim()) item.parse = cfg.parse.trim()
         if (cfg.totalParse && cfg.totalParse.trim()) item.totalParse = cfg.totalParse.trim()
       }
       params[op] = item
     }
   }
    // 列定义：过滤未填写 key 的行（全字段序列化，字段元数据 tab 编辑结果单一来源）
    const columns = apiColumns.value.filter((c) => c.key && c.key.trim())
    if (columns.length > 0) {
      params.columns = columns.map(serializeColumnConfig)
    }
   // 搜索/分页/固定参数/请求头
   if (form.searchParam && form.searchParam.trim()) params.searchParam = form.searchParam.trim()
   if (form.keywordColumn && form.keywordColumn.trim()) params.keywordColumn = form.keywordColumn.trim()
   if (form.pageBase === 0 || form.pageBase === 1) params.pageBase = form.pageBase
   const dataObj = parseParamsJson(form.data)
   if (dataObj) params.data = dataObj
   const headersObj = parseParamsJson(form.headers)
   if (headersObj) params.headers = headersObj
    return params
  }

  /** SQL 类型：组装 params JSON */
  function buildSqlParams(): Record<string, any> {
    const params: Record<string, any> = {}
    params.queryMode = sqlConfig.queryMode
    if (sqlConfig.queryMode === 'visual') {
      // 可视化配置：字段选择由 VisualQueryBuilder 直接写入 selectColumns（别名.字段），保存原样序列化
      params.visual = {
        mainTable: sqlConfig.visual.mainTable,
        mainAlias: sqlConfig.visual.mainAlias || 'm',
        joins: sqlConfig.visual.joins,
        selectColumns: sqlConfig.visual.selectColumns,
        where: sqlConfig.visual.where,
        orderBy: sqlConfig.visual.orderBy,
      }
      // 生成预览 SQL（前端简单拼接，后端 VisualSqlGenerator 会重新生成）
      params.query = generatePreviewSql()
    } else {
      // SQL 模式：直接使用手写 SQL
      params.query = sqlConfig.queryText
    }
    // 列声明（全字段序列化，字段元数据 tab 编辑结果单一来源）
    const columns = sqlConfig.declaredColumns.filter((c) => c.key && c.key.trim())
    if (columns.length > 0) {
      params.columns = columns.map(serializeColumnConfig)
    }
    // 运行时参数白名单
    if (sqlConfig.declaredParams.length > 0) {
      params.params = sqlConfig.declaredParams
    }
    return params
  }

  /** 可视化模式：前端生成预览 SQL（简化版，后端会重新生成） */
  function generatePreviewSql(): string {
    const v = sqlConfig.visual
    if (!v.mainTable) return ''
    let sql = `SELECT ${v.selectColumns.join(', ') || '*'}`
    sql += ` FROM ${v.mainTable} ${v.mainAlias || 'm'}`
    for (const j of v.joins) {
      if (j.targetTable && j.on) {
        sql += ` ${j.joinType} ${j.targetTable} ${j.alias} ON ${j.on}`
      }
    }
    sql += ` WHERE ${v.mainAlias || 'm'}.tenant_id = :tenantId`
    for (const w of v.where) {
      if (w.column && w.op) {
        sql += ` AND ${w.column} ${w.op} ?`
      }
    }
    if (v.orderBy.length > 0) {
      const parts = v.orderBy.filter((o) => o.column).map((o) => `${o.column} ${o.order || 'ASC'}`)
      if (parts.length > 0) sql += ` ORDER BY ${parts.join(', ')}`
    }
    return sql
  }

  /** 校验并保存 */
 async function handleSave() {
   if (!form.name || !form.name.trim()) {
     ElMessage.warning('请输入数据源名称')
     return
   }
    if (form.type === 'FORM' && !form.formKey) {
      ElMessage.warning('请选择绑定的业务表单')
      return
    }
    if (form.type === 'WORKFLOW' && !form.formKey) {
      ElMessage.warning('请选择绑定的工作流表单')
      return
    }
   if (form.type === 'SYSTEM' && !form.sourceKey) {
     ElMessage.warning('请选择系统结构')
     return
   }
   if (form.type === 'API') {
     if (!form.sourceKey || !form.sourceKey.trim()) {
       ElMessage.warning('请输入接口标识')
       return
     }
     if (!apiOps.list.action || !apiOps.list.action.trim()) {
       ElMessage.warning('列表查询 (list) 接口路径必填')
       return
     }
   }
    if (form.type === 'SQL') {
      if (!form.sourceKey || !form.sourceKey.trim()) {
        ElMessage.warning('请输入数据源标识（sourceKey）')
        return
      }
      if (sqlConfig.queryMode === 'visual' && !sqlConfig.visual.mainTable.trim()) {
        ElMessage.warning('请配置主表')
        return
      }
      if (sqlConfig.queryMode === 'sql' && !sqlConfig.queryText.trim()) {
        ElMessage.warning('请输入 SQL 模板')
        return
      }
    }
    if (form.type === 'FORM' && formJoin.value.queryMode === 'config') {
      const incomplete = formJoin.value.joins.find(
        (j) => !j.targetFormKey || !j.localField || !j.foreignField || !j.joinField || !j.virtualKey,
      )
      if (incomplete) {
        ElMessage.warning('请完整配置关联（目标表/关联字段/显示字段/虚拟列标识）')
        return
      }
    }
    if (form.type === 'FORM' && formJoin.value.queryMode === 'sql' && !(formJoin.value.query || '').trim()) {
      ElMessage.warning('请输入 SQL 模板')
      return
    }
    saving.value = true
    try {
      const payload = normalizePayload()
      if (editingId.value) {
        await dataSourceApi.updateDataSource(editingId.value, payload)
      } else {
        await dataSourceApi.createDataSource(payload)
      }
      ElMessage.success(editingId.value ? '保存成功' : '创建成功')
      // 清数据源 GET 缓存（含 metadata 30s TTL）：否则新配的 JOIN 虚拟列在元数据/编辑弹窗里最长 30s 不可见
      clearHttpCache('/v1/data-sources')
      inlineVisible.value = false
      tableRef.value?.fetchList()
    } catch {
      // http 拦截器已弹出错误消息
    } finally {
      saving.value = false
    }
 }

  /** FORM 类型：保留原始端点段（list/get/create/update/delete）基础上叠加关联查询配置段（queryMode/joins/query/columns/params） */
  function buildFormParams(): Record<string, any> {
    const params: Record<string, any> = { ...formJoinBaseParams.value }
    if (formJoin.value.queryMode === 'config') {
      params.queryMode = 'config'
      params.joins = formJoin.value.joins.filter((j) => j.targetFormKey && j.virtualKey)
    } else if (formJoin.value.queryMode === 'sql') {
      params.queryMode = 'sql'
      if (formJoin.value.query) {
        params.query = formJoin.value.query
      }
      const cols = (formJoin.value.columns || []).filter((c) => c.key && c.key.trim())
      if (cols.length > 0) {
        params.columns = cols.map(serializeColumnConfig)
      }
      if (formJoin.value.params && formJoin.value.params.length > 0) {
        params.params = [...formJoin.value.params]
      }
    }
    return params
  }

  /** 按类型归一化提交载荷：所有类型均通过统一 API 编辑器，FORM/SYSTEM params 由前端自动生成 */
  function normalizePayload(): any {
    return {
      name: form.name,
      type: form.type || 'FORM',
      formKey: form.type === 'FORM' || form.type === 'WORKFLOW' ? form.formKey || null : form.type === 'SQL' || form.type === 'API' ? form.formKey || null : null,
      sourceKey: form.type === 'SYSTEM' ? form.sourceKey || null : form.type === 'API' || form.type === 'SQL' ? form.sourceKey || null : null,
      params: form.type === 'SQL' ? JSON.stringify(buildSqlParams())
        : form.type === 'FORM' ? JSON.stringify(buildFormParams())
          : JSON.stringify(buildApiParams()),
    }
  }

  /** 生成统一 API 端点描述（FORM/SYSTEM 自动填充到 API 编辑器；WORKFLOW 经 SPI 按数据源 ID 访问） */
  function generateEndpoints(): Record<string, any> | null {
    if (form.type === 'FORM' && form.formKey) {
      const base = `/api/v1/biz-data/${form.formKey}`
      return {
        list: { action: base, method: 'GET', parse: 'records', totalParse: 'total' },
        get: { action: `${base}/{id}`, method: 'GET' },
        create: { action: base, method: 'POST' },
        update: { action: `${base}/{id}`, method: 'PUT' },
        delete: { action: `${base}/{id}`, method: 'DELETE' },
      }
    }
    if (form.type === 'SYSTEM' && form.sourceKey) {
      const internalKey = form.sourceKey === 'user-tree' ? 'users' : form.sourceKey
      return {
        list: { action: `/api/v1/internal/system/${internalKey}`, method: 'GET' },
      }
    }
    // WORKFLOW：只读数据源，经统一 SPI（DataSourceController）按数据源 ID 访问；写操作一律 400 拒绝
    if (form.type === 'WORKFLOW' && editingId.value) {
      const base = `/api/v1/data-sources/${editingId.value}`
      return {
        metadata: { action: `${base}/metadata`, method: 'GET' },
        list: { action: `${base}/data`, method: 'GET', parse: 'records', totalParse: 'total' },
        get: { action: `${base}/data/{id}`, method: 'GET' },
        create: { action: `${base}/data`, method: 'POST', readonly: true },
        update: { action: `${base}/data/{id}`, method: 'PUT', readonly: true },
        delete: { action: `${base}/data/{id}`, method: 'DELETE', readonly: true },
      }
    }
    return null
  }

// ========== 操作按钮 ==========
/** API 和 SQL 类型可手动编辑/删除；FORM/WORKFLOW/SYSTEM 由系统管理，仅可查看；
 *  系统内建数据源（tenantId=system，随应用启动预置）只读且不可删改/禁用 */
const actionButtons: ActionButton[] = [
  {
    label: '查看',
    icon: View,
    onClick: (row: any) => openView(row),
  },
  {
    label: '数据管理',
    icon: Grid,
    permission: 'data-source:manage',
    show: (row: any) => row.type !== 'WORKFLOW',
    onClick: (row: any) => router.push({ name: 'DataSourceData', params: { id: row.id } }),
  },
  {
    label: '编辑',
    icon: Edit,
    permission: 'data-source:manage',
    show: (row: any) => !isBuiltIn(row) && (row.type === 'API' || row.type === 'SQL' || row.type === 'FORM'),
    onClick: (row: any) => openEdit(row),
  },
  {
    label: '删除',
    type: 'danger',
    icon: Delete,
    permission: 'data-source:manage',
    show: (row: any) => !isBuiltIn(row) && (row.type === 'API' || row.type === 'SQL'),
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm('确定要删除此数据源吗？', '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await dataSourceApi.deleteDataSource(row.id)
        ElMessage.success('删除成功')
        clearHttpCache('/v1/data-sources')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息（如"请先禁用"）
      }
    },
  },
]

// ========== 工具函数 ==========
/** 是否系统内建数据源（V39 迁移脚本预置，tenant_id 固定为保留域 system；后端同步保护写操作）。 */
function isBuiltIn(row: any): boolean {
  return row?.tenantId === 'system'
}

function typeTagType(type: string): '' | 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning' | 'info'> = {
    FORM: 'primary',
    WORKFLOW: 'primary',
    SYSTEM: 'success',
    API: 'warning',
    SQL: 'info',
  }
  return map[type] || ''
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    FORM: '业务表单',
    WORKFLOW: '工作流表单',
    SYSTEM: '系统结构',
    API: '第三方 API',
    SQL: 'SQL 查询',
  }
  return map[type] || type
}

// ========== SQL 类型辅助函数 ==========
function onSqlModeChange() {
  // 切到 SQL 模式：若尚未生成 SQL 文本（首次进入/重置后），用当前可视化配置生成作为起点
  if (sqlConfig.queryMode === 'sql' && !sqlConfig.queryText) {
    sqlConfig.queryText = generatePreviewSql()
  }
}

/** 用户在 SQL 模式下手动编辑 SQL → 标记可视化已过期 */
function markSqlEdited() {
  if (sqlConfig.queryMode === 'sql' && !isReadonlyForm.value) {
    sqlConfig.isStale = true
  }
}

function resetToVisual() {
  sqlConfig.isStale = false
  sqlConfig.queryText = ''
  sqlConfig.queryMode = 'visual'
}

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
    DRAFT: 'warning',
    ENABLED: 'success',
    DISABLED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    ENABLED: '已启用',
    DISABLED: '已禁用',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ========== 初始化：加载已发布业务/工作流表单 + 数据库全表（SQL 可视化候选） ==========
onMounted(async () => {
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedForms.value = data.content || data.rows || []
  } catch {
    // 表单加载失败不阻断列表
  }
  try {
    const res = await formApi.getFormDefinitions({ type: 'WORKFLOW', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedWorkflowForms.value = data.content || data.rows || []
  } catch {
    // 表单加载失败不阻断列表
  }
  try {
    const res = await dataSourceApi.getDbSchemaTables()
    dbTables.value = res.data || []
  } catch {
    // 数据库表加载失败不阻断列表
  }
  try {
    const res = await dataSourceApi.getEnabledDataSources()
    const list = (res.data || []) as DataSourceDTO[]
    const formTargets = list
      .filter((d) => d.type === 'FORM' && d.formKey)
      .map((d) => ({ key: d.formKey as string, name: d.name }))
    // 内建数据源目标：与后端 join-target-catalog 的 JOIN_TARGET_SYSTEM_SOURCES 同步
    // （流程类 3 个为派生列，不纳入；与前端 joinColumns.ts 的 SYSTEM_JOIN_TARGET_COLUMNS 同一白名单）
    const builtinTargets = list
      .filter((d) => d.type === 'SYSTEM' && JOIN_BUILTIN_TARGET_KEYS.includes(String(d.sourceKey)))
      .map((d) => ({ key: String(d.sourceKey), name: `${d.name}（内建）` }))
    formJoinTargets.value = [...formTargets, ...builtinTargets]
  } catch {
    // JOIN 目标表加载失败不阻断列表
  }
})
</script>

<style scoped>
.data-source-list-page {
  /* 占满 main 可视区：列表卡片内部滚动，覆盖层（absolute inset:0）高度不超过视口，
     footer 固定于可视底部不随内容滚出屏幕 */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.ds-list-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ds-list-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sql-key-hint-icon {
  margin-left: 4px;
  cursor: help;
  color: #909399;
}
.ops-scroll {
  /* 内层不再滚动：由页签内容区（.el-tabs__content）统一承接滚动 */
  padding-right: 4px;
}
.auto-params-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.op-row code {
  font-family: 'Courier New', monospace;
  background: #f4f6f8;
  padding: 2px 6px;
  border-radius: 3px;
}
.op-label {
  color: #909399;
  font-size: 12px;
}
.op-meta {
  color: #909399;
  font-size: 12px;
  background: #f4f6f8;
  padding: 1px 6px;
  border-radius: 3px;
}
.op-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.column-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
/* 内嵌表单覆盖层（替代弹窗）：覆盖当前页签内容区，关闭后恢复视图 */
.inline-form-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: #fff;
  display: flex;
  flex-direction: column;
}
/* 嵌入页面内表格行内组件统一普通字体 */
.inline-form-overlay :deep(.el-table) {
  font-size: 14px;
}
/* API 配置区表单项紧凑间距 */
.inline-form-overlay :deep(.el-form-item) {
  margin-bottom: 8px;
}
.inline-form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 24px;
  overflow: hidden;
}
.inline-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.inline-form-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.inline-form-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
/* 主表单（顶部输入区）固定不滚动 */
.inline-form-body > .el-form {
  flex-shrink: 0;
}
/* 元数据 tab 按钮行：与 tab 下沿和表格各留 4px */
.metadata-toolbar-inline {
  display: flex;
  gap: 4px;
  margin: 0 0 4px;
}
/* 数据预览 tab 搜索行：与 tab 下沿和表格各留 4px */
.preview-toolbar-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 4px;
}
.inline-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 16px;
  flex-shrink: 0;
}
</style>
