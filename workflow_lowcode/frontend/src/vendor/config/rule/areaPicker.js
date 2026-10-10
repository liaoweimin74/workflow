import uniqueId from '@form-create/utils/lib/unique';
import {localeProps} from '../../utils/index';

// 地址（省市区三级联动）——Task 3-a
// 组件本体：src/components/business/AreaPicker.vue（需在 main.ts 以
// FcDesigner.component('areaPicker', AreaPicker) 注册后本规则方可渲染）
// 值语义：'省/市/区' 拼接文本直存 VARCHAR

const label = '地址';
const name = 'areaPicker';

export default {
    menu: 'main',
    icon: 'icon-address',
    label,
    name,
    input: true,
    event: ['change', 'blur', 'focus', 'visibleChange'],
    validate: ['string'],
    rule({t}) {
        return {
            type: name,
            field: uniqueId(),
            title: t('com.areaPicker.name') || label,
            info: '',
            $required: false,
            props: {
                placeholder: '请选择省/市/区',
                clearable: true,
                showAllLevels: true,
            }
        };
    },
    props(_, {t}) {
        return localeProps(t, name + '.props', [
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
            {
                type: 'switch',
                field: 'showAllLevels',
                value: true,
                title: '显示完整路径'
            },
        ]);
    }
};
