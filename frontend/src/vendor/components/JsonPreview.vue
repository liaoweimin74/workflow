<template>
    <el-container class="_fc-json-preview">
        <el-header height="40px" class="_fc-l-tabs">
            <div class="_fc-l-tab"
                 :class="{active: active==='rule'}"
                 @click="active='rule'"> {{ t('designer.json') }}
            </div>
            <div class="_fc-l-tab"
                 :class="{active: active==='options'}"
                 @click="active='options'"> {{ t('designer.form') }}
            </div>
            <div class="_fc-json-preview-down">
                <el-tooltip effect="dark" :content="t('props.export')" placement="top" :hide-after="0">
                    <i class="fc-icon icon-download" @click="downloadJson"></i>
                </el-tooltip>
            </div>
        </el-header>
        <el-main style="padding: 8px;">
            <StructEditor ref="editor" v-model="value" @blur="handleBlur" @focus="handleFocus" format
                          style="height:100%;"></StructEditor>
        </el-main>
    </el-container>
</template>

<script>
import {defineComponent} from 'vue';
import StructEditor from './StructEditor.vue';
import {designerForm} from '../utils/form';

export default defineComponent({
    name: 'JsonPreview',
    components: {StructEditor},
    inject: ['designer'],
    data() {
        return {
            active: 'rule',
            value: this.designer.setupState.getRule(),
            oldValue: '',
        }
    },
    watch: {
        active() {
            this.updateValue();
        }
    },
    computed: {
        change() {
            if (this.active === 'rule') {
                return this.designer.setupState.children;
            } else {
                return this.designer.setupState.formOptions;
            }
        },
        t() {
            return this.designer.setupState.t;
        },
    },
    methods: {
        updateValue() {
            if (this.active === 'rule') {
                this.value = this.designer.setupState.getRule();
            } else {
                this.value = this.designer.setupState.getOptions();
            }
        },
        handleFocus() {
            this.oldValue = designerForm.toJson(this.value);
        },
        handleBlur() {
            let str;
            if (this.$refs.editor.save() && (str = designerForm.toJson(this.value)) !== this.oldValue) {
                if (this.active === 'rule') {
                    this.designer.setupState.setRule(this.value ? str : []);
                } else {
                    this.designer.setupState.setOptions(this.value || {});
                }
            }
        },
        downloadJson() {
            const data = {
                rule: this.designer.setupState.getRule(),
                options: this.designer.setupState.getOptions(),
            };
            const str = designerForm.toJson(data);
            const blob = new Blob([str], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fc-json-${Date.now()}.json`;
            link.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 0);
        }
    },
    mounted() {
        this.$watch(() => this.change, () => {
            this.updateValue();
        }, {deep: true});
    }
});
</script>

<style>
._fc-json-preview {
    display: flex;
    width: 100%;
    color: #262626;
}

._fc-json-preview-down {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    position: absolute;
    right: 8px;
    top: 0;
}

._fc-json-preview .icon-download {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 3px;
    color: #666666;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    opacity: 0.8;
}

._fc-json-preview .icon-download:hover {
    background: #f5f5f5;
    color: #262626;
    opacity: 1;
}

._fc-json-preview .CodeMirror {
    height: 100%;
    font-size: 12px;
}
</style>
