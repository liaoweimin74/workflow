import unique from '@form-create/utils/lib/unique';
import {getInjectArg, localeProps} from '../../utils';

const label = '表格表单';
const name = 'tableForm';

export default {
    menu: 'subform',
    icon: 'icon-table-form',
    label,
    name,
    mask: false,
    input: true,
    subForm: 'array',
    languageKey: ['add', 'operation', 'dataEmpty'],
    event: ['change', 'add', 'delete'],
    children: 'tableFormColumn',
    loadRule(rule) {
        if (!rule.props) rule.props = {};
        const columns = rule.props.columns || [];
        rule.children = columns.map(column => {
            return {
                type: 'tableFormColumn',
                _fc_drag_tag: 'tableFormColumn',
                props: {
                    label: column.label,
                    align: column.align,
                    required: column.required || false,
                    hidden: column.hidden || false,
                    width: column.style.width || '',
                    color: column.style.color || '',
                    formatter: column.formatter || '',
                    fixed: column.fixed || '',
                },
                children: column.rule || [],
            };
        });
        delete rule.props.columns;
    },
    parseRule(rule) {
        const children = rule.children || [];
        rule.props.columns = children.map(column => {
            return {
                label: column.props.label,
                required: column.props.required,
                hidden: column.hidden,
                align: column.props.align,
                style: {
                    width: column.props.width,
                    color: column.props.color,
                },
                formatter: column.props.formatter || '',
                fixed: column.props.fixed || '',
                rule: column.children || [],
            };
        });
        rule.children = [];
    },
    rule({t}) {
        return {
            type: name,
            field: unique(),
            title: t('com.tableForm.name'),
            info: '',
            props: {},
            children: [],
        };
    },
    props(_, {t}) {
        return localeProps(t, name + '.props', [
            {
                type: 'switch',
                field: 'disabled',
            },
            {
                type: 'switch',
                field: 'addable',
                value: true,
            },
            {
                type: 'switch',
                field: 'deletable',
                value: true,
            },
            {
                type: 'switch',
                field: 'showIndex',
                value: true,
            },
            {
                type: 'FnInput',
                field: 'beforeRemove',
                warning: t('com.tableForm.info'),
                props: {
                    body: true,
                    button: true,
                    fnx: true,
                    args: [getInjectArg(t)],
                    name: 'beforeRemove',
                },
            },
            {
                type: 'switch',
                field: 'filterEmptyColumn',
                value: true,
            },
            {
                type: 'inputNumber',
                field: 'min',
                props: {min: 0},
            },
            {
                type: 'inputNumber',
                field: 'max',
                props: {min: 0},
            },
            // ===== 新增：操作列宽度 =====
            {
                type: 'inputNumber',
                field: 'actionColumnWidth',
                title: '操作列宽度',
                value: 0,
                props: {min: 0, max: 400, step: 10, placeholder: '0=自动计算'},
            },
            // ===== 新增：新增按钮条件显示 =====
            {
                type: 'input',
                field: 'addVisible',
                title: '新增按钮条件',
                props: {placeholder: '如 $row.status === "PENDING"，留空始终显示'},
            },
            // ===== 新增：删除按钮条件显示 =====
            {
                type: 'input',
                field: 'deleteVisible',
                title: '删除按钮条件',
                props: {placeholder: '如 $row.status === "PENDING"，留空始终显示'},
            },
        ]);
    },
};
