<!-- 由 lc-codegen 从页面 schema 出码，勿手改登记表以外的部分；人工接管写在 handler 里 -->
<template>
  <div class="lc-page lc-page--stretch">
    <el-form class="lc-page-form" :inline="false" :hide-required-asterisk="false" label-position="right" size="default" label-width="125px">
      <!-- lc:node=n1 type=page-list-cards field=cards1792036403314 -->
      <el-form-item label="卡片列表">
        <page-list-cards :external-actions="true" page-key="cardlist_test" :ds-ref-id="ds.refId" :columns="columns" :show-search="true" :stretch="true" :view-actions="viewActions" :view-detail="viewDetail" actions-placement="bottom" :card-style="cardStyle" @row-click="onRowClick" @button-click="onButtonClick" />
      </el-form-item>
    </el-form>
    <!-- lc:node=n2 type=formContainer field=Fcb4mva5poegabc ds=ds_mvck4gv9 -->
    <el-dialog v-model="containerVisible" title="编辑记录" width="800px">
      <div class="lc-container-body">
        <el-form ref="formRef" :model="form" label-width="var(--lc-label-width)">
          <!-- lc:node=n2.f1 type=input field=order_no -->
          <el-form-item label="订单编号">
            <el-input v-model="form.order_no" placeholder="如 SO-20261015-001" />
          </el-form-item>
          <!-- lc:node=n2.f2 type=datePicker field=order_date -->
          <el-form-item label="下单日期">
            <el-date-picker v-model="form.order_date" type="date" value-format="YYYY-MM-DD" />
          </el-form-item>
          <!-- lc:node=n2.f3 type=input field=customer_id -->
          <el-form-item label="客户记录ID">
            <el-input v-model="form.customer_id" />
          </el-form-item>
          <!-- lc:node=n2.f4 type=LookupPicker field=customer -->
          <el-form-item label="选择客户">
            <LookupPicker v-model="form.customer" data-source-id="ds_mvck4gv91" display-field="name" :search-columns="searchColumns" id-field="customer_id" :return-fields="returnFields" :columns="columns2" />
          </el-form-item>
          <!-- lc:node=n2.f5 type=input field=contact_name -->
          <el-form-item label="联系人">
            <el-input v-model="form.contact_name" placeholder="由查找带回自动回填" />
          </el-form-item>
          <!-- lc:node=n2.f6 type=input field=contact_phone -->
          <el-form-item label="联系电话">
            <el-input v-model="form.contact_phone" placeholder="由查找带回自动回填" />
          </el-form-item>
          <!-- lc:node=n2.f7 type=dataPicker field=warehouse -->
          <el-form-item label="发货仓库">
            <dataPicker v-model="form.warehouse" data-source-id="ds_mvck4gv92" display-field="name" :search-columns="searchColumns2" :max-count="1" :columns="columns3" />
          </el-form-item>
          <!-- lc:node=n2.f8 type=input field=warehouse_text -->
          <el-form-item label="发货仓库（显示）">
            <el-input v-model="form.warehouse_text" />
          </el-form-item>
          <!-- lc:todo node=n2.f9 type=group field=items 组件类型无出码契约，整字段未出码 -->
          <!-- lc:todo node=n2.f10 type=tableForm field=delivery_plan 组件类型无出码契约，整字段未出码 -->
          <!-- lc:todo node=n2.f11 type=subForm field=invoice_info 组件类型无出码契约，整字段未出码 -->
          <!-- lc:node=n2.f12 type=inputNumber field=order_amount -->
          <el-form-item label="订单总金额">
            <el-input-number v-model="form.order_amount" :precision="2" :min="0" />
          </el-form-item>
          <!-- lc:node=n2.f13 type=inputNumber field=discount_rate -->
          <el-form-item label="折扣率">
            <el-input-number v-model="form.discount_rate" :precision="2" :min="0" :max="1" />
          </el-form-item>
          <!-- lc:node=n2.f14 type=FormulaField field=due_amount -->
          <el-form-item label="应收金额">
            <FormulaField v-model="form.due_amount" expression="ROUND(${order_amount} * (1 - ${discount_rate}), 2)" prefix="¥" />
          </el-form-item>
          <!-- lc:node=n2.f15 type=textarea field=remark -->
          <el-form-item label="订单备注">
            <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="特殊要求、付款条款等" />
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
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import PageListCards from '@lc/runtime/page-list-cards'
import LookupPicker from '@lc/runtime/LookupPicker'
import DataPicker from '@lc/runtime/dataPicker'
import FormulaField from '@lc/runtime/FormulaField'
import { getData, createData, updateData, deleteData } from './api/cardlist-test'

// ==================== 数据源（schema.dataSources[]）====================
const ds = { id: 'ds_mvck4gv9', refId: '25e8df2b1f1241d0a79ef33d819d0f54' }
// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId
const dataSources = {
  'ds_mvck4gv9': '25e8df2b1f1241d0a79ef33d819d0f54',
  'ds_mvck4gv91': '35bccab82a284257ad935529d518905a',
  'ds_mvck4gv92': '58c300fb631946c799ab07b8198a2a2b',
  'ds_mvck4gv93': '3a645d7c6d3847838780d8931250abcb',
}


