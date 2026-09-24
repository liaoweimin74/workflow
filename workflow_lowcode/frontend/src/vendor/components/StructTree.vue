<template>
    <FcTree
        class="_fd-struct-tree"
        ref="tree"
        :data="treeData"
        :indent="10"
        default-expand-all
        :placeholder="treePlaceholder"
        :filter-node-method="treeFilterNode"
        :get-key="getKey"
        :get-children="getChildren"
        draggable
        :can-inner-drop="treeCanInnerDrop"
        :before-drag="treeBeforeDrag"
        :before-drop="treeBeforeDrop"
        ensure-children
        @select="select"
        @drop="onDrop"
    >
        <template #default="{ node, data }">
            <slot :node="node" :data="data" />
        </template>
    </FcTree>
</template>

<script>
import FcTree from './tree/FcTree.vue';

function defaultGetKey(item) {
    return item?.id ?? item?.rule?._fc_id ?? item?.rule?.field ?? item?.rule?.name ?? item;
}

export default {
    name: 'StructTree',
    components: { FcTree },
    inject: {
        designer: { default: null },
    },
    props: {
        getKey: { type: Function, default: defaultGetKey },
        // 通用树 children 适配（默认使用 item.children）
        getChildren: { type: Function, default: item => item?.children },
    },
    computed: {
        designerProxy() {
            return this.designer.setupState;
        },
        treeData() {
            return Array.isArray(this.designerProxy.treeInfo) ? this.designerProxy.treeInfo : [];
        },
        treePlaceholder() {
            return this.designerProxy.t('designer.search');
        },
    },
    methods: {
        filter(val) {
            this.$refs.tree && this.$refs.tree.filter && this.$refs.tree.filter(val);
        },
        select(item) {
            // 这里是 StructTree 的唯一使用点（树面板），选中即激活组件
            this.designerProxy.triggerActive(item?.rule);
        },
        treeFilterNode(val, data) {
            if (!val) return true;
            return (
                data.id?.indexOf(val) > -1 ||
                data.rule?.field?.indexOf(val) > -1 ||
                data.rule?.name?.indexOf(val) > -1 ||
                data.rule?.title?.indexOf(val) > -1 ||
                data.rule.__fc__?.refRule?.__$title?.value?.indexOf(val) > -1 ||
                (typeof data.rule?.children?.[0] === 'string' && data.rule?.children?.[0].indexOf(val) > -1)
            );
        },
        treeCanInnerDrop(item) {
            const rule = item?.rule;
            if (!rule) return false;
            const menu = rule._menu;
            if (!menu) return true;
            if (menu.drag === true) return true;
            if (menu.children) return true;
            return false;
        },
        treeBeforeDrag({ dragItem }) {
            const rule = dragItem?.rule;
            if (!rule) return false;
            const d = this.designerProxy;
            const hiddenDragBtn = d.hiddenDragBtn;
            const hidden = typeof hiddenDragBtn === 'object' && hiddenDragBtn ? hiddenDragBtn.value : hiddenDragBtn;
            const permission = d.getPermission(rule);
            return !(permission?.move === false || hidden);
        },
        treeBeforeDrop({ dragItem, toParent }) {
            const dragRule = dragItem?._menu ? dragItem : dragItem?.rule;
            const toParentRule = toParent?._menu ? toParent : toParent?.rule;
            if (!dragRule || !toParentRule) return !!dragRule._menu.menu;
            const menu = toParentRule._menu;
            if (menu) {
                if (!menu.children && menu.drag !== true) return false;
                if (menu.children && menu.children !== menu.name && menu.children !== dragRule._menu?.name) return false;
                if (!dragRule._menu.menu) {
                    if (dragRule.__fc__.parent.rule.type === 'DragTool') {
                        return dragRule.__fc__.parent.parent.rule === toParentRule;
                    } else {
                        return dragRule.__fc__.parent.rule === toParentRule;
                    }
                }
            }
            return true;
        },
        getMovableRule(rule) {
            if (!rule) return null;
            if (rule._menu?.inside) {
                return rule;
            }
            return rule.__fc__?.parent?.rule || rule;
        },
        getRuleTop(rule) {
            let parent = rule?.__fc__?.parent?.rule;
            let current = rule;
            const config = parent?._menu;
            if (config && config.inside) {
                current = parent;
                parent = parent.__fc__?.parent?.rule;
            }
            return { root: parent, parent: current };
        },
        getRuleParentInfo(rule) {
            const moveRule = this.getMovableRule(rule);
            const parentRule = moveRule?.__fc__?.parent?.rule || null;
            return {
                moveRule,
                parentRule,
                list: parentRule?.children || [],
            };
        },
        getRootRuleList(fallbackRule) {
            const firstRoot = (this.treeData || [])[0];
            if (firstRoot?.rule) {
                const { list } = this.getRuleParentInfo(firstRoot.rule);
                if (Array.isArray(list) && list.length > 0) {
                    return list;
                }
                const mr = this.getMovableRule(firstRoot.rule);
                if (mr && Array.isArray(mr.children)) {
                    return mr.children;
                }
                return list || [];
            }
            if (fallbackRule) {
                return this.getRuleTop(fallbackRule).root?.children || [];
            }
            return [];
        },
        onDrop(payload) {
            // payload 来自 FcTree：dragItem/dropItem 是树节点对象（非 rule）
            const dragItem = payload?.dragItem;
            if (!dragItem) return false;

            const sourceInfo = this.getRuleParentInfo(dragItem.rule);
            if (!sourceInfo.moveRule || !sourceInfo.list) return false;

            // beforeDrop/canDrop 已在 FcTree 里判断过，这里只做最终业务移动
            let targetList;
            let targetIndex = payload.toIndex;
            if (payload.dropType === 'inner') {
                const targetItem = payload.toParent;
                if (!targetItem) return false;
                if (!Array.isArray(targetItem.rule.children)) targetItem.rule.children = [];
                targetList = targetItem.rule.children;
            } else if (payload.toKey === '__root__') {
                targetList = this.getRootRuleList(dragItem.rule);
            } else {
                const targetItem = payload.dropItem;
                const targetInfo = targetItem ? this.getRuleParentInfo(targetItem.rule) : null;
                targetList = targetInfo?.list || null;
            }
            if (!targetList) return false;

            const oldIndex = sourceInfo.list.indexOf(sourceInfo.moveRule);
            if (oldIndex < 0) return false;

            // 同一列表内拖拽时，resolvedIndex 是“包含自身”的插入位；若最终还是原位，直接视为无操作
            if (sourceInfo.list === targetList) {
                let normalizedIndex = targetIndex;
                if (oldIndex < normalizedIndex) normalizedIndex -= 1;
                if (normalizedIndex === oldIndex) return false;
            }
            delete sourceInfo.moveRule.slot;
            this.designerProxy.handleSortBefore();

            sourceInfo.list.splice(oldIndex, 1);
            if (sourceInfo.list === targetList && oldIndex < targetIndex) {
                targetIndex -= 1;
            }
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex > targetList.length) targetIndex = targetList.length;
            targetList.splice(targetIndex, 0, sourceInfo.moveRule);
            this.designerProxy.handleSortAfter();
            return true;
        },
    },
};
</script>

<style scoped>
._fd-struct-tree {
    padding: 8px 12px;
}
</style>
