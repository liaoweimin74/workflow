<template>
    <div class="_fd-field-input">
        <i class="fc-icon icon-group" @click.stop="copy"></i>
        <el-input
            v-if="!fieldList.length"
            v-model="value"
            :readonly="fieldReadonly || disabled"
            :disabled="fieldReadonly || disabled"
            @focus="onFocus"
            @blur="onInput"
        >
            <template #append v-if="!fieldReadonly">
                <i class="fc-icon icon-auto" @click="makeField"></i>
            </template>
        </el-input>
        <el-tree-select
            v-else
            v-model="value"
            :readonly="fieldReadonly || disabled"
            :disabled="disabled"
            :allow-create="!fieldReadonly"
            :filterable="true"
            :default-first-option="!fieldReadonly"
            :indent="10"
            :checkStrictly="isSubform && relationField !== true"
            popper-class="_fd-field-popper"
            @focus="onFocus"
            @change="onInput"
            @current-change="currentChange"
            :data="processedFieldList"
            :props="{ value: 'value', label: 'label' }"
            node-key="value"
        />
    </div>
</template>

<script>
import {defineComponent, nextTick, onUnmounted} from 'vue';
import uniqueId from '@form-create/utils/lib/unique';
import {copyTextToClipboard, escapeRegExp} from '../utils';
import errorMessage from '../utils/message';
import is from '@form-create/utils/lib/type';
import {deepCopy} from '@form-create/utils/lib/deepextend';