const columns = [
  {
    prop: 'order_no',
    label: '订单编号'
  },
  {
    prop: 'order_date',
    label: '下单日期'
  },
  {
    prop: 'customer',
    label: '选择客户'
  },
  {
    prop: 'contact_name',
    label: '联系人'
  },
  {
    prop: 'contact_phone',
    label: '联系电话'
  }
]

const viewActions = {
  buttons: [
    {
      key: 'edit',
      label: '编辑',
      placement: 'column',
      style: 'text',
      events: [
        {
          trigger: 'click',
          actions: []
        }
      ]
    },
    {
      key: 'delete',
      label: '删除',
      placement: 'column',
      style: 'text'
    }
  ],
  permissions: ''
}

const viewDetail = {
  width: '800px',
  type: 'form'
}

const cardStyle = {
  theme: 'default',
  base: {
    enabled: true,
    when: '',
    css: "background-color: var(--el-bg-color);\nborder-color: var(--el-border-color-light);\nborder-radius: 8px;\npadding: 16px;\ngap: 16px;\nfont-size: 16px;\nfont-weight: 600;\ncolor: var(--el-text-color-primary);\n--card-field-font-size: 14px;\n--card-field-label-color: var(--el-text-color-secondary);\n--card-field-value-color: var(--el-text-color-primary);"
  },
  rules: []
}

const searchColumns = [
  "name"
]

const returnFields = {
  contact: 'contact_name',
  phone: 'contact_phone'
}

const columns2 = [
  {
    prop: 'customer_code',
    label: '客户编码'
  },
  {
    prop: 'name',
    label: '客户名称'
  },
  {
    prop: 'contact',
    label: '联系人'
  }
]

const searchColumns2 = []

const columns3 = [
  "warehouse_code",
  "name",
  "address"
]

// ==================== 节点 n2：formContainer（schema.rule[1]）====================
const containerVisible = ref(false)
const containerReadonly = ref(false)
const containerMode = ref<'create' | 'edit' | 'view'>('create')
const containerRecordId = ref('')
const containerVersion = ref<number | undefined>(undefined)
const formRef = ref()
const form = reactive<Record<string, unknown>>({ order_no: '', order_date: '', customer_id: '', customer: '', contact_name: '', contact_phone: '', warehouse: '', warehouse_text: '', order_amount: '', discount_rate: '', due_amount: '', remark: '' })

/** lc:node=n2 → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */
async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {
  containerMode.value = mode
  containerReadonly.value = readonly
  containerRecordId.value = recordId
  containerVersion.value = undefined
  Object.keys(form).forEach((k) => { form[k] = '' })
  containerVisible.value = true
  if (recordId) {
    const res = await getData(recordId)
    // BizDataVO = { id, version, data: {业务字段} }：字段在 vo.data 里，摊错层就是一张空表单
    const vo = (res.data ?? {}) as { version?: number; data?: Record<string, unknown> }
    const record = vo.data ?? {}
    // 只回填容器声明过的字段（对齐 DsBindingEngine.ts:79-82）：整条记录灌进 form，保存时
    // { ...form } 会把根本没在编辑的业务字段一起写回去；id/version 留在字段模型之外
    Object.keys(form).forEach((k) => { if (k in record) form[k] = record[k] })
    containerVersion.value = typeof vo.version === 'number' ? vo.version : undefined
  }
}

function closeContainer() {
  containerVisible.value = false
}

async function confirmSave() {
  if (containerMode.value === 'create') {
    await createData({ ...form })
  } else {
    await updateData(containerRecordId.value, { ...form }, containerVersion.value)
  }
  closeContainer()
  // lc:todo 列表组件未 defineExpose，取数刷新需人工接（page-list-cards 现状）
}

// ==================== lc:behavior ← schema.actions ====================
// 原形态：[{"trigger":"row-edit","steps":[{"op":"open-container","target":"ds_mvck4gv9"}]}]
// target 填数据源标识 → 出码时解引用成具体容器（同源画布靠前的容器），运行期不再查表
function onButtonClick(payload: { key: string; row: Record<string, unknown> | null }) {
  const row = payload.row
  switch (payload.key) {
    case 'edit':
      void openContainer(String(row?.id ?? ''), false, 'edit')
      return
    case 'delete':
      if (row?.id != null) void deleteData(String(row.id)).then(() => { /* lc:todo 列表组件未 defineExpose，取数刷新需人工接（page-list-cards 现状） */ })
      return
  }
}

function onRowClick(_row: Record<string, unknown>) {
  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管
}

</script>

<style scoped>
.lc-page--stretch {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.lc-page--stretch .lc-page-form {
  height: 100%;
  min-height: 0;
}
.lc-page--stretch .lc-page-form :deep(.el-form-item),
.lc-page--stretch .lc-page-form :deep(.el-form-item__content) {
  height: 100%;
  min-height: 0;
  min-width: 0;
}
.lc-container-body {
  overflow-y: auto;
  height: 600px;
}
</style>
