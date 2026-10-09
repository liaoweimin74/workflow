<template>
  <div class="property-panel" :class="{ collapsed }" @submit.prevent>
    <!-- 折叠态：竖条 -->
    <div v-if="collapsed" class="collapse-bar" title="展开属性面板" @click="collapsed = false">
      <span class="bar-text">属性</span>
      <el-icon class="bar-icon"><Setting /></el-icon>
    </div>

    <!-- 展开态 -->
    <template v-else>
      <div class="panel-header">
        <div class="panel-heading">
          <el-icon class="heading-icon"><Setting /></el-icon>
          <span>属性配置</span>
        </div>
        <div class="panel-tags">
          <el-tag v-if="node" size="small" effect="plain" class="node-type-tag">
            {{ nodeTypeLabel }}
          </el-tag>
          <el-icon v-if="node" class="header-action" title="删除该节点" @click="emit('remove', node.id)">
            <Delete />
          </el-icon>
          <el-icon class="collapse-toggle" title="折叠面板" @click="collapsed = true"><Fold /></el-icon>
        </div>
      </div>

      <!-- 节点 ID（只读，点击复制） -->
      <div v-if="node" class="panel-meta">
        <span class="meta-label">ID</span>
        <span class="meta-value" :title="node.id">{{ node.id }}</span>
        <el-icon class="meta-copy" title="复制节点 ID" @click="copyNodeId"><CopyDocument /></el-icon>
      </div>

      <div class="panel-body">
        <el-empty v-if="!node" description="选中画布节点编辑属性" :image-size="80" />

        <el-form v-else label-position="top" size="default" class="panel-form">
          <!-- ===== 公共：名称 ===== -->
          <el-form-item label="节点名称">
            <el-input v-model="node.data.name" maxlength="64" placeholder="请输入节点名称" />
          </el-form-item>

          <!-- ===== HTTP ===== -->
          <template v-if="node.data.nodeType === 'HTTP'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="请求 URL" tip="目标接口地址，支持 {{ 变量 }} 占位符注入上下文变量" />
              </template>
              <VarInput
                v-model="httpCfg.url"
                :variables="variables"
                mode="placeholder"
                placeholder="https://host/api/path"
                clearable
              />
            </el-form-item>
            <el-form-item label="请求方法">
              <el-select v-model="httpCfg.method" style="width: 100%">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="请求头 Headers" tip="自定义 HTTP 请求头键值对，随请求发送" />
                <el-button size="small" text type="primary" @click="addHeader">添加</el-button>
              </div>
              <div v-if="!headerRows.length" class="rows-empty">暂无请求头</div>
              <div v-for="(row, i) in headerRows" :key="i" class="kv-row">
                <el-input v-model="row.key" size="small" placeholder="名称" @input="syncHeaders" />
                <el-input v-model="row.value" size="small" placeholder="值" @input="syncHeaders" />
                <!-- 请求头值为静态键值对，不接变量选择器 -->
                <el-button size="small" text type="danger" @click="removeHeader(i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="Query 参数" tip="左侧填当前流变量名，右侧填 URL 查询参数名；值支持 {{ 变量 }} 占位符" />
                <el-button size="small" text type="primary" @click="addParam('queryParams')">添加</el-button>
              </div>
              <div v-if="!httpCfg.queryParams.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in httpCfg.queryParams" :key="i" class="kv-row">
                <VarInput
                  v-model="row.source"
                  :variables="variables"
                  mode="bare"
                  replace
                  size="small"
                  placeholder="变量名"
                />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('queryParams', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="Body 参数" tip="左侧填当前流变量名，右侧填请求体字段名" />
                <el-button size="small" text type="primary" @click="addParam('bodyParams')">添加</el-button>
              </div>
              <div v-if="!httpCfg.bodyParams.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in httpCfg.bodyParams" :key="i" class="kv-row">
                <VarInput
                  v-model="row.source"
                  :variables="variables"
                  mode="bare"
                  replace
                  size="small"
                  placeholder="变量名"
                />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('bodyParams', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="num-grid">
              <el-form-item>
                <template #label>
                  <FieldLabel label="连接超时(ms)" tip="建立 TCP 连接的最长等待时间（毫秒），默认 3000" />
                </template>
                <el-input-number v-model="httpCfg.connTimeoutMs" :min="0" :step="500" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <FieldLabel label="读取超时(ms)" tip="等待响应数据的最长时间（毫秒），默认 5000" />
                </template>
                <el-input-number v-model="httpCfg.readTimeoutMs" :min="0" :step="500" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <FieldLabel label="重试次数" tip="请求失败后的自动重试次数，0 表示不重试" />
                </template>
                <el-input-number v-model="httpCfg.retryCount" :min="0" :max="10" controls-position="right" style="width: 100%" />
              </el-form-item>
            </div>
          </template>

          <!-- ===== BEAN ===== -->
          <template v-else-if="node.data.nodeType === 'BEAN'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="Bean 名称" tip="Spring 容器注册的 Bean，支持搜索选择；清单加载失败时降级为手动输入" />
              </template>
              <!-- Bean 清单加载失败降级为输入框 -->
              <el-select
                v-if="!beanLoadFailed"
                v-model="beanCfg.beanName"
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入 Bean 名称"
                style="width: 100%"
                @change="onBeanChanged"
              >
                <el-option v-for="name in beanNames" :key="name" :label="name" :value="name" />
              </el-select>
              <el-input v-else v-model="beanCfg.beanName" placeholder="请输入 Bean 名称" />
            </el-form-item>
            <el-form-item required>
              <template #label>
                <FieldLabel label="方法名" tip="该 Bean 上可调用的方法，随 Bean 名称联动加载" />
              </template>
              <el-select
                v-if="!beanLoadFailed && beanMethods.length"
                v-model="beanCfg.methodName"
                filterable
                allow-create
                default-first-option
                placeholder="选择方法"
                style="width: 100%"
              >
                <el-option v-for="m in beanMethods" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
              <el-input v-else v-model="beanCfg.methodName" placeholder="请输入方法名" />
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="方法参数" tip="左侧填当前流变量名，右侧填 Bean 方法形参名，按顺序注入" />
                <el-button size="small" text type="primary" @click="addParam('params')">添加</el-button>
              </div>
              <div v-if="!beanCfg.params.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in beanCfg.params" :key="i" class="kv-row">
                <VarInput
                  v-model="row.source"
                  :variables="variables"
                  mode="bare"
                  replace
                  size="small"
                  placeholder="变量名"
                />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('params', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <el-alert
              v-if="beanLoadFailed"
              title="Bean 清单加载失败，已降级为手动输入"
              type="info"
              :closable="false"
              show-icon
              class="panel-alert"
            />
          </template>

          <!-- ===== SCRIPT ===== -->
          <template v-else-if="node.data.nodeType === 'SCRIPT'">
            <el-form-item label="脚本语言">
              <el-input model-value="groovy" readonly />
            </el-form-item>
            <el-form-item required>
              <template #label>
                <FieldLabel label="脚本内容" tip="Groovy 脚本在服务端沙箱执行，注意安全；末行用 Map 字面量 [key: value, ...] 返回多输出，上下文变量直接用变量名访问" />
              </template>
              <VarInput
                v-model="scriptCfg.source"
                :variables="variables"
                mode="bare"
                textarea
                :rows="10"
                chips
                class="script-source"
                placeholder="return 'hello ' + vars.name"
              />
            </el-form-item>
          </template>

          <!-- ===== CONDITION ===== -->
          <template v-else-if="node.data.nodeType === 'CONDITION'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="判断变量" tip="参与比较的上下文变量，支持 {{ var }} 写法" />
              </template>
              <VarInput
                v-model="conditionCfg.variable"
                :variables="variables"
                mode="bare"
                replace
                placeholder="变量名，如 risk"
              />
            </el-form-item>
            <el-form-item label="运算符">
              <el-select v-model="conditionCfg.operator" style="width: 100%">
                <el-option v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="!isEmptyOperator">
              <template #label>
                <FieldLabel label="比较值" tip="比较的字面量或 {{ var }}；为空/不为空运算符时无需填写" />
              </template>
              <VarInput
                v-model="conditionCfg.value"
                :variables="variables"
                mode="placeholder"
                placeholder="字面量或 {{var}}"
              />
            </el-form-item>
          </template>

          <!-- ===== BATCH ===== -->
          <template v-else-if="node.data.nodeType === 'BATCH'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="集合表达式" tip="被遍历的集合：{{ listVar }} 上下文集合变量，或 JSON 数组字面量 [1,2,3]" />
              </template>
              <VarInput
                v-model="batchCfg.collection"
                :variables="variables"
                mode="placeholder"
                placeholder="{{listVar}} 或 [1,2,3]"
              />
            </el-form-item>
            <div class="num-grid">
              <el-form-item>
                <template #label>
                  <FieldLabel label="项变量名" tip="迭代中当前项的变量名（默认 item），动作内直接引用" />
                </template>
                <el-input v-model="batchCfg.itemVar" placeholder="item" />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <FieldLabel label="序号变量名" tip="迭代序号变量名（默认 index，从 0 开始）" />
                </template>
                <el-input v-model="batchCfg.indexVar" placeholder="index" />
              </el-form-item>
            </div>
            <el-form-item>
              <template #label>
                <FieldLabel label="循环体（画布配置）" tip="在画布中把动作节点拖到批处理节点右侧的循环虚线上自动接入，多项按链序逐项执行；循环体内可直接用项/序号变量；把循环体节点拖离虚线或双击即可移出循环" />
              </template>
              <div class="loop-hint" :class="{ 'is-empty': loopBodyCount === 0 }">
                <span v-if="loopBodyCount > 0">循环体已配置 {{ loopBodyCount }} 步，按链序逐项执行</span>
                <span v-else>未配置：把动作节点拖到画布中批处理节点右侧的循环虚线上</span>
              </div>
            </el-form-item>

            <div class="num-grid">
              <el-form-item>
                <template #label>
                  <FieldLabel label="单次最大迭代数" tip="单次最多迭代条数，超出后停止（硬上限 1000）" />
                </template>
                <el-input-number
                  v-model="batchCfg.maxItems"
                  :min="1"
                  :max="1000"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <FieldLabel label="单项失败策略" tip="开=任一项失败即中断整批；关=记录该项失败后继续执行剩余项" />
                </template>
                <el-switch
                  v-model="batchCfg.stopOnError"
                  active-text="中断整批"
                  inactive-text="记录后继续"
                />
              </el-form-item>
            </div>
          </template>

          <!-- ===== SUBFLOW ===== -->
          <template v-else-if="node.data.nodeType === 'SUBFLOW'">
            <el-form-item>
              <template #label>
                <FieldLabel label="目标流程" tip="仅可选择已发布的逻辑流；其输出变量（outputVars）作为本节点返回值、由输出参数（results）声明写入；递归/自引用会被引擎拒绝（嵌套上限 5 层）" />
              </template>
              <el-select
                v-model="subflowCfg.flowId"
                placeholder="选择已发布的逻辑流"
                style="width: 100%"
                filterable
                :loading="flowsLoading"
              >
                <el-option
                  v-for="f in publishedFlows"
                  :key="f.id"
                  :label="`${f.name || f.flowKey}（${f.flowKey}）`"
                  :value="f.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <template #label>
                <FieldLabel label="继承上下文" tip="开=父流全部变量传入子流；关=仅传递下方映射的变量" />
              </template>
              <el-switch
                v-model="subflowCfg.passAllVars"
                active-text="全量传入"
                inactive-text="仅映射变量"
              />
            </el-form-item>
            <el-form-item>
              <template #label>
                <FieldLabel label="变量映射" tip="左侧填当前流变量名，右侧填子流入参名；在继承基础上做覆盖/改名" />
              </template>
              <div class="mapping-rows">
                <div v-for="(pair, i) in subflowCfg.varsMapping" :key="i" class="mapping-row">
                  <VarInput
                    v-model="pair.source"
                    :variables="variables"
                    mode="bare"
                    replace
                    placeholder="当前流变量"
                  />
                  <span class="mapping-arrow">→</span>
                  <el-input v-model="pair.target" placeholder="子流变量" />
                  <el-button size="small" text type="danger" @click="subflowCfg.varsMapping.splice(i, 1)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
                <el-button size="small" text type="primary" @click="subflowCfg.varsMapping.push({ source: '', target: '' })">
                  添加映射
                </el-button>
              </div>
            </el-form-item>
          </template>

          <!-- ===== DATA_UPDATE（统一多表编辑器：单条目 = 单表更新；多条目单事务顺序执行） ===== -->
          <template v-else-if="node.data.nodeType === 'DATA_UPDATE'">
            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="目标表" tip="一个节点可配置一张或多张目标表：单张表即单表更新，未声明输出时写入受影响行数（与存量单表行为一致）；多张表在单事务内按顺序执行，全成提交、任一失败整体回滚（全有或全无），未声明输出时自动汇总 { total, affected, t0|别名.affected, … } 供下游点路径引用；需要逐表独立失败语义请拆成多个数据更新节点；SET 直接赋值，ADD/SUB 对数值列累加/递减；值支持字面量或 {{ formData.xxx }} 点路径取表单字段；表名运行时校验合法性与存在性，值经参数绑定防注入" />
                <el-button size="small" text type="primary" @click="addDataUpdateEntry">添加目标表</el-button>
              </div>
              <div v-if="!dataUpdateCfg.updates?.length" class="rows-empty">
                尚未添加目标表，点击右上「添加目标表」开始配置
              </div>
              <div v-for="(u, ui) in dataUpdateCfg.updates ?? []" :key="ui" class="du-multi-card">
                <div class="du-multi-head">
                  <span class="du-multi-idx">#{{ ui }}</span>
                  <el-input
                    v-model="u.alias"
                    size="small"
                    class="du-alias"
                    maxlength="32"
                    placeholder="输出别名(可选，字母/数字/下划线)"
                  />
                  <el-button
                    size="small"
                    text
                    type="danger"
                    @click="dataUpdateCfg.updates?.splice(ui, 1)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>

                <el-form-item required>
                  <template #label>
                    <FieldLabel label="目标表" tip="下拉取数据库全部表清单；表名运行时校验合法性与存在性，值经参数绑定防注入" />
                  </template>
                  <el-select
                    v-model="u.table"
                    filterable
                    :loading="duTablesLoading"
                    placeholder="选择平台动态数据表"
                    clearable
                    class="du-table-select"
                  >
                    <el-option v-for="t in duEntryTableOptions(u.table)" :key="t" :label="t" :value="t" />
                  </el-select>
                </el-form-item>

                <div class="rows-block">
                  <div class="rows-head">
                    <FieldLabel label="更新字段 SET" tip="SET 直接赋值；ADD/SUB 对数值列累加/递减；值支持字面量或 {{ formData.xxx }} 点路径取表单字段" />
                    <el-button size="small" text type="primary" @click="u.setOps.push({ column: '', mode: 'SET', value: '' })">添加</el-button>
                  </div>
                  <div v-if="!u.setOps.length" class="rows-empty">暂无更新字段</div>
                  <div v-for="(op, i) in u.setOps" :key="i" class="du-row">
                    <el-select
                      v-model="op.column"
                      size="small"
                      filterable
                      allow-create
                      default-first-option
                      :loading="duEntryLoading(u.table)"
                      :disabled="!u.table"
                      :title="u.table ? undefined : '先选择目标表'"
                      placeholder="列名"
                      class="du-col"
                    >
                      <el-option v-for="c in duEntryColumns(u)" :key="c.key" :label="c.key" :value="c.key">
                        <span class="du-col-opt">
                          <span>{{ c.key }}</span>
                          <span v-if="c.type" class="du-col-type">{{ c.type }}</span>
                        </span>
                      </el-option>
                    </el-select>
                    <el-select v-model="op.mode" size="small" class="du-mode">
                      <el-option label="SET" value="SET" />
                      <el-option label="ADD +" value="ADD" />
                      <el-option label="SUB −" value="SUB" />
                    </el-select>
                    <VarInput
                      v-model="op.value"
                      :variables="variables"
                      mode="placeholder"
                      size="small"
                      class="du-value"
                      placeholder="值或 {{formData.xxx}}"
                    />
                    <el-button size="small" text type="danger" @click="u.setOps.splice(i, 1)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>

                <div class="rows-block">
                  <div class="rows-head">
                    <FieldLabel label="更新条件 WHERE" tip="多条件 AND 连接；该表条件为空时将影响全表，请谨慎配置" />
                    <el-button size="small" text type="primary" @click="u.where.push({ column: '', op: 'EQ', value: '' })">添加</el-button>
                  </div>
                  <div v-if="!u.where.length" class="rows-empty du-warn">未配置条件，执行将更新该表全表</div>
                  <div v-for="(cond, i) in u.where" :key="i" class="du-row">
                    <el-select
                      v-model="cond.column"
                      size="small"
                      filterable
                      allow-create
                      default-first-option
                      :loading="duEntryLoading(u.table)"
                      :disabled="!u.table"
                      :title="u.table ? undefined : '先选择目标表'"
                      placeholder="列名"
                      class="du-col"
                    >
                      <el-option v-for="c in duEntryColumns(u)" :key="c.key" :label="c.key" :value="c.key">
                        <span class="du-col-opt">
                          <span>{{ c.key }}</span>
                          <span v-if="c.type" class="du-col-type">{{ c.type }}</span>
                        </span>
                      </el-option>
                    </el-select>
                    <el-select v-model="cond.op" size="small" class="du-mode">
                      <el-option v-for="wop in DATA_UPDATE_OPS" :key="wop.value" :label="wop.label" :value="wop.value" />
                    </el-select>
                    <VarInput
                      v-if="!isNullOp(cond.op)"
                      v-model="cond.value"
                      :variables="variables"
                      mode="placeholder"
                      size="small"
                      class="du-value"
                      placeholder="值或 {{formData.xxx}}"
                    />
                    <el-button size="small" text type="danger" @click="u.where.splice(i, 1)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>

              <div v-if="dataUpdateCfg.updates?.length" class="sql-preview-hint du-output-hint">
                <template v-if="(dataUpdateCfg.updates?.length ?? 0) === 1">
                  单表更新：未声明输出时引擎将受影响行数写入「{{ nodeId }}」（与存量单表行为一致）
                </template>
                <template v-else>
                  未声明输出时引擎自动将整体汇总写入「{{ nodeId }}」：{ total, affected, {{ duKeysPreview }}, … }；各表按顺序在单事务内执行，任一表失败整体回滚（全有或全无）
                </template>
              </div>
            </div>
          </template>

          <!-- ===== DATA_UPSERT（业务数据写入：存在则更新/不存在则新增，原子 ODKU） ===== -->
          <template v-else-if="node.data.nodeType === 'DATA_UPSERT'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="业务表单" tip="选择已发布的 BUSINESS 表单，写入其物理表 wf_biz_<formKey>；tenant_id/created_by/version/审计时间戳由引擎自动维护，不在本表暴露" />
              </template>
              <el-select
                v-model="dataUpsertCfg.formKey"
                filterable
                clearable
                :loading="upsertFormsLoading"
                placeholder="选择已发布业务表单"
                class="du-table-select"
                @change="onUpsertFormChange"
              >
                <el-option v-for="f in upsertFormOptions" :key="f.key" :label="`${f.name}（${f.key}）`" :value="f.key" />
              </el-select>
            </el-form-item>

            <el-form-item required>
              <template #label>
                <FieldLabel label="冲突键（唯一字段）" tip="按该字段判定存在性：命中即更新、未命中即新增；下拉仅列物理表 (tenant_id, 字段) 二列唯一索引的字段（表单设计器标记「唯一」并重新发布后生成）；运行期引擎实查索引兑底校验，缺索引直接节点失败" />
              </template>
              <el-select
                v-model="dataUpsertCfg.conflictKey"
                filterable
                :loading="upsertKeysLoading"
                :disabled="!dataUpsertCfg.formKey"
                :title="dataUpsertCfg.formKey ? undefined : '先选择业务表单'"
                placeholder="选择唯一字段"
                class="du-table-select"
              >
                <el-option v-for="c in upsertConflictOptions" :key="c" :label="c" :value="c" />
              </el-select>
              <div v-if="dataUpsertCfg.formKey && !upsertKeysLoading && !upsertConflictOptions.length" class="rows-empty du-warn">
                该表单物理表暂无 (tenant_id, 字段) 唯一索引：请先在表单设计器将判定字段标记「唯一」并重新发布
              </div>
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="写入字段" tip="新增与更新共用的字段值；冲突键列必须包含在内；值支持字面量或 {{ formData.xxx }} 点路径取变量；参数绑定防注入" />
                <el-button size="small" text type="primary" @click="dataUpsertCfg.values.push({ column: '', value: '' })">添加</el-button>
              </div>
              <div v-if="!dataUpsertCfg.values.length" class="rows-empty">暂无写入字段</div>
              <div v-for="(op, i) in dataUpsertCfg.values" :key="i" class="du-row">
                <el-select
                  v-model="op.column"
                  size="small"
                  filterable
                  allow-create
                  default-first-option
                  :loading="upsertColumnsLoading"
                  :disabled="!dataUpsertCfg.formKey"
                  :title="dataUpsertCfg.formKey ? undefined : '先选择业务表单'"
                  placeholder="字段"
                  class="du-col"
                >
                  <el-option v-for="c in upsertColumnOptions(op.column)" :key="c.key" :label="c.key" :value="c.key">
                    <span class="du-col-opt">
                      <span>{{ c.key }}</span>
                      <span v-if="c.type" class="du-col-type">{{ c.type }}</span>
                    </span>
                  </el-option>
                </el-select>
                <VarInput
                  v-model="op.value"
                  :variables="variables"
                  mode="placeholder"
                  size="small"
                  class="du-value"
                  placeholder="值或 {{formData.xxx}}"
                />
                <el-button size="small" text type="danger" @click="dataUpsertCfg.values.splice(i, 1)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="更新时覆盖（可选）" tip="仅命中更新路径时额外覆盖的字段（col = ? 直绑）；未配置时更新路径 = 全量写入字段；适合 updated_by、最近同步时间等只在新值到达时刷新的列" />
                <el-button size="small" text type="primary" @click="addUpsertOnUpdate">添加</el-button>
              </div>
              <div v-if="!dataUpsertCfg.onUpdate?.length" class="rows-empty">未配置 · 更新路径默认覆盖全部写入字段</div>
              <div v-for="(op, i) in dataUpsertCfg.onUpdate ?? []" :key="'u' + i" class="du-row">
                <el-select
                  v-model="op.column"
                  size="small"
                  filterable
                  allow-create
                  default-first-option
                  :loading="upsertColumnsLoading"
                  :disabled="!dataUpsertCfg.formKey"
                  :title="dataUpsertCfg.formKey ? undefined : '先选择业务表单'"
                  placeholder="字段"
                  class="du-col"
                >
                  <el-option v-for="c in upsertColumnOptions(op.column)" :key="c.key" :label="c.key" :value="c.key">
                    <span class="du-col-opt">
                      <span>{{ c.key }}</span>
                      <span v-if="c.type" class="du-col-type">{{ c.type }}</span>
                    </span>
                  </el-option>
                </el-select>
                <VarInput
                  v-model="op.value"
                  :variables="variables"
                  mode="placeholder"
                  size="small"
                  class="du-value"
                  placeholder="值或 {{formData.xxx}}"
                />
                <el-button size="small" text type="danger" @click="dataUpsertCfg.onUpdate?.splice(i, 1)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="sql-preview-hint du-output-hint">
              未声明输出时引擎自动将整体结果写入「{{ nodeId }}」：{ result: 'created'|'updated'|'unchanged', affected, id, table }；id 为记录主键（新增=本次生成，更新/无变化=按冲突键反查），下游可点路径引用（如 {{ nodeId }}.id）。注意 updated_at 恒随更新子句刷新：命中已有行常规返回 updated（affected=2），unchanged 为保留态（值全同且同毫秒写入才出现，极罕见）
            </div>
          </template>

          <!-- ===== SQL_SCRIPT ===== -->
          <template v-else-if="node.data.nodeType === 'SQL_SCRIPT'">
            <el-form-item required>
              <template #label>
                <FieldLabel label="SQL 语句" tip="多条 SQL 用 ; 分隔（字符串/注释内的分号不会切分）；语句中用 {{var.path}} 引用上下文变量，执行时编译为 JDBC ? 参数绑定防注入（保留数值类型；'前缀{{var}}后缀' 拼接形态整段绑定字符串）；支持 -- name: 别名 注释为语句命名（输出键用别名，重复会校验拒绝）；仅支持 SELECT/INSERT/UPDATE/DELETE/REPLACE（及 SHOW/DESC/EXPLAIN/WITH 查询），DDL 会隐式提交破坏事务故不支持" />
              </template>
              <VarInput
                v-model="sqlScriptCfg.sql"
                :variables="variables"
                mode="placeholder"
                textarea
                :rows="10"
                chips
                class="sql-source"
                placeholder="-- name: upsert_user&#10;UPDATE wf_biz_order SET status = {{newStatus}} WHERE id = {{orderId}};&#10;&#10;SELECT id, amount FROM wf_biz_order WHERE id = {{orderId}};"
              />
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="语句解析预览" tip="按 ; 切分后的执行顺序、类型识别与变量引用（与引擎语义一致）；条目键 = 别名或 s{序号}，即输出汇总里的子键" />
              </div>
              <div v-if="sqlPreview.error" class="sql-preview-error">
                <el-icon><WarningFilled /></el-icon>
                <span>{{ sqlPreview.error }}</span>
              </div>
              <div v-if="!sqlPreview.statements.length && !sqlPreview.error" class="rows-empty">
                输入 SQL 后按 ; 切分预览
              </div>
              <div v-for="st in sqlPreview.statements" :key="st.index" class="sql-stmt-row">
                <span class="sql-stmt-idx">#{{ st.index }}</span>
                <span class="sql-stmt-kind" :class="'kind-' + st.kind.toLowerCase()">{{ st.kindLabel }}</span>
                <span class="sql-stmt-text" :title="st.excerpt">{{ st.excerpt }}</span>
                <span v-if="st.name" class="sql-stmt-name" :title="`输出键 ${st.name}`">{{ st.name }}</span>
              </div>
              <div v-if="sqlPreview.statements.length" class="sql-preview-hint">
                未声明输出时引擎自动写整体汇总到「{{ nodeId }}」：{ total, succeeded, failed, aborted?, s0.affected, s1.data, … }，下游点路径取子字段（如 {{ nodeId }}.s0.affected）
              </div>
            </div>

            <el-form-item>
              <template #label>
                <FieldLabel label="失败策略" tip="失败回滚（abort）：单事务执行，任一语句失败整体回滚并停止，汇总标 aborted=true（节点不抛错，下游可按 failed/aborted 变量分支）；逐条继续（continue）：自动提交逐条执行，失败记入该语句条目（sN.error）继续执行后续语句" />
              </template>
              <el-select v-model="sqlScriptCfg.onError" class="sql-onerror">
                <el-option label="失败回滚（单事务）" value="abort" />
                <el-option label="逐条继续（自动提交）" value="continue" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <template #label>
                <FieldLabel label="查询行数上限" tip="单条 SELECT 最多返回的行数（1~1000），超出截断并在该条目标记 truncated=true，防大结果集撑爆内存" />
              </template>
              <el-input-number v-model="sqlScriptCfg.maxRows" :min="1" :max="1000" size="small" class="sql-maxrows" />
            </el-form-item>
          </template>

          <!-- ===== 公共：输出参数 / 异常策略（全执行型节点统一 results 单表；
               START/END/CONDITION 无；resultVar 已下线） ===== -->
          <template v-if="hasExecutionMeta">
            <div class="rows-block">
              <div class="rows-head">
                <FieldLabel label="输出参数（results）" tip="可选：未声明时引擎自动将整体结果写入以节点 id 命名的变量（如 http_x7k2），下游零配置即可引用，支持点路径取子字段（如 http_x7k2.data.id）；声明后按本表执行：整体值（WHOLE）→ 节点返回值整体写入该变量（HTTP 为响应 body，BEAN 为方法返回值，DATA_UPDATE 为受影响行数（配置多张目标表时为汇总 total/affected/t{i}|别名），SUBFLOW 为子流 outputVars，BATCH 为汇总列表，SQL_SCRIPT 为执行汇总 { total/succeeded/failed/sN }，KEY 取其顶层键如 s0/s1/total），标量/列表/Map 均可，null 跳过；按 key 取（KEY）→ 输出源为 Map/JSON 对象时按变量名取对应 key（HTTP body 先尝试 JSON 解析），缺 key 跳过；SCRIPT 含 KEY 声明而末行未返回 Map → 节点失败，其余节点宽松跳过。输出名全表唯一；json 类型可粘贴 JSON 实例导入字段结构，下游选择变量时可展开选到具体字段" />
                <el-button size="small" text type="primary" @click="addResultRow">添加</el-button>
              </div>
              <div v-if="!resultRows.length" class="rows-empty">
                未声明输出 · 引擎自动将整体结果写入变量「{{ nodeId }}」，下游可直接引用（点路径取子字段，如 {{ nodeId }}.data.id）；需要重命名或拆包时再添加
              </div>
              <div v-for="(r, i) in resultRows" :key="i" class="so-row">
                <div class="so-line1">
                  <el-input v-model="r.name" size="small" placeholder="变量名如 outLevel" class="so-name" />
                  <el-select v-model="r.mode" size="small" class="so-mode">
                    <el-option label="整体值" value="WHOLE" />
                    <el-option label="按 key 取" value="KEY" />
                  </el-select>
                  <el-select v-model="r.type" size="small" class="so-type">
                    <el-option v-for="t in OUTPUT_VAR_TYPES" :key="t" :label="t" :value="t" />
                  </el-select>
                  <el-button size="small" text type="danger" @click="resultRows.splice(i, 1)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                  <!-- json 类型：粘贴 JSON 实例生成字段结构树（图标按钮在删除之后，已导入变绿） → 下游变量选择器可展开选到字段 -->
                  <JsonInstanceImport
                    v-if="r.type === 'json'"
                    icon
                    :structure="r.structure"
                    @import="(fields) => (r.structure = fields)"
                    @clear="r.structure = undefined"
                  />
                </div>
              </div>
              <el-alert
                v-if="resultWarnings.length"
                type="warning"
                :closable="false"
                show-icon
                class="panel-alert"
                :title="resultWarnings.join('；')"
              />
            </div>
            <el-form-item>
              <template #label>
                <FieldLabel label="异常处理" tip="失败中断：节点异常终止整个流程；忽略继续：记录异常并继续执行后续节点" />
              </template>
              <el-select v-model="node.data.errorAction" style="width: 100%">
                <el-option label="失败中断（FAIL_FLOW）" value="FAIL_FLOW" />
                <el-option label="忽略继续（IGNORE_CONTINUE）" value="IGNORE_CONTINUE" />
              </el-select>
            </el-form-item>
          </template>
        </el-form>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { CopyDocument, Delete, Fold, Setting, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import FieldLabel from './FieldLabel.vue'
import JsonInstanceImport from './JsonInstanceImport.vue'
import VarInput from './VarInput.vue'
import { logicFlowApi } from '@/api/logicFlow'
import type { BackendBeanInfo } from '@/api/logicFlow'
import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { nodeTypeLabel as typeLabel } from '../utils/nodeMeta'
import { defaultConfig, type DataUpdateNodeConfig, type DataUpdateTableUpdate, type DataUpdateWhereOp, type DataUpsertNodeConfig, type FlowNode, type HttpNodeConfig, type SqlScriptNodeConfig, OUTPUT_VAR_TYPES, type ResultVarDef } from '../utils/dsl'
import { parseSqlScriptPreview } from '../utils/sqlScript'
import type { FlowVarItem } from '../utils/flowVars'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const OPERATORS = [
  { label: '等于（EQ）', value: 'EQ' },
  { label: '不等于（NE）', value: 'NE' },
  { label: '大于（GT）', value: 'GT' },
  { label: '小于（LT）', value: 'LT' },
  { label: '大于等于（GTE）', value: 'GTE' },
  { label: '小于等于（LTE）', value: 'LTE' },
  { label: '为空（EMPTY）', value: 'EMPTY' },
  { label: '不为空（NOT_EMPTY）', value: 'NOT_EMPTY' },
] as const

const props = defineProps<{
  node?: FlowNode | null
  collapsed?: boolean
  loopBodyCount?: number
  /** 当前节点可用的上下文变量（父组件按画布实时计算，见 flowVars.ts） */
  variables?: FlowVarItem[]
}>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean]; remove: [id: string] }>()

const collapsed = computed({
  get: () => props.collapsed ?? false,
  set: (val) => emit('update:collapsed', val),
})

const loopBodyCount = computed(() => props.loopBodyCount ?? 0)

const node = computed(() => props.node ?? null)
/** 隐式输出变量名（未声明 results 时引擎写入的变量 = 节点 id） */
const nodeId = computed(() => node.value?.id ?? '')
const nodeTypeLabel = computed(() => (node.value ? typeLabel(node.value.data.nodeType) : ''))
const hasExecutionMeta = computed(
  () =>
    !!node.value &&
    ['HTTP', 'BEAN', 'SCRIPT', 'BATCH', 'SUBFLOW', 'DATA_UPDATE', 'DATA_UPSERT', 'SQL_SCRIPT'].includes(node.value.data.nodeType)
)

/** 兜底补齐 config（历史 DSL 缺字段时按类型默认值补全） */
function ensureConfig<T>(): T {
  const n = node.value!
  if (!n.data.config || typeof n.data.config !== 'object') {
    const d = defaultConfig(n.data.nodeType)
    // START/END 等无配置节点 defaultConfig 返回 undefined：不落库（避免污染 DSL）、
    // 返回空对象兑底——否则依赖 config 的 computed/watcher 对其求值即崩（真实事故：
    // 2026-10-09 选中 START 节点触发 dataUpdateCfg computed 抛 TypeError，patch 中断
    // vnode 树损坏，随后返回列表导航卸载失败永久卡死）
    if (!d) return {} as T
    n.data.config = d
  }
  return n.data.config as T
}

const httpCfg = computed(() => ensureConfig<HttpNodeConfig>())
const beanCfg = computed(() => ensureConfig<{ beanName: string; methodName: string; params: { source: string; target: string }[] }>())
const scriptCfg = computed(() => ensureConfig<{ language: string; source: string }>())

// ===== SQL_SCRIPT =====
const sqlScriptCfg = computed(() => ensureConfig<SqlScriptNodeConfig>())
/** 实时拆分预览（与引擎同语义；解析错误不抛出，进 error 字段展示） */
const sqlPreview = computed(() => parseSqlScriptPreview(String(sqlScriptCfg.value?.sql ?? '')))

/** 统一输出声明（reactive 引用，增删改直接写回 node.data.results；全执行型节点共享） */
const resultRows = computed<ResultVarDef[]>(() => {
  const n = node.value!
  if (!hasExecutionMeta.value) return []
  if (!Array.isArray(n.data.results)) n.data.results = []
  return n.data.results
})

function addResultRow(): void {
  // 首行默认整体值（单值输出最常见）；已有行默认按 key 取（多输出需输出源为 Map/JSON 对象）
  resultRows.value.push({
    name: '',
    mode: resultRows.value.length ? 'KEY' : 'WHOLE',
    type: 'string',
  })
}

/** 输出参数软校验（发布时后端硬校验同名/mode 规则）：缺名/非法名/重名 */
const resultWarnings = computed<string[]>(() => {
  if (!node.value || !hasExecutionMeta.value) return []
  const warns: string[] = []
  const seen = new Set<string>()
  resultRows.value.forEach((r, i) => {
    const name = String(r.name ?? '').trim()
    if (!name) {
      warns.push(`输出参数第 ${i + 1} 行缺少变量名`)
      return
    }
    if (!/^\w+$/.test(name)) warns.push(`「${name}」非法（仅字母/数字/下划线）`)
    if (seen.has(name)) warns.push(`「${name}」重复`)
    seen.add(name)
  })
  return warns
})
const conditionCfg = computed(() => ensureConfig<{ variable: string; operator: string; value?: string }>())
const batchCfg = computed(() =>
  ensureConfig<{
    collection: string
    itemVar: string
    indexVar: string
    body?: unknown[]
    actionType?: 'HTTP' | 'SCRIPT' | 'BEAN'
    stopOnError: boolean
    maxItems: number
  }>()
)

const subflowCfg = computed(() =>
  ensureConfig<{
    flowId: string
    passAllVars: boolean
    varsMapping: { source: string; target: string }[]
  }>()
)

// ===== DATA_UPDATE =====
const DATA_UPDATE_OPS: { label: string; value: DataUpdateWhereOp }[] = [
  { label: '等于', value: 'EQ' },
  { label: '不等于', value: 'NE' },
  { label: '大于', value: 'GT' },
  { label: '大于等于', value: 'GTE' },
  { label: '小于', value: 'LT' },
  { label: '小于等于', value: 'LTE' },
  { label: '为空', value: 'IS_NULL' },
  { label: '不为空', value: 'NOT_NULL' },
]

/**
 * 统一多表形态（config.updates）：updates 缺失/为空时自动迁移——
 * 存量单表配置（table/setOps/where）→ updates[0]（引擎单条目与单表行为等价，含输出）；
 * 全新空配置 → 预置一条空表项。迁移后清空顶层单表字段，DSL 只保留 updates 一种形态
 */
const dataUpdateCfg = computed(() => {
  const cfg = ensureConfig<DataUpdateNodeConfig>()
  if (!Array.isArray(cfg.updates) || cfg.updates.length === 0) {
    const hasLegacy =
      Boolean(String(cfg.table ?? '').trim()) ||
      (cfg.setOps?.length ?? 0) > 0 ||
      (cfg.where?.length ?? 0) > 0
    cfg.updates = hasLegacy
      ? [{ table: cfg.table ?? '', setOps: cfg.setOps ?? [], where: cfg.where ?? [] }]
      : [{ table: '', setOps: [{ column: '', mode: 'SET', value: '' }], where: [] }]
    cfg.table = ''
    cfg.setOps = []
    cfg.where = []
  }
  return cfg
})

// ===== DATA_UPDATE 目标表/列下拉（取库真实 schema） =====
// 目标表展示数据库全部表清单（后端已放开前缀白名单，保留表名合法性+存在性校验）；
// 列排除 tenant_id（运行时禁改列），其余以 information_schema 真实结构为准

const duTableOptions = ref<string[]>([])
const duTablesLoading = ref(false)

async function loadDuTables() {
  duTablesLoading.value = true
  try {
    const res = await dataSourceApi.getDbSchemaTables()
    duTableOptions.value = res.data ?? []
  } catch {
    // http 拦截器已提示；表清单为空时可稍后重开面板
  } finally {
    duTablesLoading.value = false
  }
}

function isNullOp(op: string): boolean {
  return op === 'IS_NULL' || op === 'NOT_NULL'
}

// ===== DATA_UPDATE 多表条目（config.updates，单条目 = 单表更新；多条目单事务全有或全无） =====

function addDataUpdateEntry(): void {
  const cfg = dataUpdateCfg.value
  if (!cfg) return
  if (!Array.isArray(cfg.updates)) cfg.updates = []
  cfg.updates.push({ table: '', setOps: [], where: [] })
}

/** 每表列结构缓存（多表模式按表拉取；键为表名） */
const duColumnsByTable = reactive(new Map<string, { key: string; columnType: string }[]>())
const duTableLoading = reactive(new Set<string>())

function duEntryLoading(table: string): boolean {
  return duTableLoading.has(String(table ?? '').trim())
}

async function ensureDuColumns(table: string): Promise<void> {
  const t = String(table ?? '').trim()
  if (!t || duColumnsByTable.has(t) || duTableLoading.has(t)) return
  duTableLoading.add(t)
  try {
    const res = await dataSourceApi.getDbSchemaColumns(t)
    duColumnsByTable.set(t, (res.data ?? []).map((c) => ({ key: c.key, columnType: c.columnType })))
  } catch {
    // http 拦截器已提示；置空表仍允许手填列名（allow-create）
    duColumnsByTable.set(t, [])
  } finally {
    duTableLoading.delete(t)
  }
}

watch(
  () =>
    // 仅 DATA_UPDATE 节点求值 dataUpdateCfg：START/END 等无配置节点的 computed getter
    // 依赖 ensureConfig 兑底才不抛错（真实事故：选中 START 即崩，见 ensureConfig 注释）
    node.value?.data.nodeType === 'DATA_UPDATE'
      ? (dataUpdateCfg.value?.updates ?? [])
          .map((u) => String(u?.table ?? '').trim())
          .join('\u0001')
      : '',
  (joined) => {
    for (const t of joined.split('\u0001')) {
      if (t) void ensureDuColumns(t)
    }
  },
  { immediate: true }
)

/** 多表条目列选项：该表真实列（除 tenant_id）+ SET/WHERE 已填列名兜底（含字面量占位历史值） */
function duEntryColumns(u: DataUpdateTableUpdate): { key: string; type: string }[] {
  const real = duColumnsByTable.get(String(u?.table ?? '').trim()) ?? []
  const cur = new Set<string>(real.map((c) => c.key))
  for (const op of u?.setOps ?? []) {
    const col = String(op.column ?? '').trim()
    if (col) cur.add(col)
  }
  for (const cond of u?.where ?? []) {
    const col = String(cond.column ?? '').trim()
    if (col) cur.add(col)
  }
  return [...cur]
    .filter((key) => key.toLowerCase() !== 'tenant_id')
    .sort()
    .map((key) => ({ key, type: real.find((c) => c.key === key)?.columnType ?? '' }))
}

// ===== DATA_UPSERT（业务数据写入：存在则更新/不存在则新增） =====

const dataUpsertCfg = computed(() => ensureConfig<DataUpsertNodeConfig>())

/** 已发布 BUSINESS 表单选项（选择表单 → 物理表 wf_biz_<formKey>） */
interface UpsertFormOption {
  key: string
  name: string
}
const upsertFormOptions = ref<UpsertFormOption[]>([])
const upsertFormsLoading = ref(false)

async function loadUpsertForms(): Promise<void> {
  if (upsertFormOptions.value.length || upsertFormsLoading.value) return
  upsertFormsLoading.value = true
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 1000 })
    const data = res.data as { content?: { key: string; name: string | null }[] } | null
    upsertFormOptions.value = (data?.content ?? [])
      .filter((f) => f?.key)
      .map((f) => ({ key: f.key, name: f.name || f.key }))
  } catch {
    // http 拦截器已提示；可稍后重开面板重试
  } finally {
    upsertFormsLoading.value = false
  }
}

