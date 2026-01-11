import { ASTStructure } from '@/types'

export class ASTDetector {
  detect(data: any): ASTStructure[] {
    if (data === null || data === undefined || !this.isIterable(data)) {
      return [{ type: 'unknown', confidence: 0, schema: {}, metadata: {} }]
    }

    const structures: ASTStructure[] = []

    if (this.isColorPaletteRecord(data)) {
      structures.push({
        type: 'color-palette',
        confidence: 0.98,
        schema: {
          structure: 'record<code-to-{name,hex}>',
          fields: { name: 'string', hex: 'string' }
        },
        metadata: {
          total: Object.keys(data).length,
          format: 'PANTONE-like'
        }
      })
    }

    if (this.isJsonObjectFormat(data)) {
      structures.push({
        type: 'json',
        confidence: 0.95,
        schema: { structure: 'id-to-color-object' },
        metadata: { entries: Object.keys(data).length }
      })
    }

    if (this.isHexStringPairs(data)) {
      structures.push({
        type: 'pairs',
        confidence: this.scoreHexStringPairs(data),
        schema: { items: ['hex|string', 'string|hex'] },
        metadata: { pairs: (data as any[]).length }
      })
    }

    if (this.isObjectEntries(data)) {
      structures.push({
        type: 'object',
        confidence: this.scoreObjectEntries(data),
        schema: this.inferObjectSchema(data),
        metadata: this.analyzeObjectKeys(data)
      })
    }

    if (this.isArrayOfObjects(data)) {
      structures.push({
        type: 'objects',
        confidence: this.scoreArrayOfObjects(data),
        schema: this.inferObjectArraySchema(data),
        metadata: { entries: (data as any[]).length }
      })
    }

    if (this.isStructuredFormat(data)) {
      structures.push({
        type: 'structured',
        confidence: this.scoreStructuredFormat(data),
        schema: this.inferStructuredSchema(data),
        metadata: this.analyzeStructuredCategories(data)
      })
    }

    return structures.sort((a, b) => b.confidence - a.confidence)
  }

  private isColorPaletteRecord(data: any): boolean {
    if (typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length) {
      return false
    }

    const values = Object.values(data) as Record<string, any>[]
    if (values.length === 0) return false

    const validColors = values.filter(sample =>
      typeof sample?.name === 'string' &&
      typeof sample?.hex === 'string' &&
      /^([0-9a-f]{6})$/i.test(sample.hex)
    )

    return validColors.length / values.length >= 0.8
  }

  private isJsonObjectFormat(data: any): boolean {
    if (typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length) {
      return false
    }

    const values = Object.values(data) as Record<string, any>[]

    return values.length > 0 && values.every(sample =>
      typeof sample === 'object' && !Array.isArray(sample) &&
      typeof sample.name === 'string' &&
      typeof sample.hex === 'string' &&
      sample.name.length > 0 &&
      /^([0-9a-f]{6})$/i.test(sample.hex)
    )
  }

  private isIterable(data: any): boolean {
    return Array.isArray(data) ||
      (data && typeof data[Symbol.iterator] === 'function') ||
      (typeof data === 'object' && data !== null && !Array.isArray(data))
  }

  private isHexStringPairs(data: any): boolean {
    return Array.isArray(data) && data.every((item: any) => {
      if (!Array.isArray(item) || item.length !== 2) return false

      const [a, b] = item
      const aIsHex = /^#?[0-9a-f]{3,8}$/i.test(String(a))
      const bIsHex = /^#?[0-9a-f]{3,8}$/i.test(String(b))
      const aIsString = typeof a === 'string'
      const bIsString = typeof b === 'string'

      return (aIsHex && bIsString) || (aIsString && bIsHex)
    })
  }

