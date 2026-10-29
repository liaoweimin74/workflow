<template>
  <view class="lc-page">
  <uni-forms :model="pageForm" class="lc-page-form">
    <!-- lc:node=n1 type=input field=Fbdrmvlrseypabc -->
    <uni-forms-item label="输入框" name="Fbdrmvlrseypabc" :error-message="pageErrors.Fbdrmvlrseypabc">
      <uni-easyinput v-model="pageForm.Fbdrmvlrseypabc" />
    </uni-forms-item>
  </uni-forms>
    <!-- lc:todo node=n2 type=radio field=F73vmvlryro4abc 组件族 uniapp 装配按任务落地 -->
  <uni-forms :model="pageForm" class="lc-page-form">
    <!-- lc:node=n3 type=LookupPicker field=lookup1792808694695 -->
    <uni-forms-item label="选择" name="lookup1792808694695" :error-message="pageErrors.lookup1792808694695">
      <view class="lc-lookup" @click="openLookupLookup1792808694695">
        <uni-easyinput readonly :model-value="String(pageForm.lookup1792808694695 ?? '')" placeholder="请选择" />
        <text v-if="pageForm.lookup1792808694695" class="lc-lookup__clear" @click.stop="clearLookupLookup1792808694695">×</text>
      </view>
      <uni-popup ref="lookup1792808694695Popup" type="bottom" background-color="#fff">
        <view class="lc-lookup__panel">
          <view class="lc-lookup__panel-head">
            <text class="lc-lookup__panel-title">选择记录</text>
            <text class="lc-lookup__panel-cancel" @click="closeLookupLookup1792808694695">取消</text>
          </view>
          <uni-search-bar v-model="lookup1792808694695Keyword" placeholder="搜索" cancel-button="none" @confirm="lookup1792808694695Search" @clear="lookup1792808694695Search" />
          <scroll-view scroll-y class="lc-lookup__body" @scrolltolower="lookup1792808694695LoadMore">
            <view v-for="row in lookup1792808694695Rows" :key="row.id" class="lc-lookup__row" @click="selectLookupLookup1792808694695(row)">
              <text class="lc-lookup__row-text">{{ uniPickerTextOf(row, lookup1792808694695Spec.displayField) }}</text>
            </view>
            <view class="lc-lookup__status">{{ lookup1792808694695Loading ? '加载中…' : lookup1792808694695Finished ? '没有更多了' : '' }}</view>
          </scroll-view>
        </view>
      </uni-popup>
    </uni-forms-item>
  </uni-forms>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { applyUniPickerWrites, clearUniPickerWrites, uniPickerTextOf, useUniPicker } from '@lc/runtime-uni/picker'
import { useUniForm } from '@lc/runtime-uni/form'
const ds = { id: '', refId: '' }
const pageFormRules = [
  {
    field: 'Fbdrmvlrseypabc',
    title: '输入框'
  },
  {
    field: 'lookup1792808694695',
    title: '选择'
  }
]
const { model: pageForm, errors: pageErrors } = useUniForm(pageFormRules)
const columns = []
const returnFields = {}
const lookup1792808694695Spec = {
  idField: '',
  returnFields: {},
  displayField: ''
}
const lookup1792808694695Picker = useUniPicker({ refId: ds.refId })
const { rows: lookup1792808694695Rows, keyword: lookup1792808694695Keyword, loading: lookup1792808694695Loading, finished: lookup1792808694695Finished } = lookup1792808694695Picker
const lookup1792808694695Popup = ref()
function openLookupLookup1792808694695() {
  lookup1792808694695Popup.value?.open()
  void lookup1792808694695Picker.open()
}
function closeLookupLookup1792808694695() {
  lookup1792808694695Popup.value?.close()
  lookup1792808694695Picker.close()
}
function lookup1792808694695Search() {
  void lookup1792808694695Picker.onSearch()
}
function lookup1792808694695LoadMore() {
  void lookup1792808694695Picker.loadMore()
}
/** lc:node=n3 type=LookupPicker field=lookup1792808694695 选中：idField/returnFields 回写（web LookupPicker.vue:273-295） */
function selectLookupLookup1792808694695(row: Record<string, unknown>) {
  applyUniPickerWrites(pageForm, row, lookup1792808694695Spec)
  pageForm.lookup1792808694695 = uniPickerTextOf(row, lookup1792808694695Spec.displayField)
  closeLookupLookup1792808694695()
}
function clearLookupLookup1792808694695() {
  clearUniPickerWrites(pageForm, lookup1792808694695Spec)
  pageForm.lookup1792808694695 = ''
}
</script>

<style scoped>
.lc-page {
  padding: 24rpx;
}
</style>