/** 唯一索引列组缓存（键 = 物理表名）：冲突键下拉取 (tenant_id, 字段) 二列组的第二列 */
const upsertUniqueByTable = reactive(new Map<string, string[]>())
const upsertKeysLoading = ref(false)

/** 物理表名：wf_biz_<formKey>（未选表单为空串） */
const upsertTable = computed(() => {
  const k = String(dataUpsertCfg.value?.formKey ?? '').trim()
  return k ? 'wf_biz_' + k : ''
})

const upsertConflictOptions = computed(() => upsertUniqueByTable.get(upsertTable.value) ?? [])

async function ensureUpsertUniqueKeys(table: string): Promise<void> {
  if (!table || upsertUniqueByTable.has(table) || upsertKeysLoading.value) return
  upsertKeysLoading.value = true
  try {
    const res = await dataSourceApi.getDbSchemaUniqueKeys(table)
    const singles: string[] = []
    for (const g of res.data ?? []) {
      if (Array.isArray(g) && g.length === 2 && g[0] === 'tenant_id' && g[1]) singles.push(g[1])
    }
    upsertUniqueByTable.set(table, singles)
  } catch {
    // http 拦截器已提示；空列表时冲突键禁配（运行期引擎仍会实查校验）
    upsertUniqueByTable.set(table, [])
  } finally {
    upsertKeysLoading.value = false
  }
}

