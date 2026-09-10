## 1. 鍚庣锛歅rocessTaskPredictionService

- [x] 1.1 鍒涘缓 `ProcessTaskPredictionService`锛屾敞鍏?`HistoryService`銆乣RuntimeService`銆乣RepositoryService`
- [x] 1.2 瀹炵幇 `getPrediction(processInstanceId)` 鏂规硶锛岃繑鍥?`List<ExecutionNodeVO>`
- [x] 1.3 瀹炵幇宸叉墽琛岃妭鐐规煡璇細浠?`HistoricActivityInstance` 鑾峰彇宸插畬鎴愮殑 userTask 鑺傜偣锛屽悎骞?`TaskComment` 鐨勫鎵逛俊鎭?- [x] 1.4 瀹炵幇褰撳墠娲昏穬鑺傜偣鏌ヨ锛氫粠 `RuntimeService.getActivityInstances()` 鑾峰彇褰撳墠娲昏穬鑺傜偣
- [x] 1.5 瀹炵幇 BPMN 鎷撴墤閬嶅巻鏂规硶 `traversePrediction(bpmnModel, activeNodeId)`
- [x] 1.6 鍒涘缓 `ExecutionNodeVO` DTO锛坅ctivityId, activityName, type, status, assigneeName, endTime, action, comment, hasBranch, lineType锛?- [x] 1.7 缂栧啓鍗曞厓娴嬭瘯 `ProcessTaskPredictionServiceTest`

## 2. 鍚庣锛欰PI 鎺ュ彛

- [x] 2.1 `ProcessInstanceController` 鏂板 `GET /{id}/prediction` 绔偣
- [x] 2.2 缂栧啓 Controller 娴嬭瘯 `ProcessInstanceControllerTest`

## 3. 鍓嶇锛歅rocessTaskExecutionList 缁勪欢

- [x] 3.1 鍒涘缓 `ProcessTaskExecutionList.vue`锛岃〃鏍煎睍绀烘墽琛岃妭鐐瑰垪琛?- [x] 3.2 瀹炵幇鐘舵€佸垪锛氬凡鎵ц锛堢豢鑹叉爣绛撅級銆佽繘琛屼腑锛堣摑鑹叉爣绛撅級銆佸緟鎵ц锛堢伆鑹叉爣绛撅級
- [x] 3.3 瀹炵幇杩炵嚎鍒楋細瀹炵嚎绠ご锛堚啋锛夈€佽櫄绾跨澶达紙鈬級
- [x] 3.4 瀹炵幇鍔ㄤ綔鍒楋細閫氳繃锛堢豢锛夈€侀┏鍥烇紙绾級銆佽浆鍔烇紙姗欙級銆佸娲撅紙绱級
- [x] 3.5 瀵煎嚭缁勪欢骞舵敞鍐屽埌 `components/business/index.ts`

## 4. 鍓嶇锛欰PI 鍜岄〉闈㈡暣鍚?
- [x] 4.1 `processInstanceApi` 鏂板 `prediction(id)` 鏂规硶
- [x] 4.2 淇敼 `ProcessInstanceTrackPage.vue`锛屽姞杞?prediction 鏁版嵁
- [x] 4.3 鏇挎崲"瀹℃壒璁板綍"鍗＄墖涓?鎵ц璁板綍"鍗＄墖锛屽鎵硅褰曟椂闂寸嚎鎶樺彔鏀惰捣
- [x] 4.4 鍓嶇缂栬瘧楠岃瘉

## 5. 闆嗘垚娴嬭瘯

- [x] 5.1 绔埌绔祴璇曪細鍚姩娴佺▼ 鈫?瀹屾垚涓€涓换鍔?鈫?楠岃瘉 prediction 鎺ュ彛杩斿洖姝ｇ‘
- [x] 5.2 楠岃瘉宸茬粨鏉熷疄渚嬬殑 prediction 杩斿洖绌洪娴嬪垪琛