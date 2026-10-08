/** SFC 编译冒烟：LogicFlowDesigner.vue 必须可被 @vue/compiler-sfc 完整编译 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/home/z/my-project/workflow_lowcode/frontend/package.json')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')

const file = '/home/z/my-project/workflow_lowcode/frontend/src/views/logicflow/LogicFlowDesigner.vue'
const source = readFileSync(file, 'utf-8')
const { descriptor, errors } = parse(source, { filename: file })
if (errors.length) {
  console.error('parse errors:', errors)
  process.exit(1)
}
let ok = true
try {
  const script = compileScript(descriptor, { id: 'lfd-check' })
  const tpl = compileTemplate({
    id: 'lfd-check',
    filename: file,
    source: descriptor.template.content,
    compilerOptions: { bindingMetadata: script.bindings },
  })
  if (tpl.errors?.length) {
    ok = false
    console.error('template errors:', tpl.errors)
  }
} catch (e) {
  ok = false
  console.error('compile failed:', e.message)
}
console.log(ok ? 'SFC compile: OK (200)' : 'SFC compile: FAILED')
process.exit(ok ? 0 : 1)
