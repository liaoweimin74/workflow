<template>
    <Struct
        v-model="structValue"
        text
        :title="t('struct.editText')"
        :defaultValue="''"
        :placeholder="placeholder"
        :validate="validateStruct"
    ></Struct>
</template>

<script>
import { defineComponent } from 'vue';
import Struct from './Struct.vue';

export default defineComponent({
    name: 'OptionsTextInput',
    emits: ['update:modelValue'],
    components: { Struct },
    inject: ['designer'],
    props: {
        modelValue: {
            type: Array,
            default: () => [],
        },
        field: {
            type: Object,
            default: () => ({
                label: 'label',
                value: 'value',
                children: 'children',
            }),
        },
        parseSpace: {
            type: Boolean,
            default: false,
        },
        placeholder: {
            type: String,
            default: '',
        },
    },
    computed: {
        t() {
            return this.designer.setupState.t;
        },
        labelKey() {
            return this.field?.label || 'label';
        },
        valueKey() {
            return this.field?.value || 'value';
        },
        childrenKey() {
            return this.field?.children || 'children';
        },
    },
    data() {
        return {
            structValue: '',
            syncingFromModel: false,
        };
    },
    watch: {
        modelValue: {
            handler(val) {
                this.syncingFromModel = true;
                this.structValue = this.optionsToText(Array.isArray(val) ? val : []);
                this.$nextTick(() => {
                    this.syncingFromModel = false;
                });
            },
            immediate: true,
            deep: true,
        },
        structValue(val) {
            if (this.syncingFromModel) {
                return;
            }
            this.$emit('update:modelValue', this.textToOptions(val));
        },
        parseSpace() {
            this.syncingFromModel = true;
            this.structValue = this.optionsToText(Array.isArray(this.modelValue) ? this.modelValue : []);
            this.$nextTick(() => {
                this.syncingFromModel = false;
            });
        },
    },
    methods: {
        validateStruct(val) {
            return typeof val === 'string';
        },
        optionsToText(options, depth = 0) {
            if (!Array.isArray(options) || !options.length) {
                return '';
            }
            const lines = [];
            options.forEach(item => {
                const text = item?.[this.labelKey] ?? item?.[this.valueKey] ?? '';
                if (text !== '') {
                    const level = this.parseSpace ? depth : 0;
                    lines.push(`${' '.repeat(level)}${text}`);
                }
                if (Array.isArray(item?.[this.childrenKey]) && item[this.childrenKey].length) {
                    const childText = this.optionsToText(item[this.childrenKey], depth + 1);
                    if (childText) {
                        lines.push(childText);
                    }
                }
            });
            return lines.join('\n');
        },
        textToOptions(text) {
            const lines = String(text || '')
                .replace(/\t/g, ' ')
                .split(/\r?\n/)
                .filter(line => line.trim() !== '');
            const root = [];
            const stack = [];

            lines.forEach(line => {
                const indent = (line.match(/^ */) || [''])[0].length;
                const depth = this.parseSpace ? Math.min(indent, stack.length) : 0;
                const content = line.trim();
                const node = {};
                node[this.labelKey] = content;
                node[this.valueKey] = content;

                while (stack.length > depth) {
                    stack.pop();
                }

                if (depth === 0 || !stack[depth - 1]) {
                    root.push(node);
                } else {
                    const parent = stack[depth - 1];
                    if (!Array.isArray(parent[this.childrenKey])) {
                        parent[this.childrenKey] = [];
                    }
                    parent[this.childrenKey].push(node);
                }

                stack[depth] = node;
                stack.length = depth + 1;
            });

            return root;
        },
    },
});
</script>
