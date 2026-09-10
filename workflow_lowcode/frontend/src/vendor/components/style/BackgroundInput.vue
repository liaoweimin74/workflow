<template>
    <ConfigItem :label="t('style.background.name')">
        <ColorInput v-model="backgroundColor" @change="onInput"></ColorInput>
        <template #append>
            <div class="_fd-background-input">
                <el-form label-width="50px" label-position="top" inline size="small">
                    <el-form-item :label="t('style.background.image')" class="_fd-bg-image-item">
                        <el-input
                            v-model="backgroundImageUrl"
                            clearable
                            @change="onImageUrlChange"
                            @keydown.enter="onImageUrlChange"
                            :placeholder="t('style.background.placeholder')"
                        >
                            <template #append>
                                <div style="cursor: pointer" @click="handleImageInput"><i class="fc-icon icon-image"></i></div>
                            </template>
                        </el-input>
                    </el-form-item>
                    <div class="_fd-bg-size-repeat-row">
                        <el-form-item :label="t('style.background.size.name')" class="_fd-bg-size-item">
                            <el-select v-model="sizeSelectValue" clearable @change="onSizeSelectChange" style="width: 100%">
                                <el-option v-for="item in sizeType" :key="item.value" :label="item.label" :value="item.value" />
                            </el-select>
                            <div class="_fd-bg-size-custom" v-if="sizeSelectValue === 'custom'">
                                <SizeInput v-model="backgroundSizeX" @change="onSizeChange" />
                                <span style="margin: 0 5px">×</span>
                                <SizeInput v-model="backgroundSizeY" @change="onSizeChange" />
                            </div>
                        </el-form-item>
                        <el-form-item :label="t('style.background.repeat.name')" class="_fd-bg-repeat-item">
                            <el-select v-model="backgroundStyle.backgroundRepeat" clearable @change="onInput" style="width: 100%">
                                <el-option v-for="item in repeatType" :key="item.value" :label="item.label" :value="item.value" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <el-form-item :label="t('style.background.position')" class="_fd-bg-position-item">
                        <div class="_fd-bg-position">
                            <SizeInput v-model="backgroundPositionX" @change="onPositionChange" />
                            <SizeInput v-model="backgroundPositionY" @change="onPositionChange" />
                        </div>
                    </el-form-item>
                </el-form>
            </div>
        </template>
    </ConfigItem>
</template>

<script>
import { defineComponent } from 'vue';
import SizeInput from './SizeInput.vue';
import ConfigItem from './ConfigItem.vue';
import ColorInput from './ColorInput.vue';

