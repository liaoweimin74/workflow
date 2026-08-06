## Task 14: 鍓嶇 鈥?娴佺▼瀹炰緥璺熻釜椤?
**Files:**
- Create: `frontend/src/views/process/ProcessInstanceTrackPage.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 鏂板璺敱 `/process/instance/:instanceId`**

- [ ] **Step 2: 瀹炵幇娴佺▼鍩烘湰淇℃伅 + 楂樹寒鍥?*

璋冪敤 `processInstanceApi.get(id)` + `highlight(id)`銆侭pmnViewer 娓叉煋楂樹寒锛堝凡瀹屾垚缁胯壊/褰撳墠钃濊壊锛夈€?
- [ ] **Step 3: 瀹炵幇瀹℃壒璁板綍鏃堕棿绾?*

`ApprovalTimeline` 缁勪欢锛岃皟鐢?`processInstanceApi.history(id)` 娓叉煋鏃堕棿绾裤€?
- [ ] **Step 4: 瀹炵幇鍌姙鎸夐挳**

杩涜涓疄渚嬫樉绀?鍌姙"鎸夐挳锛岃皟鐢?`taskRemindApi.remind(currentTaskId)`銆傚鐞嗛鐜囬檺鍒堕敊璇彁绀恒€?
- [ ] **Step 5: 宸茬粨鏉熷疄渚嬪彧璇?*

`instance.ended === true` 鏃朵笉鏄剧ず鍌姙鎸夐挳銆?
- [ ] **Step 6: 娴忚鍣ㄩ獙璇?*

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(process-track): instance tracking page with highlight, timeline, remind"
```

---

