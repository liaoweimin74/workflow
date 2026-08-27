import { localeProps } from '../../utils'
import uniqueId from '@form-create/utils/lib/unique'

const label = '数据容器'
const name = 'formContainer'

export default {
  menu: 'subform',
  icon: 'icon-group',
  label,
  name,
  inside: false,
  drag: true,
  dragBtn: true,
  mask: false,
  input: true,
  subForm: 'object',
  event: ['change'],
  loadRule(rule) {
    rule.children = rule.props.rule || []
    rule.type = 'FcRow'
    delete rule.props.rule
  },
  parseRule(rule) {
    rule.props.rule = rule.children
    rule.type = 'formContainer'
    delete rule.children
  },
  rule() {
    return {
      type: 'fcRow',
      field: uniqueId(),
      title: label,
      info: '',
      $required: false,
      props: {
        dataSourceId: '',
        recordLocator: { type: 'current-record' },
        displayMode: 'dialog',
        dialogWidth: '800px',
        dialogHeight: '600px',
        tabTitle: '编辑记录',
        inlineHeight: 'auto',
      },
      children: [],
    }
  },
  props(_, { t }) {
    return localeProps(t, name + '.props', [
      { type: 'select', field: 'dataSourceId', options: [] },
      { type: 'json', field: 'recordLocator' },
      {
        type: 'select',
        field: 'displayMode',
        options: [
          { label: '弹出窗口', value: 'dialog' },
          { label: '新开页签', value: 'newTab' },
          { label: '页面内嵌', value: 'inline' },
        ],
      },
      { type: 'input', field: 'dialogWidth', props: { placeholder: '800px' } },
      { type: 'input', field: 'dialogHeight', props: { placeholder: '600px' } },
      { type: 'input', field: 'tabTitle', props: { placeholder: '编辑记录' } },
      { type: 'input', field: 'inlineHeight', props: { placeholder: 'auto' } },
    ])
  },
}
