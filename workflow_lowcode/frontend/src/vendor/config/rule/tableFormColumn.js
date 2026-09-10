import {localeProps, localeOptions} from '../../utils';

const name = 'tableFormColumn';

export default {
    icon: 'icon-cell',
    name,
    aide: true,
    drag: true,
    dragBtn: false,
    mask: false,
    style: false,
    rule({t}) {
        return {
            type: name,
            props: {
                label: t('com.tableFormColumn.label'),
                width: 'auto',
            },
            children: [],
        };
    },
    props(_, {t}) {
        return localeProps(t, name + '.props', [
            {
                type: 'input',
                field: 'label',
            },
            {
                type: 'select',
                field: 'align',
                options: localeOptions(t, [
                    {label: 'left', value: 'left'},
                    {label: 'center', value: 'center'},
                    {
                        label: 'right',
                        value: 'right',
                    },
                ]),
            },
            {
                type: 'switch',
                field: 'required',
            },
            {
                type: 'input',
                field: 'width',
            },
            {
                type: 'ColorInput',
                field: 'color',
            },
            // ===== 新增：格式化器 =====
            {
                type: 'select',
                field: 'formatter',
                title: '格式化器',
                props: {clearable: true, placeholder: '无'},
                options: [
                    {label: '货币', value: 'currency'},
                    {label: '日期', value: 'date'},
                    {label: '日期时间', value: 'datetime'},
                    {label: '布尔', value: 'boolean'},
                    {label: '枚举', value: 'enum'},
                ],
            },
            // ===== 新增：固定列 =====
            {
                type: 'select',
                field: 'fixed',
                title: '固定列',
                props: {clearable: true, placeholder: '无'},
                options: [
                    {label: '左侧', value: 'left'},
                    {label: '右侧', value: 'right'},
                ],
            },
        ]);
    },
};
