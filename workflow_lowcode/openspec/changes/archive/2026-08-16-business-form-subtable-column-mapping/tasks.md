# Tasks: business-form-subtable-column-mapping

## 1. 鍚庣锛氭暟鎹ā鍨嬩笌 DDL 灞?
- [x] 1.1 `ColumnConfig.java` 澧炲姞 `subColumns`锛圠ist<ColumnConfig>锛変笌 `subMode`锛圫tring锛岀己鐪?embedded锛夊瓧娈靛強 getter/setter
- [x] 1.2 `DdlBuilder.java` 鏂板 `buildCreateSubTable(formKey, field, subColumns)` 鐢熸垚瀛愯〃寤鸿〃 SQL锛堝浐瀹氬垪 id/biz_id/tenant_id/sort_no/version/鏃堕棿鍒?+ 瀛愪笟鍔″垪 + (tenant_id, biz_id) 绱㈠紩锛?- [x] 1.3 `DdlBuilder.java` 鏂板 `buildAlterSubTable(formKey, field, desired, existing)` 鐢熸垚瀛愯〃宸紓鍙樻洿 SQL锛堝鐢ㄤ富琛ㄨ鍒欙細澧炲垪/鏀瑰/鏀瑰繀濉?鍔犵储寮曪紝绂佸垹鍒?绂佽法绫伙級
- [x] 1.4 `DdlBuilder.java` `validateColumns` 閫掑綊鏍￠獙 `subColumns`锛堝垪鍚?绫诲瀷/闀垮害鐧藉悕鍗曞鐢ㄧ幇鏈夐€昏緫锛?- [x] 1.5 `DynamicTableManager.java` 鏂板 `ensureSubTable(formKey, field, subColumns)`锛堣〃涓嶅瓨鍦ㄢ啋寤鸿〃锛涘瓨鍦ㄢ啋宸紓鍙樻洿锛夛紝澶嶇敤 `tableExists`/`findTableColumns`
- [x] 1.6 鏂板 `DdlBuilderTest` 瀛愯〃鐢ㄤ緥锛氬缓琛?SQL 鏂█銆侀潪娉曞瓙琛ㄥ瓧娈靛悕銆佸瓙琛ㄥ垪鐧藉悕鍗曘€佺鍒犲垪/绂佽法绫?- [x] 1.7 鏂板 `DynamicTableManagerTest` 瀛愯〃鐢ㄤ緥锛氭柊寤哄瓙琛ㄣ€佸樊寮傚彉鏇淬€佺粨鏋勪笉鍙樿烦杩?
## 2. 鍚庣锛氬彂甯冩牎楠屼笌娴佺▼

- [x] 2.1 `ColumnTypeMapper.java`锛歚UNSUPPORTED_COMPONENTS` 绉婚櫎 subTable/SubTable/nestedForm/NestedForm/dataTable锛沗mapComponentToColumn` 瀵?`subForm` 杩斿洖 JSON 鍒楋紝`group`/`tableForm` 杩斿洖 null锛堢敱涓婂眰瀛愯〃閫昏緫澶勭悊锛屼笉钀藉叆涓昏〃鍒楋級
- [x] 2.2 `FormDefinitionService.java`锛歚UNSUPPORTED_COMPONENTS` 鍚屾淇锛堢Щ闄ゅ瓙琛ㄧ被鍨嬶紝淇濈暀 userPicker/deptPicker/divider/groupContainer锛夛紱`validateBusinessSchema` 鏀逛负鍏佽 group/tableForm/subForm
- [x] 2.3 `FormDefinitionService.publish()`锛歚parseColumnConfig` 鏀寔宓屽 subColumns 瑙ｆ瀽锛汢USINESS 鍒嗘敮鍦?`ensureTable` 鍚庨亶鍘嗗瓙琛ㄥ瓧娈佃皟鐢?`ensureSubTable`
- [x] 2.4 鏂板/鏇存柊 `FormDefinitionPublishBusinessTest`锛氬彂甯冨惈 group 瀛愯〃锛堝垱寤轰富琛?瀛愯〃锛夈€佸彂甯冨惈 subForm锛堜粎 JSON 鍒楋級銆佸彂甯冨惈 userPicker锛?00锛夈€佸瓙琛ㄥ瓧娈甸潪娉曪紙400 涓旀棤 DDL锛?- [x] 2.5 鏇存柊 `ColumnTypeMapperTest`锛歴ubTable/nestedForm 鏂█绉婚櫎鎴栨敼涓烘柊璇箟锛坓roup/tableForm鈫抧ull 鐢ㄤ簬瀛愯〃鍒嗘敮銆乻ubForm鈫扟SON锛?
## 3. 鍚庣锛欱izDataService 瀛愯〃 CRUD

