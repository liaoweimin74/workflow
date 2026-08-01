import type { Element } from 'bpmn-js/lib/model/Types'

export function getNodeName(element: Element | undefined): string {
  if (!element || !element.businessObject) return ''
  return (element.businessObject.get('name') as string) || ''
}

export function setNodeName(element: Element | undefined, name: string): void {
  if (!element || !element.businessObject) return
  const modeling = element.businessObject.$model
  modeling?.setProperty(element.businessObject, 'name', name)
}

export function getNodeType(element: Element | undefined): string {
  if (!element) return 'unknown'
  const type = element.type || ''
  const parts = type.split(':')
  return parts.length > 1 ? parts[1] : type
}

export function getDocumentation(element: Element | undefined): string {
  if (!element || !element.businessObject) return ''
  const docs = element.businessObject.get('documentation')
  if (Array.isArray(docs) && docs.length > 0) {
    return docs[0].text || ''
  }
  return ''
}

export function setDocumentation(element: Element | undefined, text: string, modeler: any): void {
  if (!element || !element.businessObject) return
  const moddle = modeler.get('moddle')
  const doc = moddle.create('bpmn:Documentation', { text })
  const modeling = modeler.get('modeling')
  modeling?.updateProperties(element, { documentation: [doc] })
}

export function getFlowableProperty(element: Element | undefined, propertyName: string): string {
  if (!element || !element.businessObject) return ''
  return (element.businessObject.get(propertyName) as string) || ''
}

export function setFlowableProperty(
  element: Element | undefined,
  propertyName: string,
  value: string,
  modeler: any
): void {
  if (!element || !element.businessObject) return
  const modeling = modeler.get('modeling')
  modeling?.updateProperties(element, { [propertyName]: value })
}

export function getConditionExpression(element: Element | undefined): string {
  if (!element || !element.businessObject) return ''
  const cond = element.businessObject.get('conditionExpression')
  if (cond && typeof cond === 'object') {
    return cond.body || ''
  }
  if (typeof cond === 'string') return cond
  return ''
}

export function setConditionExpression(element: Element | undefined, expression: string, modeler: any): void {
  if (!element || !element.businessObject) return
  const moddle = modeler.get('moddle')
  const cond = moddle.create('bpmn:FormalExpression', { body: expression })
  const modeling = modeler.get('modeling')
  modeling?.updateProperties(element, { conditionExpression: cond })
}
