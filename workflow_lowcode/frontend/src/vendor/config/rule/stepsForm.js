/**
 * 分步表单容器 StepsForm（Task 3-g）——表单设计器「布局组件」分组 vendor rule。
 *
 * 与 card.js（elCard）同构的布局容器（menu:'layout' + drag:true + mask:false）：
 * - 设计态 FcDesigner 把 rule.children 包进 DragBox 作为本组件默认插槽，可向内拖入任意组件；
 *   「每个直接子组件 = 一步」，推荐拖入卡片分组每步字段
 * - 运行态按 active 显隐 pane（v-show 常挂载），取值/校验不受分步影响
 * - props 面板：steps（JSON 数组，按索引对应步骤标题/描述）/ active / direction
 * - 各 prop 的 title 内联中文，不依赖 locale 新增词条（localeProps 找不到
 *   com.StepsForm.props.* 时回退 title；主会话后续如补 locale 词条会自动覆盖）
 *
 * 【接线点（由主会话统一执行，本文件不自行注册）】
 * 1. src/vendor/config/index.js：import stepsForm from './rule/stepsForm'，并加入 ruleList（layout 区）
 * 2. src/main.ts：import StepsForm from '@/components/business/StepsForm.vue' +
 *    FcDesigner.component('StepsForm', StepsForm)（设计器画布 + 运行时渲染双实例可见）
 * 3. rule.type 'StepsForm' 与组件注册名一致，画布/运行态按该名解析组件
 */
import { localeProps } from '../../utils';

const label = '分步表单';
const name = 'StepsForm';

export default {
    menu: 'layout',
    icon: 'icon-step-form',
    label: label,
    name: name,
    drag: true,
    inside: false,
    mask: false,
    event: ['change'],
    rule() {
        return {
            type: name,
            props: {
                steps: [],
                active: 0,
                direction: 'horizontal',
            },
            style: {
                width: '100%',
            },
            children: [],
        };
    },
    props(_, { t }) {
        return localeProps(t, name + '.props', [
            {
                // Struct：设计器内置 JSON 编辑器（designerForm.component('Struct')，同 base/field.js _control 用法）
                type: 'Struct',
                field: 'steps',
                title: '步骤配置',
                props: {
                    placeholder: '[{"title":"基本信息","description":"填写主体信息"}]',
                },
                info: 'JSON 数组，按索引对应步骤；留空按子组件数量生成「第 N 步」',
            },
            {
                type: 'inputNumber',
                field: 'active',
                title: '当前步骤',
                props: { min: 0, precision: 0 },
            },
            {
                type: 'select',
                field: 'direction',
                title: '步骤条方向',
                options: [
                    { label: '水平', value: 'horizontal' },
                    { label: '垂直', value: 'vertical' },
                ],
            },
        ]);
    },
};