/** 表单切换：预取列结构与唯一键；清空不再可选的冲突键 */
function onUpsertFormChange(): void {
  void nextTick(() => {
    const t = upsertTable.value
    if (t) {
      void ensureDuColumns(t)
      void ensureUpsertUniqueKeys(t)
    }
    const opts = upsertUniqueByTable.get(t) ?? []
    const cfg = dataUpsertCfg.value
    if (cfg?.conflictKey && !opts.includes(cfg.conflictKey)) {
      cfg.conflictKey = ''
    }
  })
}

const upsertColumnsLoading = computed(() => (upsertTable.value ? duTableLoading.has(upsertTable.value) : false))

/** 写入字段列选项：真实业务列（排除引擎管理列）+ 已填列名兜底 */
function upsertColumnOptions(current: string): { key: string; type: string }[] {
  const real = upsertTable.value ? duColumnsByTable.get(upsertTable.value) ?? [] : []
  const managed = new Set(['id', 'tenant_id', 'version', 'created_by', 'created_at', 'updated_at'])
  const cur = new Set<string>(real.map((c) => c.key).filter((k) => !managed.has(k.toLowerCase())))
  const filled = String(current ?? '').trim()
  if (filled) cur.add(filled)
  return [...cur]
    .sort()
    .map((key) => ({ key, type: real.find((c) => c.key === key)?.columnType ?? '' }))
}