  private scoreHexStringPairs(data: any[]): number {
    let hexCount = 0, total = data.length

    data.forEach((item: any) => {
      const [a, b] = item

      if (/^#?[0-9a-f]{6,8}$/i.test(String(a)) || /^#?[0-9a-f]{6,8}$/i.test(String(b))) {
        hexCount++
      }
    })

    return 0.8 + (hexCount / total) * 0.2
  }

  private isObjectEntries(data: any): boolean {
    return typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0 &&
      Object.entries(data).some(([key, value]: [string | number, any]) =>
        (/^#?[0-9a-f]{6,8}$/i.test(String(key)) && typeof value === 'string') ||
        (typeof key === 'string' && /^#?[0-9a-f]{6,8}$/i.test(String(value)))
      )
  }


  private scoreObjectEntries(data: any): number {
    const entries = Object.entries(data)

    const validPairs = entries.filter(([k, v]) =>
      (/^#?[0-9a-f]{6}$/i.test(String(k)) && typeof v === 'string') ||
      (typeof k === 'string' && /^#?[0-9a-f]{6}$/i.test(String(v)))
    )

    return validPairs.length / Math.max(1, entries.length)
  }

  private isArrayOfObjects(data: any): boolean {
    return Array.isArray(data) && data.length > 0 && data.every(
      (item: any) => typeof item === 'object' && !Array.isArray(item) &&
      ('hex' in item || 'name' in item)
    )
  }

  private scoreArrayOfObjects(data: any[]): number {
    if (!data.length) return 0

    const sample = data[0]
    let score = 0

    if ('hex' in sample) score += 0.4
    if ('name' in sample) score += 0.4
    if ('family' in sample || 'hsl' in sample) score += 0.2

    return Math.min(score, 1)
  }

  private inferObjectSchema(data: Record<string, any>): any {
    const keys = Object.keys(data)
    const values = Object.values(data)

    return {
      keyType: typeof keys[0],
      valueType: typeof values[0],
      keyPattern: keys.every(k => /^#?[0-9a-f]{6}$/i.test(k)) ? 'hex' : 'name',
      valuePattern: values.every(v => /^#?[0-9a-f]{6}$/i.test(String(v))) ? 'hex' : 'name'
    }
  }

  private analyzeObjectKeys(data: Record<string, any>): Record<string, any> {
    return {
      entries: Object.keys(data).length,
      hexKeys: Object.keys(data).filter(k => /^#?[0-9a-f]{6}$/i.test(k)).length,
      hexValues: Object.values(data).filter(v => /^#?[0-9a-f]{6}$/i.test(String(v))).length
    }
  }

  private inferObjectArraySchema(data: any[]): any {
    if (data.length === 0) return {}

    const sample = data[0]

    return Object.entries(sample)
      .reduce((acc, [key, value]) => {
        return { ...acc, [key]: typeof value }
      }, {} as Record<string, string>)
  }

  private isStructuredFormat(data: any): boolean {
    return typeof data === 'object' && !Array.isArray(data) && 'meta' in data &&
      Object.values(data).some((v: any) =>
        Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && (v[0].hex || v[0].color)
      )
  }

  private scoreStructuredFormat(data: any): number {
    const hasMeta = 'meta' in data ? 0.3 : 0
    const hasColorArrays = Object.values(data).filter((v: any) =>
      Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
    ).length

    return Math.min(hasMeta + hasColorArrays * 0.1, 1)
  }

  private inferStructuredSchema(data: any): any {
    const categories: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        categories[key] = typeof value[0] === 'object'
          ? 'array<object>'
          : typeof value[0]
      }
    }

    return { meta: 'object', categories }
  }

  private analyzeStructuredCategories(data: any): Record<string, any> {
    const meta = data.meta || {}

    const categories = Object.keys(data).filter(k => k !== 'meta')

    return {
      family: meta.family || 'unknown',
      categories,
      totalColors: categories.reduce((sum: number, cat: string) =>
        sum + (Array.isArray(data[cat]) ? (data[cat] as any[]).length : 0), 0
      )
    }
  }
}
