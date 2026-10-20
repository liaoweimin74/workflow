<template>
  <!-- lc:node=n1 type=page-table field=table1789468745852 ds=ds_mu2jhb3n -->
  <div class="lc-page lc-page--stretch">
    <page-table
      ref="tableRef"
      :ds-ref-id="ds.refId"
      :columns="columns"
      :search-fields="searchFields"
      :sortable-fields="sortableFields"
      :show-search="true"
      :pagination="true"
      :page-size="20"
      :page-sizes="[10, 20, 50]"
      :border="true"
      :stripe="true"
      :selection-mode="'none'"
      :stretch="true"
      :buttons="buttons"
      @row-click="onRowClick"
      @button-click="onButtonClick"
      @selection-change="onSelectionChange"
    />

    <!-- lc:node=n2 type=formContainer field=F7n9mu2jn6reabc ds=ds_mu2jhb3n
         容器出成真模板（字段是 EP 控件），不保留 runtime 标签；
         展示方式取 viewDetail.formMode='drawer'，忽略 schema.actions[0].steps[0].displayMode='dialog' -->
    <el-drawer v-model="containerVisible" title="编辑记录" size="800px" destroy-on-close>
      <div class="lc-container-body">
        <el-form
          ref="formRef"
          :model="form"
          :inline="false"
          size="default"
          label-width="var(--lc-label-width)"
          label-position="right"
          :hide-required-asterisk="false"
        >
          <!-- lc:node=n2.f1 type=input field=name title=姓名 -->
          <el-form-item label="姓名">
            <el-input v-model="form.name" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button v-if="containerReadonly" type="primary" @click="closeContainer">关闭</el-button>
        <template v-if="!containerReadonly">
          <el-button @click="closeContainer">取消</el-button>
          <el-button type="primary" @click="confirmSave">确定</el-button>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import PageTable from '@lc/runtime/page-table'
import { queryData, getData, createData, updateData, deleteData } from './api/test-page'

// ==================== 数据源（schema.dataSources[]）====================
const ds = { id: 'ds_mu2jhb3n', refId: '20f476f047ca4386bfd1365ea5516832' }
// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId
const dataSources = {
  'ds_mu2jhb3n': '20f476f047ca4386bfd1365ea5516832',
}

// ==================== 节点 n1：page-table（schema.rule[0].props）====================
const tableRef = ref<InstanceType<typeof PageTable> | null>(null)

const columns = [
  { prop: 'code', label: '人员编码' },
  { prop: 'name', label: '人员姓名' },
  { prop: 'dept', label: '所属部门' },
]
const searchFields = [
  { key: 'code', label: '人员编码', matchType: 'eq' },
  { key: 'name', label: '人员姓名', matchType: 'eq' },
  { key: 'dept', label: '所属部门', matchType: 'eq' },
]
const sortableFields = ['code', 'name']

// lc:behavior=b1 的挂点：按钮点击是总线 row-edit/row-view/row-create 的唯一入口
const buttons = [
  { key: 'edit', label: '编辑', placement: 'column', style: 'icon' },
  { key: 'delete', label: '删除', placement: 'column', style: 'icon' },
  { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
  { key: 'view', label: '查看', placement: 'column', style: 'button' },
]

// ==================== 节点 n2：formContainer（schema.rule[1]）====================
const containerVisible = ref(false)
const containerReadonly = ref(false)
const containerMode = ref<'create' | 'edit' | 'view'>('create')
const containerRecordId = ref('')
const formRef = ref()
const form = reactive<Record<string, unknown>>({ name: '' })

/** lc:node=n2 → 打开容器并取记录（原 bus op=load-record / open-container 的合并语义） */
async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {
  containerMode.value = mode
  containerReadonly.value = readonly
  containerRecordId.value = recordId
  form.name = ''
  containerVisible.value = true
  if (recordId) {
    const res = await getData(ds.refId, recordId)
    Object.assign(form, res.data ?? {})
  }
}

function closeContainer() {
  containerVisible.value = false
}

async function confirmSave() {
  if (containerMode.value === 'create') {
    await createData(ds.refId, { ...form })
  } else {
    await updateData(ds.refId, containerRecordId.value, { ...form })
  }
  closeContainer()
  tableRef.value?.refresh()
}

// ==================== lc:behavior=b1 ← schema.actions[0] ====================
// 原形态：{ trigger:'row-edit', source:'ds_mu2jhb3n', steps:[{ op:'open-container', target:'ds_mu2jhb3n' }] }
// target 填的是数据源标识 → 出码时解引用成具体容器（同源画布靠前的容器），运行期不再查表
function onButtonClick(payload: { key: string; row: Record<string, unknown> | null }) {
  const row = payload.row
  switch (payload.key) {
    case 'edit':
      void openContainer(String(row?.id ?? ''), false, 'edit')
      return
    case 'view':
      void openContainer(String(row?.id ?? ''), true, 'view')
      return
    case 'create':
      void openContainer('', false, 'create')
      return
    case 'delete':
      if (row?.id != null) void deleteData(ds.refId, String(row.id)).then(() => tableRef.value?.refresh())
      return
  }
}

function onRowClick(_row: Record<string, unknown>) {
  // schema.actions 中无 row-click 触发的动作链 → 生成空实现，保留挂点供人工接管
}

function onSelectionChange(_rows: Record<string, unknown>[]) {
  // 无关联动作
}
</script>

<style scoped>
.lc-page--stretch {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.lc-container-body {
  overflow-y: auto;
  height: 600px;
}
</style>