function addUpsertOnUpdate(): void {
  const cfg = dataUpsertCfg.value
  if (!cfg) return
  if (!Array.isArray(cfg.onUpdate)) cfg.onUpdate = []
  cfg.onUpdate.push({ column: '', value: '' })
}

watch(
  () => (node.value?.data.nodeType === 'DATA_UPSERT' ? upsertTable.value : ''),
  (t) => {
    if (t) {
      void loadUpsertForms()
      void ensureDuColumns(t)
      void ensureUpsertUniqueKeys(t)
    }
  },
  { immediate: true }
)

/** 多表条目目标表选项：全表清单 + 当前已填表名兜底（历史 DSL 的表可能已不在清单） */
function duEntryTableOptions(cur: string): string[] {
  const set = new Set(duTableOptions.value)
  const c = String(cur ?? '').trim()
  if (c) set.add(c)
  return [...set].sort()
}

/** 汇总输出键预览（别名合法时用别名，否则 t{序号}） */
const duKeysPreview = computed(() => {
  const updates = dataUpdateCfg.value?.updates ?? []
  return updates
    .map((u, i) => {
      const alias = String(u?.alias ?? '').trim()
      return alias && /^\w+$/.test(alias) ? `${alias}.affected` : `t${i}.affected`
    })
    .join(', ')
})

