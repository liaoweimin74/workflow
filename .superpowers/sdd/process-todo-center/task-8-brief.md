## Task 8: 鍓嶇 鈥?API 妯″潡灏佽

**Files:**
- Create: `frontend/src/api/task.ts`
- Modify: `frontend/src/api/processDefinition.ts`
- Modify or Create: `frontend/src/api/processInstance.ts`
- Create: `frontend/src/api/taskRemind.ts`

**Interfaces:**
- Produces: `taskApi`锛坙istTodo, listHistoric, getDetail, complete, reject, transfer, delegate, addSign, forwardSign锛?- Produces: `processInstanceApi`锛坙ist 鏀寔 initiator/status/processName, get, highlight, history锛?- Produces: `taskRemindApi`锛坮emind锛?
- [ ] **Step 1: 鍒涘缓 task.ts 灏佽浠诲姟 API**

```typescript
// frontend/src/api/task.ts
import http from '@/utils/http'
import type { R } from '@/types/common'

export interface TaskTodoVO { /* 瀵瑰簲鍚庣 VO 瀛楁 */ }
export interface TaskDoneVO extends TaskTodoVO { endTime: string; approveResult: string }
export interface TaskDetailVO { /* 瀵瑰簲鍚庣 VO 瀛楁 */ }

export const taskApi = {
  listTodo(params): Promise<R<PageResponse<TaskTodoVO>>> { return http.get('/tasks', { params }) },
  listHistoric(params): Promise<R<PageResponse<TaskDoneVO>>> { return http.get('/tasks/historic', { params }) },
  getDetail(id): Promise<R<TaskDetailVO>> { return http.get(`/tasks/${id}`) },
  complete(id, data): Promise<R<any>> { return http.post(`/tasks/${id}/complete`, data) },
  reject(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/reject`, data) },
  transfer(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/transfer`, data) },
  delegate(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/delegate`, data) },
  addSign(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/add-sign`, data) },
  forwardSign(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/forward-sign`, data) },
}
```

- [ ] **Step 2: 鎵╁睍 processDefinition.ts 鈥?deployed-processes 澧炲姞绛涢€夊弬鏁?*

- [ ] **Step 3: 鍒涘缓/鎵╁睍 processInstance.ts 鈥?list 澧炲姞 initiator/status/processName + history 绔偣**

- [ ] **Step 4: 鍒涘缓 taskRemind.ts**

- [ ] **Step 5: TypeScript 缂栬瘧楠岃瘉**

Run: `cd frontend && npx tsc --noEmit`
Expected: 鏃犵被鍨嬮敊璇?
- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(api): add task/processInstance/taskRemind API modules"
```

---

