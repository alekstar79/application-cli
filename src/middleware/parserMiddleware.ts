import { ColorData, CommandContext, MiddlewareHandler } from '@/types'
import { Parser } from './parser/Parser'

export function parserMiddleware(): MiddlewareHandler {
  return async (context: CommandContext, next: () => Promise<void>) => {
    const { rawDatasets, logger } = context

    if (!rawDatasets || Object.keys(rawDatasets).length === 0) {
      logger.warn('📂 No raw datasets')
      context.parsedDatasets = {}
      return next()
    }

    context.parsedDatasets = {} as Record<string, ColorData[]>
    context.parseMetadata = {} as Record<string, any>
    const parser = new Parser()

    for (const [path, rawData] of Object.entries(rawDatasets)) {
      if (!rawData) continue

      try {
        logger.info(`🔍 Parsing ${path}...`)
        const result = await parser.parseDataset(rawData)

        context.parsedDatasets[path] = result.colors
        context.parseMetadata[path] = {
          format: result.format,
          confidence: result.confidence,
          colorsCount: result.colors.length
        }

        logger.success(`  ✅ ${path}: ${result.colors.length} colors (${result.format})`)
      } catch (error: any) {
        logger.error(`  ❌ ${path}: ${error.message}`)
        context.parsedDatasets[path] = []
      }
    }

    await next()
  }
}
