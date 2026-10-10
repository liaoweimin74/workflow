/**
 * 定位 LocationPicker（Task 3-g，降级版）——表单设计器「基础组件」分组 vendor rule。
 *
 * 与 signaturePad.js 同构（menu:'main' + input + mask）；降级实现不依赖外部地图 SDK：
 * 经纬度数值录入（纬度 -90~90 / 经度 -180~180，精度 6 位）+ 粘贴解析 +
 * 「清空」按钮 + 格式化预览；值形态为 'lat,lng' 字符串或空串（VARCHAR 列直存）。
 * - props 面板：placeholder 已内建（粘贴框固定提示，无需配置）、disabled / clearable 开关
 * - 各 prop 的 title 内联中文，不依赖 locale 新增词条（localeProps 找不到
 *   com.LocationPicker.props.* 时回退 title；主会话后续如补 locale 词条会自动覆盖）
 *
 * 【接线点（由主会话统一执行，本文件不自行注册）】
 * 1. src/vendor/config/index.js：import locationPicker from './rule/locationPicker'，并加入 ruleList
 * 2. src/main.ts：import LocationPicker from '@/components/business/LocationPicker.vue' +
 *    FcDesigner.component('LocationPicker', LocationPicker)（设计器画布 + 运行时渲染双实例可见）
 * 3. rule.type 'LocationPicker' 与组件注册名一致，画布/运行态按该名解析组件
 */
import uniqueId from '@form-create/utils/lib/unique';
import { localeProps } from '../../utils';

const label = '定位';
const name = 'LocationPicker';

export default {
    menu: 'main',
    icon: 'icon-location',
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
            info: '录入或粘贴经纬度（降级版，无地图选点）；值格式「纬度,经度」',
            $required: false,
            props: {
                disabled: false,
                clearable: true,
            },
        };
    },
    props(_, { t }) {
        return localeProps(t, name + '.props', [
            {
                type: 'switch',
                field: 'disabled',
                title: '禁用',
            },
            {
                type: 'switch',
                field: 'clearable',
                title: '显示清空按钮',
            },
        ]);
    },
};
