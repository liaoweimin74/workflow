## Task 12: 鍓嶇 鈥?浠诲姟澶勭悊璇︽儏椤?
**Files:**
- Create: `frontend/src/views/process/TaskDetailPage.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 鏂板璺敱 `/process/todo/:taskId`**

- [ ] **Step 2: 瀹炵幇椤堕儴娴佺▼鍩烘湰淇℃伅鍖?*

璋冪敤 `taskApi.getDetail(taskId)` 鍔犺浇锛屽睍绀烘祦绋嬪悕绉?缂栧彿/鍙戣捣浜?鍙戣捣鏃堕棿/褰撳墠鑺傜偣銆?
- [ ] **Step 3: 瀹炵幇涓儴瀹℃壒琛ㄥ崟鍖?*

鑻ユ湁 formKey锛宍FormRenderer` 娓叉煋琛ㄥ崟锛堟潈闄愭寜"瀹℃壒鏃舵煡鐪?锛夈€備笅鏂瑰彧璇诲睍绀?`el-descriptions` 鍒楀嚭娴佺▼鍙橀噺銆?
- [ ] **Step 4: 瀹炵幇搴曢儴瀹℃壒鎰忚鍖?+ 鎿嶄綔鎸夐挳**

`el-input type="textarea"` 瀹℃壒鎰忚銆備富鎸夐挳"閫氳繃""椹冲洖"銆俙el-dropdown` 鏇村鎿嶄綔锛氳浆鍔?濮旀淳/鍔犵/杞锛屽悇寮瑰嚭 UserPicker 瀵硅瘽妗嗐€?
- [ ] **Step 5: 瀹炵幇鍚勬搷浣滈€昏緫**

```typescript
async function handleApprove() {
  await taskApi.complete(taskId, { variables: { comment: comment.value } })
  ElMessage.success('瀹℃壒閫氳繃')
  router.push('/process/todo')
}
// 鍚岀悊 handleReject/handleTransfer/handleDelegate/handleAddSign/handleForwardSign
```

- [ ] **Step 6: 瀹炵幇鍙充晶娴佺▼璺熻釜鍖?*

`el-drawer` 鎴栧彸渚у浐瀹氶潰鏉匡細BpmnViewer 楂樹寒鍥?+ ApprovalTimeline 缁勪欢銆傝皟鐢?`highlight` + `history` API銆?
- [ ] **Step 7: 娴忚鍣ㄩ獙璇?*

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(task-detail): three-section layout with approve operations and tracking"
```

---

