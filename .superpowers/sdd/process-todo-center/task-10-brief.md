## Task 10: 鍓嶇 鈥?鍙戣捣娴佺▼椤甸潰

**Files:**
- Create: `frontend/src/views/process/ProcessStartPage.vue`
- Modify: `frontend/src/router/index.ts`锛堟柊澧炶矾鐢憋級

- [ ] **Step 1: 鏂板璺敱 `/process/start/:processDefinitionId`**

- [ ] **Step 2: 瀹炵幇娴佺▼鍩烘湰淇℃伅鍖?+ 娴佺▼鍥鹃瑙堝尯锛堟姌鍙狅級**

璋冪敤 `GET /api/v1/deployed-processes/{id}` + `/xml`锛屾祦绋嬪浘鐢?BpmnViewer 缁勪欢锛圱ask 15 鎶藉彇鍓嶅彲涓存椂鍐呰仈 bpmn-js Viewer锛夈€?
- [ ] **Step 3: 瀹炵幇鍙戣捣琛ㄥ崟鍖?*

澶嶇敤 `FormRenderer` 缁勪欢锛屼紶鍏?formKey 鍔犺浇琛ㄥ崟瀹氫箟锛屽瓧娈垫潈闄愭寜"鍒涘缓鏃跺～鍐?銆?
- [ ] **Step 4: 瀹炵幇鎻愪氦閫昏緫**

```typescript
async function handleSubmit() {
  await formRef.value.validate()
  const variables = formRef.value.getFormData()
  const res = await processInstanceApi.start({ processKey: processDefinition.key, variables })
  ElMessage.success('鍙戣捣鎴愬姛')
  router.push({ path: '/process/todo', query: { tab: 'mine', highlight: res.data.id } })
}
```

- [ ] **Step 5: 澶勭悊鏃犲叧鑱旇〃鍗曠殑娴佺▼**

鏃?formKey 鏃朵粎灞曠ず娴佺▼淇℃伅 + "纭鍙戣捣"鎸夐挳銆?
- [ ] **Step 6: 娴忚鍣ㄩ獙璇?*

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(process-start): standalone start page with form and diagram preview"
```

---