export default defineComponent({
    name: 'BackgroundInput',
    components: { SizeInput, ConfigItem, ColorInput },
    inject: ['designer'],
    emits: ['update:modelValue', 'change'],
    props: {
        modelValue: {
            type: Object,
            default: () => ({}),
        },
    },
    watch: {
        modelValue() {
            this.tidyValue();
        },
    },
    computed: {
        t() {
            return this.designer.setupState.t;
        },
        sizeType() {
            const size = this.t('style.background.size') || {};
            return [
                { label: size.cover || 'cover', value: 'cover' },
                { label: size.contain || 'contain', value: 'contain' },
                { label: size.auto || 'auto', value: 'auto' },
            ];
        },
        repeatType() {
            const repeat = this.t('style.background.repeat') || {};
            return ['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'round', 'space'].map(v => {
                return { label: repeat[v] || v, value: v };
            });
        },
    },
    data() {
        return {
            backgroundColor: '',
            backgroundImageUrl: '',
            backgroundStyle: {
                backgroundImage: '',
                backgroundSize: '',
                backgroundPosition: '',
                backgroundRepeat: '',
            },
            backgroundSizeX: '',
            backgroundSizeY: '',
            backgroundPositionX: '',
            backgroundPositionY: '',
            sizeSelectValue: '',
        };
    },
    methods: {
        tidyValue() {
            const value = this.modelValue || {};
            this.backgroundColor = value.backgroundColor || '';

            // 解析 backgroundImage，提取url()中的内容
            const bgImage = value.backgroundImage || '';
            if (bgImage) {
                const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                this.backgroundImageUrl = match ? match[1] : bgImage;
            } else {
                this.backgroundImageUrl = '';
            }

            this.backgroundStyle = {
                backgroundImage: bgImage,
                backgroundSize: value.backgroundSize || '',
                backgroundPosition: value.backgroundPosition || '',
                backgroundRepeat: value.backgroundRepeat || '',
            };

            // 解析 backgroundSize
            this.parseBackgroundSize(value.backgroundSize);

            // 解析 backgroundPosition
            this.parseBackgroundPosition(value.backgroundPosition);
        },
        parseBackgroundSize(size) {
            if (!size) {
                this.sizeSelectValue = '';
                this.backgroundSizeX = '';
                this.backgroundSizeY = '';
                return;
            }
            if (size === 'cover' || size === 'contain' || size === 'auto') {
                this.sizeSelectValue = size;
                this.backgroundSizeX = '';
                this.backgroundSizeY = '';
                return;
            }
            // 自定义尺寸
            const parts = size.split(/\s+/);
            this.backgroundSizeX = parts[0] || '';
            this.backgroundSizeY = parts[1] || '';
            this.sizeSelectValue = 'custom';
        },
        parseBackgroundPosition(position) {
            if (!position) {
                this.backgroundPositionX = '';
                this.backgroundPositionY = '';
                return;
            }
            const parts = position.split(/\s+/);
            this.backgroundPositionX = parts[0] || '';
            this.backgroundPositionY = parts[1] || '';
        },
        onSizeSelectChange(value) {
            if (!value) {
                this.backgroundStyle.backgroundSize = '';
                this.backgroundSizeX = '';
                this.backgroundSizeY = '';
            } else if (value === 'custom') {
                // 切换到自定义模式，保持当前值或使用默认值
                if (this.backgroundSizeX || this.backgroundSizeY) {
                    const size = [this.backgroundSizeX || 'auto', this.backgroundSizeY || 'auto'].join(' ');
                    this.backgroundStyle.backgroundSize = size;
                } else {
                    this.backgroundStyle.backgroundSize = '';
                }
            } else {
                // 预设值
                this.backgroundStyle.backgroundSize = value;
                this.backgroundSizeX = '';
                this.backgroundSizeY = '';
            }
            this.onInput();
        },
        onSizeChange() {
            if (this.backgroundSizeX || this.backgroundSizeY) {
                const size = [this.backgroundSizeX || 'auto', this.backgroundSizeY || 'auto'].join(' ');
                this.backgroundStyle.backgroundSize = size;
            } else {
                this.backgroundStyle.backgroundSize = '';
            }
            this.onInput();
        },
        onPositionChange() {
            if (this.backgroundPositionX || this.backgroundPositionY) {
                const position = [this.backgroundPositionX || '0', this.backgroundPositionY || '0'].join(' ');
                this.backgroundStyle.backgroundPosition = position;
            } else {
                this.backgroundStyle.backgroundPosition = '';
            }
            this.onInput();
        },
        onImageUrlChange() {
            if (this.backgroundImageUrl) {
                this.backgroundStyle.backgroundImage = `url(${this.backgroundImageUrl})`;
            } else {
                this.backgroundStyle.backgroundImage = '';
            }
            this.onInput();
        },
        handleImageInput() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = event => {
                        this.backgroundImageUrl = event.target.result;
                        this.backgroundStyle.backgroundImage = `url(${event.target.result})`;
                        this.onInput();
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        },
        onInput() {
            const style = {
                backgroundColor: this.backgroundColor || '',
                ...Object.keys(this.backgroundStyle).reduce((acc, key) => {
                    if (this.backgroundStyle[key] !== '') {
                        acc[key] = this.backgroundStyle[key];
                    }
                    return acc;
                }, {}),
            };
            // 移除空值
            Object.keys(style).forEach(k => {
                if (style[k] === '') {
                    delete style[k];
                }
            });
            this.$emit('update:modelValue', style);
            this.$emit('change', style);
        },
    },
    created() {
        this.tidyValue();
    },
});
</script>

<style>
._fd-background-input {
    display: flex;
    justify-content: center;
    padding: 0 5px;
}

._fd-background-input .el-form {
    display: flex;
    flex-direction: column;
    width: 100%;
}

._fd-background-input .el-input-group__append {
    padding: 0;
    width: 24px;
}

._fd-bg-image-item {
    width: 100%;
}

._fd-bg-size-repeat-row {
    display: flex;
    width: 100%;
    gap: 10px;
}

._fd-bg-size-item,
._fd-bg-repeat-item {
    flex: 1;
}

._fd-bg-position-item {
    width: 100%;
}

._fd-background-input .el-form--inline .el-form-item {
    margin: 0;
    padding: 0;
}

._fd-background-input ._fd-size-input .el-input-number--small {
    width: 100%;
}

._fd-bg-size-custom {
    display: flex;
    align-items: center;
    margin-top: 5px;
}

._fd-bg-position {
    display: flex;
    align-items: center;
    gap: 5px;
}

._fd-bg-position ._fd-size-input {
    flex: 1;
}
</style>