// ===== 已发布流清单（SUBFLOW 目标下拉用；拉首页大页后前端过滤） =====
const publishedFlows = ref<{ id: string; flowKey: string; name: string }[]>([])
const flowsLoading = ref(false)
onMounted(async () => {
  flowsLoading.value = true
  loadDuTables()
  try {
    const res = await logicFlowApi.list({ page: 1, size: 100 })
    const content: any[] = (res.data as any)?.content || []
    publishedFlows.value = content
      .filter((f) => f.status === 'PUBLISHED')
      .map((f) => ({ id: f.id, flowKey: f.flowKey, name: f.name }))
  } catch {
    // http 拦截器已提示；下拉为空时用户可稍后重开面板
  } finally {
    flowsLoading.value = false
  }
})

/** 循环体在画布上编辑（拖节点到循环虚线），面板仅展示步数提示 */

const isEmptyOperator = computed(
  () => conditionCfg.value.operator === 'EMPTY' || conditionCfg.value.operator === 'NOT_EMPTY'
)

// ===== Headers：Record<string,string> ↔ 键值对动态行 =====
interface KvRow {
  key: string
  value: string
}
const headerRows = ref<KvRow[]>([])

function loadHeaderRows() {
  if (!node.value || node.value.data.nodeType !== 'HTTP') {
    headerRows.value = []
    return
  }
  const headers = httpCfg.value?.headers || {}
  headerRows.value = Object.entries(headers).map(([key, value]) => ({ key, value: String(value ?? '') }))
}