- [x] 3.1 `BizDataContext`/`loadContext` 澧炲姞瀛愯〃鍒楁槧灏勮В鏋愶紙subColumns + subMode + 瀛愯〃琛ㄥ悕锛?- [x] 3.2 `BizDataService.create`锛氬啓鍏ヤ富琛ㄥ悗閬嶅巻璇锋眰涓殑瀛愯〃瀛楁鎵归噺鎻掑叆瀛愯〃琛岋紙biz_id=涓昏〃鏂?id锛宻ort_no=鏁扮粍搴忓彿锛岄€愯鐢熸垚 id锛?- [x] 3.3 `BizDataService.update`锛氬璇锋眰鎼哄甫鐨勫瓙琛ㄥ瓧娈垫墽琛屽閲?diff锛堝簱涓瓨鍦ㄨ€岃姹傜己澶扁啋DELETE锛涙湁 id 涓斿瓨鍦ㄢ啋姣旇緝鍒楀€?UPDATE + 閲嶆帓 sort_no锛涙棤 id 鎴栦笉鍦ㄥ簱鈫扞NSERT锛夛紱鏈惡甯︾殑瀛愯〃瀛楁涓嶅鐞?- [x] 3.4 `BizDataService.getById`锛歴ubMode=embedded 鏃舵寜 biz_id 鎵归噺 IN 鏌ュ瓙琛ㄨ缁勮鏁扮粍杩斿洖锛坰ort_no 鍗囧簭锛夛紱dedicated 鏃朵笉鍐呭祵
- [x] 3.5 `BizDataService.delete`锛氬垹闄や富琛ㄨ鍚庡悓浜嬪姟绾ц仈鍒犻櫎鍏ㄩ儴瀛愯〃琛?- [x] 3.6 瀛愯〃琛屾暟涓婇檺鏍￠獙锛堥粯璁?100锛岃秴闄?400锛?- [x] 3.7 鏂板鐙珛瀛愯〃琛?CRUD 鎺ュ彛锛歚BizDataController` 澧炲姞 GET/POST/PUT/DELETE `/api/v1/biz-data/{formKey}/{id}/sub/{field}[/{rowId}]`锛堢鎴烽殧绂汇€佷富琛ㄨ 404銆佷箰瑙傞攣 409銆佸繀濉?绫诲瀷鏍￠獙澶嶇敤锛?- [x] 3.8 鏂板/鏇存柊 `BizDataServiceTest`/`BizDataHandlerTest`锛歝reate 鎵归噺鎻掑叆銆乽pdate diff锛堝/鍒?鏀癸級銆佹湭鎼哄甫涓嶅彉銆佺骇鑱斿垹闄ゃ€佽鏁拌秴闄愩€佺嫭绔嬫帴鍙ｅ悇鍦烘櫙

## 4. 鍓嶇锛氬垪鏄犲皠 UI

- [x] 4.1 `ColumnConfigDialog.vue`锛歚UNSUPPORTED_TYPES` 绉婚櫎 subTable/SubTable/nestedForm/NestedForm/dataTable锛屼繚鐣?divider/groupContainer 绛夛紱`collectFields` 瀵?group/tableForm 鐢熸垚瀛愯〃閰嶇疆椤癸紙key/label + 鍙睍寮€瀛愬垪锛夛紝subForm 鏄犲皠 JSON 鍒?- [x] 4.2 `ColumnConfigDialog.vue` 瀛愯〃閰嶇疆 UI锛氬瓙琛ㄥ瓧娈佃鍙睍寮€锛屽睍绀哄瓙鍒楁槧灏勬帶浠讹紙澶嶇敤鐜版湁鍒楁槧灏勮锛氱被鍨?闀垮害/蹇呭～/鍞竴/绱㈠紩锛? 浼犺緭鏂瑰紡閫夋嫨锛堝唴宓?鐙珛鎺ュ彛锛?- [x] 4.3 `ColumnConfigDialog.vue` `handleConfirm`锛氬瓙琛ㄥ瓧娈佃緭鍑?`subColumns` + `subMode`锛岃繃婊ら€昏緫閫傞厤宓屽
- [x] 4.4 鏇存柊 `ColumnConfigItem` 鎺ュ彛绫诲瀷瀹氫箟锛坰ubColumns/subMode 鍙€夊瓧娈碉級

## 5. 绔埌绔獙璇?
- [x] 5.1 鎵嬪伐楠岃瘉锛氳璁″櫒閰嶇疆鍚?group 瀛愯〃鐨?BUSINESS 琛ㄥ崟 鈫?鍙戝竷鎴愬姛 鈫?涓昏〃+瀛愯〃寤鸿〃锛圫QL 妫€鏌ワ級
- [x] 5.2 鎵嬪伐楠岃瘉锛歅OST 涓昏〃甯﹀瓙琛ㄨ 鈫?GET 鍐呭祵杩斿洖 鈫?PUT 澧為噺 diff锛堝/鍒?鏀癸級鈫?DELETE 绾ц仈娓呯┖
- [x] 5.3 鎵嬪伐楠岃瘉锛歴ubMode=dedicated 琛ㄥ崟璧扮嫭绔嬪瓙琛ㄦ帴鍙?CRUD锛泂ubForm 琛ㄥ崟鍊艰惤 JSON 鍒?- [x] 5.4 鍥炲綊锛氭棦鏈夋棤瀛愯〃 BUSINESS 琛ㄥ崟鍙戝竷/CRUD 琛屼负涓嶅彉锛沇ORKFLOW 琛ㄥ崟瀛愯〃鑳藉姏涓嶅彈褰卞搷
