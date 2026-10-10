import { parseBpmnXml } from '/home/z/my-project/workflow_lowcode/backend-node/src/engine/process/compiler/bpmn-parser'

const KEY = 'leave_e2e76'
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" targetNamespace="e2e76">
  <bpmn:process id="${KEY}" name="e2e76-scope-verify" isExecutable="true">
    <bpmn:startEvent id="startEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Activity_1sqzo4c" wf:nodeRole="approver">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="endEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="startEvent_1" targetRef="Activity_1sqzo4c" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1sqzo4c" targetRef="endEvent_1" />
  </bpmn:process>
</bpmn:definitions>`

const p = parseBpmnXml(xml)
console.log('nodes:', p.nodes.map((n) => `${n.nodeId}(${n.nodeType}) in=${JSON.stringify(n.incoming)} out=${JSON.stringify(n.outgoing)}`))
console.log('flows:', p.flows)
