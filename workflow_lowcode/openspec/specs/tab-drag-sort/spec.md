# tab-drag-sort Specification

## Purpose
TBD - created by archiving change framework-ui-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 页签拖拽排序

页签 SHALL 支持通过拖拽重新排序。拖拽功能 SHALL 使用 `vuedraggable` 库实现。

#### Scenario: 拖拽页签到新位置
- **WHEN** 用户按住一个页签并拖拽到另一个位置
- **THEN** 该页签移动到新位置
- **AND** 其他页签顺序相应调整

---

### Requirement: 首页固定最左

dashboard 页签 MUST 固定在页签栏最左侧，不可被拖拽到其他位置，也不可被其他页签拖拽到其左侧。

#### Scenario: dashboard 不可拖拽
- **WHEN** 用户尝试拖拽 dashboard 页签
- **THEN** dashboard 页签不响应拖拽

#### Scenario: 其他页签不可拖到 dashboard 左侧
- **WHEN** 用户拖拽一个非 dashboard 页签尝试放到 dashboard 左侧
- **THEN** 该页签放置在 dashboard 右侧的第一个位置

---

### Requirement: 锁定页签可拖拽

已锁定的页签 SHALL 可以被拖拽排序。锁定状态只影响关闭行为，不影响拖拽行为。

#### Scenario: 拖拽锁定页签
- **WHEN** 用户拖拽一个已锁定的页签到新位置
- **THEN** 该页签移动到新位置
- **AND** 锁定状态保持不变