function syncHeaders() {
  const map: Record<string, string> = {}
  for (const row of headerRows.value) {
    const key = row.key.trim()
    if (key) map[key] = row.value
  }
  httpCfg.value.headers = map
}

function addHeader() {
  headerRows.value.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  headerRows.value.splice(index, 1)
  syncHeaders()
}

// ===== 参数对动态行（queryParams/bodyParams/params：config 内直接增删） =====
type ParamListKey = 'queryParams' | 'bodyParams' | 'params'

function paramList(key: ParamListKey): { source: string; target: string }[] {
  if (key === 'params') return beanCfg.value.params
  return httpCfg.value[key]
}

function addParam(key: ParamListKey) {
  paramList(key).push({ source: '', target: '' })
}

function removeParam(key: ParamListKey, index: number) {
  paramList(key).splice(index, 1)
}

// ===== BEAN 清单：onMounted 拉取，失败降级输入框 =====
const beans = ref<BackendBeanInfo[]>([])
const beanLoadFailed = ref(false)

onMounted(async () => {
  try {
    const res = await logicFlowApi.listBeans()
    beans.value = res.data || []
  } catch {
    // http 拦截器已提示；降级为输入框
    beanLoadFailed.value = true
  }
})

const beanNames = computed(() => [...new Set(beans.value.map((b) => b.beanName))])

