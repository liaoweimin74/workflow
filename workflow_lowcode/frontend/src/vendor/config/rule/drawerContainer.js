/**
 * 抽屉容器 DrawerContainer（Task 3-g）——表单设计器「布局组件」分组 vendor rule。
 *
 * 与 card.js（elCard）同构的布局容器（menu:'layout' + drag:true + mask:false）：
 * - 设计态：按钮 + 平铺内容预览区（FcDesigner 把 children 包进 DragBox 作为默认插槽，
 *   直接向预览区拖入组件）；运行态：点击按钮打开 el-drawer，children 渲染在抽屉内容区
 * - props 面板：buttonText / buttonType / plain / title / size
 * - 各 prop 的 title 内联中文，不依赖 locale 新增词条（localeProps 找不到
 *   com.DrawerContainer.props.* 时回退 title；主会话后续如补 locale 词条会自动覆盖）
 *
 * 【接线点（由主会话统一执行，本文件不自行注册）】
 * 1. src/vendor/config/index.js：import drawerContainer from './rule/drawerContainer'，并加入 ruleList（layout 区）
 * 2. src/main.ts：import DrawerContainer from '@/components/business/DrawerContainer.vue' +
 *    FcDesigner.component('DrawerContainer', DrawerContainer)（设计器画布 + 运行时渲染双实例可见）
 * 3. rule.type 'DrawerContainer' 与组件注册名一致，画布/运行态按该名解析组件
 */
import { localeOptions, localeProps } from '../../utils';

const label = '抽屉容器';
const name = 'DrawerContainer';

export default {
    menu: 'layout',
    icon: 'icon-dialog',
    label: label,
    name: name,
    drag: true,
    inside: false,
    mask: false,
    event: ['open', 'close'],
    rule() {
        return {
            type: name,
            props: {
                buttonText: '展开详情',
                buttonType: 'primary',
                plain: true,
                title: '详情',
                size: '50%',
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
                type: 'input',
                field: 'buttonText',
                title: '按钮文案',
            },
            {
                type: 'select',
                field: 'buttonType',
                title: '按钮类型',
                options: localeOptions(t, [
                    { label: 'primary', value: 'primary' },
                    { label: 'success', value: 'success' },
                    { label: 'warning', value: 'warning' },
                    { label: 'danger', value: 'danger' },
                    { label: 'info', value: 'info' },
                ]),
            },
            {
                type: 'switch',
                field: 'plain',
                title: '朴素按钮',
            },
            {
                type: 'input',
                field: 'title',
                title: '抽屉标题',
            },
            {
                type: 'input',
                field: 'size',
                title: '抽屉尺寸',
                info: '宽度，如 50% 或 600px',
            },
        ]);
    },
};
