## Task 9: 鍓嶇 鈥?娴佺▼涓績椤甸潰

**Files:**
- Modify: `frontend/src/views/process/ProcessCenterPage.vue`

- [ ] **Step 1: 瀹炵幇鍒嗙被鍒嗙粍鎶樺彔灞曠ず**

浣跨敤 `el-collapse` + `el-collapse-item`锛屾瘡涓垎绫讳竴涓潰鏉裤€傝皟鐢?`categoryApi.tree()` 鑾峰彇鍒嗙被锛宍processDesignApi` 鎴栨柊 API 鑾峰彇宸查儴缃叉祦绋嬫寜 categoryId 鍒嗙粍銆?
- [ ] **Step 2: 瀹炵幇娴佺▼鍗＄墖**

`el-card` 缃戞牸甯冨眬锛屾瘡寮犲崱鐗囷細娴佺▼鍚嶇О銆佸浘鏍囷紙el-icon 榛樿锛夈€佹弿杩般€佺増鏈彿銆?鍙戣捣"鎸夐挳銆傜偣鍑?鍙戣捣" 鈫?`router.push('/process/start/' + processDefinitionId)`銆?
- [ ] **Step 3: 瀹炵幇鍚嶇О鎼滅储妗?*

椤堕儴 `el-input` 鎼滅储锛岃緭鍏ヨЕ鍙?`GET /api/v1/deployed-processes?name=<keyword>&status=active`锛屾悳绱㈡椂鎵€鏈?collapse 闈㈡澘灞曞紑銆?
- [ ] **Step 4: 绌虹姸鎬佸鐞?*

鏃犲彲鍙戣捣娴佺▼鏃?`el-empty` 鎻愮ず銆?
- [ ] **Step 5: 娴忚鍣ㄩ獙璇?*

鍚姩鍓嶇锛岃闂?`/process/center`锛岀‘璁ゅ垎绫诲睍绀恒€佹悳绱€佸崱鐗囨覆鏌撴甯搞€?
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(process-center): category-grouped process list with search"
```

---

