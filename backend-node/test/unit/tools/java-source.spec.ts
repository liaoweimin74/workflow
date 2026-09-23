import { describe, expect, it } from 'vitest'
import { extractPathParams, parseControllerSource } from '../../../tools/lib/java-source'

const SAMPLE = `
package com.workflow.api.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {
    @GetMapping
    public R<PageResult<TaskTodoVO>> list(@RequestParam(required = false) String assignee) {
        return null;
    }

    @PostMapping("/{id}/complete")
    public R<CompleteTaskResponse> complete(@PathVariable String id,
                                            @RequestBody CompleteTaskRequest request) {
        return null;
    }

    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable String id) { return null; }

    @PutMapping(value = "/{id}", method = RequestMethod.PUT)
    public R<Void> update(@PathVariable("id") Long id) { return null; }

    @RequestMapping(value = "/legacy", method = RequestMethod.POST)
    public R<Void> legacy(@RequestBody Map<String, Object> body) { return null; }
}
`

describe('parseControllerSource', () => {
  const endpoints = parseControllerSource('TaskController.java', SAMPLE)

  it('抽取到全部 5 个端点', () => {
    expect(endpoints).toHaveLength(5)
  })

  it('拼接类级与方法级路径，HTTP 方法正确', () => {
    // 注意 sort() 是字典序：'{' (0x7B) 排在字母之后，故 legacy 在 {id} 之前
    expect(endpoints.map((e) => `${e.httpMethod} ${e.fullPath}`).sort()).toEqual([
      'DELETE /api/v1/tasks/{id}',
      'GET /api/v1/tasks',
      'POST /api/v1/tasks/legacy',
      'POST /api/v1/tasks/{id}/complete',
      'PUT /api/v1/tasks/{id}',
    ])
  })

  it('@RequestMapping(method = RequestMethod.POST) 形式也能识别方法', () => {
    const legacy = endpoints.find((e) => e.fullPath.endsWith('/legacy'))!
    expect(legacy.httpMethod).toBe('POST')
  })

  it('pathParams 从路径模板 {var} 推导', () => {
    expect(endpoints.find((e) => e.httpMethod === 'POST' && e.fullPath.includes('complete'))!.pathParams).toEqual(['id'])
    expect(endpoints.find((e) => e.httpMethod === 'DELETE')!.pathParams).toEqual(['id'])
    expect(endpoints.find((e) => e.httpMethod === 'GET')!.pathParams).toEqual([])
  })

  it('识别方法名', () => {
    expect(endpoints.every((e) => e.methodName.length > 0)).toBe(true)
    expect(endpoints.map((e) => e.methodName).sort()).toEqual([
      'complete',
      'legacy',
      'list',
      'remove',
      'update',
    ])
  })

  it('识别是否有 @RequestBody（只看参数列表，不看方法体）', () => {
    expect(endpoints.find((e) => e.methodName === 'complete')!.hasRequestBody).toBe(true)
    expect(endpoints.find((e) => e.methodName === 'legacy')!.hasRequestBody).toBe(true)
    expect(endpoints.find((e) => e.methodName === 'list')!.hasRequestBody).toBe(false)
    expect(endpoints.find((e) => e.methodName === 'remove')!.hasRequestBody).toBe(false)
  })

  it('类级路径末尾斜杠不会产生双斜杠', () => {
    const src = SAMPLE.replace('"/api/v1/tasks"', '"/api/v1/tasks/"')
    const eps = parseControllerSource('TaskController.java', src)
    expect(eps.every((e) => !e.fullPath.includes('//'))).toBe(true)
  })

  it('无类级 @RequestMapping 时方法路径即完整路径', () => {
    const src = 'public class X { @GetMapping("/ping") public void p() {} }'
    expect(parseControllerSource('X.java', src)[0].fullPath).toBe('/ping')
  })

  it('类级注解不会与方法级注解混淆', () => {
    // 类级 @RequestMapping 带 method 属性时也不应产生一个多余端点
    const src = `
@RequestMapping(value = "/api/y", method = RequestMethod.GET)
public class Y {
  @GetMapping("/z")
  public void z() {}
}
`
    const eps = parseControllerSource('Y.java', src)
    expect(eps).toHaveLength(1)
    expect(eps[0].fullPath).toBe('/api/y/z')
  })
})

describe('extractPathParams', () => {
  it('单个变量', () => {
    expect(extractPathParams('/api/x/{id}')).toEqual(['id'])
  })

  it('多个变量按出现顺序', () => {
    expect(extractPathParams('/api/{a}/x/{b}')).toEqual(['a', 'b'])
  })

  it('无变量返回空数组', () => {
    expect(extractPathParams('/api/x')).toEqual([])
  })
})
