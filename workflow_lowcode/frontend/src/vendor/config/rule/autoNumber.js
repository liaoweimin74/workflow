/**
 * 自动编号（Task 3-c）——表单设计器「系统组件」分组 vendor rule。
 *
 * 与 signaturePad.js 同构；差异点：
 * - menu 用 'system'：自动编号是平台生成特性（编号由后端在提交时生成写入），归入系统组件分组
 * - props 面板：prefix 输入框 / dateFormat 下拉 / resetPolicy 下拉 / seqDigits 数字输入 / placeholder
 * - 各 prop 的 title 内联中文，不依赖 locale 新增词条（localeProps 找不到 com.AutoNumber.props.*
 *   时回退 title；主会话后续如补 locale 词条会自动覆盖）
 *
 * 【接线点（由主会话统一执行，本文件不自行注册）】
 * 1. src/vendor/config/index.js：import autoNumber from './rule/autoNumber'，并加入 ruleList
 * 2. src/main.ts：import AutoNumber from '@/components/business/AutoNumber.vue' +
 *    FcDesigner.component('AutoNumber', AutoNumber)（设计器画布 + 运行时渲染双实例可见）
 * 3. rule.type 'AutoNumber' 与组件注册名一致，画布/运行态按该名解析组件
 *
 * 【值契约】编号 = prefix + 日期段(dateFormat) + 流水号补零 seqDigits 位；resetPolicy 决定归零粒度。
 * 值永远由后端生成写入，前端绝不自行生成（详见 src/components/business/autoNumberFormat.ts 头注释）。
 */
import uniqueId from '@form-create/utils/lib/unique';
import { localeProps } from '../../utils';

const label = '自动编号';
const name = 'AutoNumber';

export default {
    menu: 'system',
    icon: 'icon-number',
    label: label,
    name: name,
    input: true,
    mask: true,
    event: ['change'],
    rule() {
        return {
            type: name,
            field: uniqueId(),
            title: label,
            info: '编号在提交后由后端自动生成（前缀 + 日期 + 流水号），填写态只读',
            $required: false,
            props: {
                prefix: 'BN',
                dateFormat: 'yyyyMMdd',
                resetPolicy: 'day',
                seqDigits: 4,
                placeholder: '',
            },
        };
    },
    props(_, { t }) {
        return localeProps(t, name + '.props', [
            {
                type: 'input',
                field: 'prefix',
                title: '前缀',
            },
            {
                type: 'select',
                field: 'dateFormat',
                title: '日期格式',
                options: [
                    { label: '年（yyyy）', value: 'yyyy' },
                    { label: '年月（yyyyMM）', value: 'yyyyMM' },
                    { label: '年月日（yyyyMMdd）', value: 'yyyyMMdd' },
                    { label: '年月日时（yyyyMMddHH）', value: 'yyyyMMddHH' },
                ],
            },
            {
                type: 'select',
                field: 'resetPolicy',
                title: '流水号重置周期',
                info: '流水号在周期内自增、跨周期归 1；永不重置为全局递增',
                options: [
                    { label: '按天', value: 'day' },
                    { label: '按月', value: 'month' },
                    { label: '按年', value: 'year' },
                    { label: '永不重置', value: 'never' },
                ],
            },
            {
                type: 'inputNumber',
                field: 'seqDigits',
                title: '流水号位数',
                props: { min: 1, max: 10, precision: 0 },
            },
            {
                type: 'input',
                field: 'placeholder',
                title: '占位提示',
            },
        ]);
    },
};
