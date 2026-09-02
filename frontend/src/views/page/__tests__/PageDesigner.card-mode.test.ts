import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PageDesigner card data-source entry', () => {
  it('passes the active list mode instead of forcing table mode', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

    expect(source).toContain(':list-mode="currentPageListMode"')
    expect(source).toContain("designerRef.value?.activeRule?.type === 'page-list-cards' ? 'card' : 'table'")
    expect(source).not.toContain(':table-mode="true"')
  })
})
