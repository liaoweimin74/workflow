import { describe, it, expect } from 'vitest'
import wfModdle from '../wf-moddle.json'
import { customRendererModule } from '../customRenderer'

describe('wf-moddle.json', () => {
  it('should have correct name', () => {
    expect(wfModdle.name).toBe('Workflow')
  })

  it('should have correct uri', () => {
    expect(wfModdle.uri).toBe('http://workflow.com/schema/bpmn/wf')
  })

  it('should have correct prefix', () => {
    expect(wfModdle.prefix).toBe('wf')
  })

  it('should have xml tagAlias lowerCase', () => {
    expect(wfModdle.xml).toEqual({ tagAlias: 'lowerCase' })
  })

  it('should have empty associations array', () => {
    expect(wfModdle.associations).toEqual([])
  })

  it('should define exactly one type', () => {
    expect(wfModdle.types).toHaveLength(1)
  })

  it('should define InitiatorNodeAttributed extending bpmn:UserTask', () => {
    const type = wfModdle.types[0]
    expect(type.name).toBe('InitiatorNodeAttributed')
    expect(type.extends).toEqual(['bpmn:UserTask'])
  })

  it('should add nodeRole attribute as String', () => {
    const type = wfModdle.types[0]
    expect(type.properties).toHaveLength(1)
    const prop = type.properties[0]
    expect(prop.name).toBe('nodeRole')
    expect(prop.isAttr).toBe(true)
    expect(prop.type).toBe('String')
  })
})

describe('customRendererModule', () => {
  it('should export a DI module with __init__ and customRenderer', () => {
    expect(customRendererModule).toBeDefined()
    expect(customRendererModule.__init__).toEqual(['customRenderer'])
    expect(customRendererModule.customRenderer).toBeDefined()
    expect(customRendererModule.customRenderer[0]).toBe('type')
    expect(typeof customRendererModule.customRenderer[1]).toBe('function')
  })

  it('CustomRenderer should have $inject for DI', () => {
    const CustomRenderer = customRendererModule.customRenderer[1] as any
    expect(CustomRenderer.$inject).toEqual(['eventBus', 'bpmnRenderer', 'styles'])
  })
})