export default defineComponent({
    name: 'FieldInput',
    inject: ['designer'],
    emits: ['update:modelValue'],
    props: {
        modelValue: String,
        disabled: Boolean,
    },
    computed: {
        fieldList() {
            if (this.key) {
                return this.getFieldList();
            }
            return [];
        },
        processedFieldList() {
            this.nodeMap.clear();
            return this.processFieldListForTreeSelect(this.fieldList);
        },
        subformFieldList() {
            const fieldList = this.designer.setupState.fieldList || [];
            const _fieldList = this.fieldLeafSelectable ? fieldList : this.removeLeafNodes(deepCopy(fieldList));
            if (_fieldList.length) {
                return _fieldList;
            }
            return fieldList;
        },
        fieldReadonly() {
            return this.designer.setupState.fieldReadonly;
        },
        isSubform() {
            return this.activeRule && this.activeRule._menu.subForm;
        },
        activeRule() {
            return this.designer.setupState.activeRule;
        },
        relationField() {
            return this.designer.props.config.relationField;
        },
        fieldLeafSelectable() {
            return this.designer.props.config.fieldLeafSelectable !== false;
        },
        t() {
            return this.designer.setupState.t;
        },
    },
    data() {
        return {
            value: this.modelValue || '',
            oldValue: '',
            key: 1,
            activeNode: null,
            nodeMap: new Map(), // 存储节点映射关系
        };
    },
    watch: {
        modelValue(n) {
            // 如果有字段列表，需要将原始值转换为唯一ID
            if (this.fieldList.length > 0) {
                const uniqueId = this.findUniqueIdByValue(n);
                this.value = uniqueId || n;
            } else {
                this.value = n;
            }
        },
        fieldList: {
            handler() {
                // 当字段列表变化时，重新映射当前值
                if (this.fieldList.length > 0 && this.modelValue) {
                    const uniqueId = this.findUniqueIdByValue(this.modelValue);
                    if (uniqueId) {
                        this.value = uniqueId;
                    }
                }
            },
            immediate: true,
            deep: true,
        },
    },
    methods: {
        getFieldList() {
            let fieldList = this.designer.props.config?.fieldList || [];
            if (this.relationField === false) {
                return fieldList;
            }
            if (this.isSubform) {
                fieldList = this.subformFieldList;
            } else {
                const rule = this.activeRule;
                let ctx = rule && rule.__fc__ && rule.__fc__.parent;
                while (ctx) {
                    if (ctx.rule._menu && ['array', 'object'].indexOf(ctx.rule._menu.subForm) > -1) {
                        const _fieldList = this.findChildrenById(fieldList, ctx.rule.field) || fieldList;
                        if (_fieldList.length) {
                            fieldList = _fieldList;
                        }
                        break;
                    } else {
                        ctx = ctx.parent;
                    }
                }
            }
            return fieldList;
        },
        removeLeafNodes(tree) {
            if (!Array.isArray(tree) || tree.length === 0) {
                return tree;
            }

            function recurse(nodes) {
                return nodes.filter(node => {
                    if (node.children && node.children.length > 0) {
                        node.children = recurse(node.children);
                        return true;
                    }
                    return false;
                });
            }

            return recurse(tree);
        },
        findChildrenById(tree, id) {
            if (!Array.isArray(tree)) {
                return null;
            }
            for (const node of tree) {
                if (node.value === id) {
                    return node.children || [];
                }
                if (node.children) {
                    const result = this.findChildrenById(node.children, id);
                    if (result !== null) {
                        return result;
                    }
                }
            }
            return null;
        },
        copy() {
            copyTextToClipboard(this.modelValue);
        },
        getSubChildren() {
            let subChildren = this.designer.setupState.getSubFormChildren(this.activeRule) || [];
            subChildren = is.trueArray(subChildren) ? subChildren : this.designer.setupState.children;
            return subChildren;
        },
        getSubFieldChildren() {
            const subChildren = this.getSubChildren();
            const list = [];
            const getRule = children => {
                children &&
                children.forEach(rule => {
                    if (rule && rule._fc_drag_tag && rule.field) {
                        list.push({...rule, children: []});
                    } else if (rule && rule.children) {
                        getRule(rule.children);
                    }
                });
                return list;
            };
            return getRule(subChildren);
        },
        checkValue(inputValue = null) {
            const oldField = this.oldValue;
            const temp = escapeRegExp(oldField);
            let field = ((inputValue !== null ? inputValue : this.value) || '').replace(/[\s\　]/g, '');
            if (!field) {
                errorMessage(this.t('computed.fieldEmpty'));
                return oldField;
            } else if (!/^[a-zA-Z]/.test(field)) {
                errorMessage(this.t('computed.fieldChar'));
                return oldField;
            } else if (oldField !== field) {
                const flag = field.indexOf('.') > -1;
                if (flag) {
                    field = field.replaceAll('.', '_');
                }
                if (
                    this.designer.setupState.getConfig('checkFieldUnique') !== false &&
                    this.getSubFieldChildren().filter(v => v.field === field).length > 0
                ) {
                    errorMessage(this.t('computed.fieldExist', {label: field}));
                    return oldField;
                }
                if (flag) {
                    return field;
                }
            }
            this.oldValue = '';
            return field;
        },
        onFocus() {
            this.oldValue = this.value;
        },
        makeField() {
            this.oldValue = this.value;
            this.value = uniqueId();
            this.onInput();
        },
        updateRule(node) {
            const update = {...(node.update || {})};
            if (!update.title) {
                update.title = node.label;
            }
            this.designer.setupState.mergeRule(this.activeRule, update);
            this.designer.setupState.updateRuleFormData();
        },
        onInput() {
            if (this.value !== this.modelValue) {
                const actualValue = this.nodeMap.has(this.value) ? this.getOriginalValueByUniqueId(this.value) : this.value;
                this.value = this.checkValue(actualValue);
                if (this.value !== this.modelValue) {
                    const node = this.activeNode;
                    this.activeNode = null;
                    this.oldValue = this.value;
                    this.designer.emit('changeField', {field: this.value, oldField: this.modelValue, rule: this.activeRule});
                    this.$emit('update:modelValue', this.value);
                    if (node) {
                        this.updateRule(node);
                    }
                }
            }
        },
        currentChange(node) {
            this.activeNode = node;
        },
        processFieldListForTreeSelect(fieldList, parentPath = '') {
            if (!Array.isArray(fieldList)) {
                return [];
            }

            return fieldList.map((item, index) => {
                const uniqueId = parentPath ? `${parentPath}.${index}` : `${index}`;
                const processedItem = {
                    ...item,
                    id: uniqueId, // 使用 id 作为唯一标识
                    originalValue: item.value, // 保存原始值
                    value: uniqueId, // 使用唯一 ID 作为 value
                };

                // 存储映射关系，用于后续查找原始值
                this.nodeMap.set(uniqueId, item);

                if (item.children && item.children.length > 0) {
                    processedItem.children = this.processFieldListForTreeSelect(item.children, uniqueId);
                }

                return processedItem;
            });
        },
        getOriginalValueByUniqueId(uniqueId) {
            const node = this.nodeMap.get(uniqueId);
            return node ? node.value : uniqueId;
        },
        findUniqueIdByValue(value, fieldList = null) {
            const list = fieldList || this.fieldList;
            if (!Array.isArray(list)) {
                return null;
            }

            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (item.value === value) {
                    return i.toString();
                }
                if (item.children && item.children.length > 0) {
                    const result = this.findUniqueIdByValue(value, item.children);
                    if (result !== null) {
                        return `${i}.${result}`;
                    }
                }
            }
            return null;
        },
    },
    mounted() {
        const updateKey = () => {
            nextTick(() => {
                ++this.key;
            });
        };
        this.designer.setupState.bus.$on('dragEnd', updateKey);
        onUnmounted(() => {
            this.designer.setupState.bus.$off('dragEnd', updateKey);
        });
    },
});
</script>

<style>
._fd-field-input {
    width: 100%;
    position: relative;
}

._fd-field-input > .fc-icon {
    position: absolute;
    right: 28px;
    top: 1px;
    z-index: 3;
    color: #a8abb2;
    cursor: pointer;
    width: 24px;
    height: 24px;
    text-align: center;
}

._fd-field-input .el-input-group__append {
    width: 25px;
    padding: 0;
    margin: 0;
    color: #aaaaaa;
    cursor: pointer;
}

._fd-field-popper .el-tree-node__content {
    padding: 2px 0;
    color: #333;
}

._fd-field-popper .el-select-dropdown__list > .el-select-dropdown__item {
    padding-left: 15px;
    border-bottom: 1px solid #ececec;
    box-sizing: border-box;
    height: 26px;
}
</style>
