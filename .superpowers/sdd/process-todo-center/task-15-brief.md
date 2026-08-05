## Task 15: 鍓嶇 鈥?閫氱敤缁勪欢鎶藉彇

**Files:**
- Create: `frontend/src/components/business/BpmnViewer.vue`
- Create: `frontend/src/components/business/ApprovalTimeline.vue`
- Create: `frontend/src/components/business/UserPicker.vue`

- [ ] **Step 1: 鎶藉彇 BpmnViewer 缁勪欢**

鍩轰簬 `bpmn-js/lib/NavigatedViewer`锛宲rops: xml, highlightData锛坈ompleted/activity 鑺傜偣 ID 鏁扮粍锛夈€傚皝瑁?import/娓叉煋/楂樹寒 overlay 閫昏緫銆傞噸鏋?Task 10/12/14 涓唴鑱旂殑 bpmn-js 璋冪敤鏀圭敤姝ょ粍浠躲€?
- [ ] **Step 2: 鎶藉彇 ApprovalTimeline 缁勪欢**

props: records锛圓pprovalRecordVO[]锛夈€傜敤 `el-timeline` 娓叉煋锛屾瘡椤规樉绀鸿妭鐐?鍔炵悊浜?鏃堕棿/鎰忚/鎿嶄綔绫诲瀷鏍囩銆?
- [ ] **Step 3: 鎶藉彇 UserPicker 缁勪欢**

props: multiple锛坆oolean锛夈€傚熀浜?`el-select` + 杩滅▼鎼滅储璋冪敤 `GET /api/users`銆傞噸鏋?Task 12 涓浆鍔?濮旀淳/鍔犵/杞鐨?UserPicker 瀵硅瘽妗嗘敼鐢ㄦ缁勪欢銆?
- [ ] **Step 4: TypeScript 缂栬瘧 + 娴忚鍣ㄩ獙璇?*

Run: `cd frontend && npx tsc --noEmit`
Expected: 鏃犻敊璇?
- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(components): extract BpmnViewer, ApprovalTimeline, UserPicker"
```

---