const beanMethods = computed(() =>
  beans.value
    .filter((b) => b.beanName === beanCfg.value.beanName)
    .map((b) => ({
      label: b.displayName ? `${b.methodName}（${b.displayName}）` : b.methodName,
      value: b.methodName,
    }))
)

function onBeanChanged() {
  // 切换 Bean 后，若方法名不属于该 Bean 则清空，避免悬挂非法组合
  const ok = beanMethods.value.some((m) => m.value === beanCfg.value.methodName)
  if (!ok) beanCfg.value.methodName = ''
}

// ===== 选中节点切换：重建 Headers 行（其余字段直接绑 config，无需重建） =====
watch(
  () => node.value?.id,
  () => loadHeaderRows(),
  { immediate: true }
)

async function copyNodeId() {
  const id = node.value?.id
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success(`已复制节点 ID：${id}`)
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}
</script>

<style scoped>
/* 悬浮卡片：与左侧调色板对称 */
.property-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  box-shadow:
    0 6px 24px rgba(31, 36, 55, 0.14),
    0 1px 4px rgba(31, 36, 55, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.property-panel:not(.collapsed) {
  width: 388px;
}

.property-panel.collapsed {
  width: 32px;
}

/* ===== 折叠态 ===== */
.collapse-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  cursor: pointer;
  gap: 6px;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color-page);
  transition: background 0.2s, color 0.2s;
}

