import uniqueId from '@form-create/utils/lib/unique';
import {localeProps} from '../../utils/index';

// 字典下拉——Task 3-a
// 组件本体：src/components/business/DictSelect.vue（需在 main.ts 以
// FcDesigner.component('dictSelect', DictSelect) 注册后本规则方可渲染）
// 选项来自系统字典 GET /dict-data/{dictCode}（api/dict.ts），设计器仅配置 dictTypeCode

const label = '字典下拉';
const name = 'dictSelect';

export default {
    menu: 'main',
    icon: 'icon-data-select',
    label,
    name,
    input: true,
    event: ['change', 'visibleChange', 'removeTag', 'clear', 'blur', 'focus'],
    validate: ['string', 'array'],
    rule({t}) {
        return {
            type: name,
            field: uniqueId(),
            title: t('com.dictSelect.name') || label,
            info: '',
            $required: false,
            props: {
                dictTypeCode: '',
                placeholder: '请选择',
                clearable: true,
            }
        };
    },
    // 多选切换会改变值形态（string ⇄ array），复用 select.js 的 key 重渲染策略
    watch: {
        multiple({rule}) {
            rule.key = uniqueId();
        }
    },
    props(_, {t}) {
        return localeProps(t, name + '.props', [
            {
                type: 'input',
                field: 'dictTypeCode',
                title: '字典编码',
                info: '字典管理中的分类编码（dictCode），如 gender'
            },
            {
                type: 'switch',
                field: 'multiple',
                title: '多选'
            },
            {
                type: 'input',
                field: 'placeholder',
                title: '占位提示'
            },
            {
                type: 'select',
                field: 'size',
                value: 'default',
                title: '尺寸',
                options: [
                    {label: 'large', value: 'large'},
                    {label: 'default', value: 'default'},
                    {label: 'small', value: 'small'},
                ]
            },
            {
                type: 'switch',
                field: 'disabled',
                title: '禁用'
            },
            {
                type: 'switch',
                field: 'clearable',
                value: true,
                title: '可清空'
            },
        ]);
    }
};
