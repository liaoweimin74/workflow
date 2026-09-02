import { describe, it, expect } from 'vitest'
import { mapOptionRecords, OptionDataSourceConfig, OptionMappingError } from '../option-datasource'

describe('mapOptionRecords', () => {
  it('returns empty array for null input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords(null, config)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords(undefined, config)).toEqual([])
  })

  it('returns empty array for non-array input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords({}, config)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords([], config)).toEqual([])
  })

  it('maps simple records with label and value fields', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [
      { id: 1, name: 'Option 1' },
      { id: 2, name: 'Option 2' },
      { id: 3, name: 'Option 3' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ label: 'Option 1', value: 1 })
    expect(result[1]).toEqual({ label: 'Option 2', value: 2 })
    expect(result[2]).toEqual({ label: 'Option 3', value: 3 })
  })

  it('maps string values correctly', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'displayName',
      valueField: 'key'
    }
    const records = [
      { key: 'a', displayName: 'Alpha' },
      { key: 'b', displayName: 'Beta' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toEqual([
      { label: 'Alpha', value: 'a' },
      { label: 'Beta', value: 'b' }
    ])
  })

  it('throws error when label field is missing', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [{ id: 1 }] // missing 'name' field
    expect(() => mapOptionRecords(records, config)).toThrow(OptionMappingError)
    expect(() => mapOptionRecords(records, config)).toThrow('Missing required label field: name')
  })

  it('throws error when value field is missing', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [{ name: 'Test' }] // missing 'id' field
    expect(() => mapOptionRecords(records, config)).toThrow(OptionMappingError)
    expect(() => mapOptionRecords(records, config)).toThrow('Missing required value field: id')
  })

  it('maps nested records with childrenField', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id',
      childrenField: 'subItems'
    }
    const records = [
      {
        id: 1,
        name: 'Parent',
        subItems: [
          { id: 'a', name: 'Child A' },
          { id: 'b', name: 'Child B' }
        ]
      }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children![0]).toEqual({ label: 'Child A', value: 'a' })
    expect(result[0].children![1]).toEqual({ label: 'Child B', value: 'b' })
  })

  it('filters out null records', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [
      { id: 1, name: 'Valid' },
      null,
      undefined,
      { id: 2, name: 'Also Valid' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(2)
  })
})