.collapse-bar:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}

.bar-icon {
  font-size: 18px;
}

.bar-text {
  font-size: 12px;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  color: var(--el-text-color-secondary);
}

/* ===== 头部 ===== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.heading-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.panel-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-type-tag {
  font-weight: 600;
}

.header-action {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  transition: color 0.2s;
}

.header-action:hover {
  color: var(--el-color-danger);
}

.collapse-toggle {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: var(--el-color-primary);
}

/* ===== 节点 ID 行 ===== */
.panel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.meta-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  flex: 1;
  min-width: 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: all;
}

.meta-copy {
  flex-shrink: 0;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}

.meta-copy:hover {
  color: var(--el-color-primary);
}

/* ===== 主体：超高滚动 ===== */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  background: var(--el-bg-color-page);
}

.panel-form {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 12px 12px 4px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}

/* ===== 动态行块 ===== */
.rows-block {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 8px 4px;
  margin-bottom: 14px;
  background: color-mix(in srgb, var(--el-bg-color-page) 55%, transparent);
}

.rows-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.rows-empty {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 4px 0 8px;
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.kv-row .el-input {
  flex: 1;
  min-width: 0;
}

.kv-row .el-button {
  flex-shrink: 0;
  padding: 4px;
}

/* DATA_UPDATE 行：列名 / 模式 / 值 三段布局 */
.du-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.du-row .du-col {
  flex: 1.1;
  min-width: 0;
}

/* 目标表下拉占满表单项宽度（与原 el-input 对齐） */
.du-table-select {
  width: 100%;
}

/* 列下拉选项：列名 + 类型小字两端排布 */
.du-col-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.du-col-type {
  font-size: 11px;
  line-height: 1;
  color: var(--el-text-color-secondary);
}

.du-row .du-mode {
  width: 88px;
  flex-shrink: 0;
}

.du-row .du-value {
  flex: 1.4;
  min-width: 0;
}

.du-row .el-button {
  flex-shrink: 0;
  padding: 4px;
}

.du-warn {
  color: var(--el-color-warning);
}

/* 多表条目卡片：头部（序号+别名+删除） + 该表 SET/WHERE 编辑区 */
.du-multi-card {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light);
}

.du-multi-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.du-multi-idx {
  min-width: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.du-alias {
  width: 190px;
}

.du-output-hint {
  margin-top: 8px;
}

/* 输出参数声明行：单行卡片式（变量名+提取方式+类型+删除+json结构导入图标） */
.so-row {
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light);
}

.so-row .so-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
}

.so-row .so-name {
  flex: 1.2;
  min-width: 0;
}

.so-row .so-mode {
  width: 92px;
  flex-shrink: 0;
}

.so-row .so-type {
  width: 82px;
  flex-shrink: 0;
}

.so-row .el-button {
  flex-shrink: 0;
  padding: 4px;
}

.num-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

/* BATCH 循环体画布配置提示卡 */
.loop-hint {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--lf-batch) 82%, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--lf-batch) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--lf-batch) 40%, transparent);
}

.loop-hint.is-empty {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color-lighter);
}

/* 脚本编辑：等宽字体 */
.script-source :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
}

/* ===== SQL_SCRIPT：编辑器 + 语句解析预览 ===== */
.sql-source :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.sql-preview-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--el-color-danger) 40%, transparent);
}

.sql-stmt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  overflow: hidden;
}

.sql-stmt-row + .sql-stmt-row {
  margin-top: 4px;
}

.sql-stmt-idx {
  flex-shrink: 0;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.sql-stmt-kind {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 11px;
  line-height: 16px;
  color: #fff;
}

.sql-stmt-kind.kind-dml {
  background: color-mix(in srgb, #0e7490 78%, var(--el-color-primary));
}

.sql-stmt-kind.kind-insert {
  background: var(--el-color-success);
}

.sql-stmt-kind.kind-query {
  background: color-mix(in srgb, var(--lf-batch) 82%, var(--el-text-color-primary));
}

.sql-stmt-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--el-text-color-regular);
}

.sql-stmt-name {
  flex-shrink: 0;
  max-width: 30%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 11px;
  line-height: 16px;
  color: color-mix(in srgb, var(--lf-data) 85%, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--lf-data) 12%, transparent);
}

.sql-preview-hint {
  margin-top: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--lf-data) 82%, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--lf-data) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--lf-data) 38%, transparent);
}

.sql-onerror {
  width: 100%;
}

.sql-maxrows {
  width: 140px;
}

.panel-alert {
  margin-bottom: 14px;
}

.panel-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.panel-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

/* SUBFLOW 变量映射动态行 */
.mapping-rows {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mapping-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mapping-row .el-input {
  flex: 1;
  min-width: 0;
}
.mapping-arrow {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.mapping-row .el-button {
  flex-shrink: 0;
  padding: 4px;
}
</style>
