import { localeProps } from '../../utils'
import uniqueId from '@form-create/utils/lib/unique'

const label = '数据表单容器'
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
      },
      children: [],
    }
  },
  props(_, { t }) {
    return localeProps(t, name + '.props', [
      { type: 'select', field: 'dataSourceId', options: [] },
      { type: 'json', field: 'recordLocator' },
    ])
  },
}
