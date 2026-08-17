<template>
    <li
        class="_fd-tree-node"
        :class="nodeClass"
        role="treeitem"
        :aria-expanded="hasChildren ? String(expanded) : undefined"
        :data-key="String(itemKey)"
    >
        <div
            class="_fd-tree-node__content"
            :class="contentClass"
            :style="{ paddingLeft: padLeft }"
            :data-key="String(itemKey)"
            @click="onSelect"
        >
            <span v-if="showBeforeLine" class="_fd-tree-node__drop-line is-before"></span>
            <span class="_fd-tree-node__expand" :class="hasChildren ? '' : 'is-leaf'" @click="onToggle">
                <i v-if="hasChildren" class="fc-icon icon-caret-right" :class="{ down: expanded }"></i>
                <span v-else class="_fd-tree-node__expand-placeholder"></span>
            </span>
            <div class="_fd-tree-node__label">
                <slot :node="nodeCtx" :data="item" />
            </div>
            <span v-if="showAfterLine" class="_fd-tree-node__drop-line is-after"></span>
        </div>
        <ul
            v-if="expanded"
            class="_fd-tree-node__children"
            role="group"
            :data-parent-key="String(itemKey)"
            :style="{ marginLeft: indent + 'px' }"
        >
            <FcTreeNode
                v-for="child in children"
                :key="getKey(child)"
                :item="child"
                :level="level + 1"
                :indent="indent"
                :expanded-keys="expandedKeys"
                :get-key="getKey"
                :get-children="getChildren"
                :drag-state="dragState"
                @toggle="$emit('toggle', $event)"
                @select="$emit('select', $event)"
            >
                <template #default="scope">
                    <slot v-bind="scope" />
                </template>
            </FcTreeNode>
        </ul>
    </li>
</template>

<script>
export default {
    name: 'FcTreeNode',
    props: {
        item: { type: Object, required: true },
        level: { type: Number, required: true },
        indent: { type: Number, required: true },
        expandedKeys: { type: Object, required: true }, // Set
        getKey: { type: Function, required: true },
        getChildren: { type: Function, required: true },
        dragState: {
            type: Object,
            default: () => ({}),
        },
    },
    emits: ['toggle', 'select'],
    computed: {
        itemKey() {
            return this.getKey(this.item);
        },
        children() {
            const v = this.getChildren(this.item);
            return Array.isArray(v) ? v : [];
        },
        hasChildren() {
            return this.children.length > 0;
        },
        expanded() {
            return !!this.expandedKeys?.has?.(this.itemKey);
        },
        padLeft() {
            return `${(this.level - 1) * this.indent}px`;
        },
        nodeCtx() {
            return {
                level: this.level,
                expanded: this.expanded,
                isLeaf: !this.hasChildren,
            };
        },
        isDragSource() {
            return this.dragState?.draggingKey === String(this.itemKey);
        },
        isHoverTarget() {
            return this.dragState?.hoverKey === String(this.itemKey);
        },
        showBeforeLine() {
            return this.isHoverTarget && this.dragState?.dropType === 'before' && this.dragState?.allowed !== false;
        },
        showAfterLine() {
            return this.isHoverTarget && this.dragState?.dropType === 'after' && this.dragState?.allowed !== false;
        },
        contentClass() {
            return {
                'is-drop-inner': this.isHoverTarget && this.dragState?.dropType === 'inner' && this.dragState?.allowed !== false,
            };
        },
        nodeClass() {
            return {
                'is-drag-source': this.isDragSource,
            };
        },
    },
    methods: {
        onToggle(e) {
            e?.stopPropagation?.();
            this.$emit('toggle', this.item);
        },
        onSelect() {
            this.$emit('select', this.item);
        },
    },
};
</script>

<style scoped>
._fd-tree-node__content {
    display: flex;
    align-items: center;
    position: relative;
}

._fd-tree-node__label {
    width: 100%;
    min-width: 0;
    cursor: pointer;
    font-size: 14px;
    min-height: 30px;
    user-select: none;
}

._fd-tree-node__children {
    list-style: none;
    padding: 0;
    margin: 0;
    min-height: 8px; /* 空子级也能拖入（由使用方决定是否创建空 children） */
    padding-bottom: 2px;
    box-sizing: border-box;
}

._fd-tree-node__expand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: 2px;
    cursor: pointer;
    color: #262626;
    flex: 0 0 auto;
}

._fd-tree-node__expand.is-leaf {
    cursor: default;
}

._fd-tree-node__expand-placeholder {
    display: inline-block;
    width: 12px;
    height: 12px;
}

._fd-tree-node__expand .icon-caret-right {
    display: inline-block;
    transition: transform 0.15s ease;
}

._fd-tree-node__expand .icon-caret-right.down {
    transform: rotate(90deg);
}

._fd-tree-node.is-drag-source > ._fd-tree-node__content {
    opacity: 0.45;
}

._fd-tree-node__content.is-drop-inner {
    background: rgba(46, 115, 255, 0.05);
    border-radius: 4px;
}

._fd-tree-node__content:hover {
    background-color: rgba(46, 115, 255, 0.05);
    color: #2e73ff !important;
}

._fd-tree-node__drop-line {
    position: absolute;
    left: 18px;
    right: 0;
    height: 2px;
    background: rgba(46, 115, 255, 0.5);
    pointer-events: none;
    border-radius: 1px;
}

._fd-tree-node__drop-line.is-before {
    top: -1px;
}

._fd-tree-node__drop-line.is-after {
    bottom: -1px;
}
</style>
