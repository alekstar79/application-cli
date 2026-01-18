import { ColorData, CommandContext, SortResult, SortStats } from '@/types'

import { Command } from '@/core/Command'
import { ProgressBar } from '@/utils/ProgressBar'
import { Logger } from '@/utils/Logger'

export class SortCommand extends Command {
  private comparisons: number = 0

  constructor() {
    super(
      'sort',
      '<dataset> <output>',
      'Sorting colors by family, name, hex, or hue (stable O(n log n))',
      (_args: string[], _options: Record<string, any>, _flags: string[], ctx: CommandContext) =>
        this.perform(ctx.parsedDatasets!, ctx.parseMetadata!, ctx), {
        allowUnknownOptions: false,
        strict: true,
        schema: {
          options: {},
          args: [
            { name: 'dataset', required: true, type: 'path'  },
            { name: 'output', required: true, type: 'output' }
          ]
        }
      }
    )

    this.option('-o, --output <path>', 'Save the result')
      .option('--format <format>', 'Format (json|ts|minify)', 'ts')
      .option('--by <field>', 'Sorting field: family|name|hex|hue', 'hex')
      .option('--reverse, -r', 'Reverse order')
      .option('--stable', 'Stable sorting (default)')
      .validate(({ args }) => !args[0]
        ? '❌ Specify path to the dataset: sort <dataset> <output>'
        : true
      )
      .validate(({ args, options }) => !(options.output || options.o || args[1])
        ? '❌ Specify path to save: sort <dataset> <output>'
        : true
      )
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, options, logger }: CommandContext
  ): Promise<SortResult> {
    const colors = datasets[args[0]]
    const sortBy = (options.by || 'hex') as 'family' | 'name' | 'hex' | 'hue'
    const reverse = options.reverse || options.r

    logger.info(`🔤 Sorting by "${sortBy}" ${reverse ? '(reverse)' : ''}...`)
    logger.info(`📊 Colors: ${colors.length}`)

    const result = this.sortData(colors, sortBy, reverse, logger)

    logger.success(`✅ Sorted: ${result.stats.original} → ${result.stats.sorted}`)
    this.printStats(result.stats, logger)

    return result
  }

  sortData(
    data: ColorData[],
    sortBy: 'family' | 'name'|'hex'|'hue',
    reverse: boolean,
    logger: Logger
  ): SortResult {
    this.comparisons = 0

    const progress = new ProgressBar({ total: data.length, width: 40 })
    const start = performance.now()

    let sorted: ColorData[]

    if (sortBy === 'family') {
      // Grouping colors by families
      const families: Record<string, ColorData[]> = {}
      data.forEach(color => {
        const family = color.family || 'unknown'
        if (!families[family]) families[family] = []

        families[family].push(color)
      })

      // For each family calculating the average hue
      const familyAverages: Record<string, number> = {}
      Object.keys(families).forEach(family => {
        const colors = families[family]
        familyAverages[family] = colors.reduce((sum, color) => {
          return sum + (color.hsl?.h || 0)
        }, 0) / colors.length
      })

      // Sorting families by the average hue
      const sortedFamilies = Object.keys(families)
        .sort((a, b) => {
          this.update(progress)
          return familyAverages[a] - familyAverages[b]
        })

      // Within each family sorting colors by HSL (first lightness, then hue)
      sorted = sortedFamilies.flatMap(family => {
        return families[family].sort((a, b) => {
          this.update(progress)

          // First by lightness for a smooth transition from dark to light
          const aLightness = a.hsl?.l || 0
          const bLightness = b.hsl?.l || 0

          if (aLightness !== bLightness) {
            return aLightness - bLightness
          }

          // If the lightness is the same, then by hue
          const aHue = a.hsl?.h || 0
          const bHue = b.hsl?.h || 0

          return aHue - bHue
        })
      })

      if (reverse) {
        sorted.reverse()
      }
    } else if (sortBy === 'hue') {
      // Splitting hue into blocks of 30 degrees
      const hueBlocks: Record<string, ColorData[]> = {}
      const HUE_BLOCK_SIZE = 30

      data.forEach(color => {
        const hue = color.hsl?.h || 0
        const blockKey = `block_${Math.floor(hue / HUE_BLOCK_SIZE)}`

        if (!hueBlocks[blockKey]) {
          hueBlocks[blockKey] = []
        }

        hueBlocks[blockKey].push(color)
      })

      // Sorting blocks by the average hue (so that the blocks go in the order of the spectrum)
      const sortedBlocks = Object.keys(hueBlocks)
        .sort((a, b) => {
          this.update(progress)

          const aIndex = parseInt(a.split('_')[1])
          const bIndex = parseInt(b.split('_')[1])

          return aIndex - bIndex
        })

      // Inside each block sorting first by lightness (from dark to light)
      // then by hue for additional ordering
      sorted = sortedBlocks.flatMap(blockKey => {
        return hueBlocks[blockKey].sort((a, b) => {
          this.update(progress)

          // Basic lightness sorting for a smooth transition
          const aLightness = a.hsl?.l || 0
          const bLightness = b.hsl?.l || 0

          if (aLightness !== bLightness) {
            return aLightness - bLightness
          }

          // Additional sorting by hue within the same lightness
          const aHue = a.hsl?.h || 0
          const bHue = b.hsl?.h || 0

          return aHue - bHue
        })
      })

      if (reverse) {
        sorted.reverse()
      }
    } else { // Simple sorting
      sorted = [...data].sort((a, b) => {
        const aKey = this.getSortKey(a, sortBy)
        const bKey = this.getSortKey(b, sortBy)

        this.update(progress)

        if (aKey < bKey) return reverse ?  1 : -1
        if (aKey > bKey) return reverse ? -1 :  1

        return 0
      })
    }

    progress.processing()

    const finish = performance.now()
    logger.info(`PERFORMANCE: ${finish - start} ms`)

    return {
      data: sorted,
      stats: {
        original: data.length,
        sorted: sorted.length,
        field: sortBy,
        reverse,
        uniqueValues: new Set(
          sorted.map(c => this.getSortKey(c, sortBy))
        ).size
      }
    }
  }

  private getSortKey(color: ColorData, sortBy: 'family' | 'name' | 'hex' | 'hue'): string | number {
    switch (sortBy) {
      case 'family':
        return color.family?.toLowerCase()!
      case 'name':
        return color.name.toLowerCase()
      case 'hex':
        return color.hex.toLowerCase()
      case 'hue':
        return color.hsl?.h ?? 0
      default:
        return color.name.toLowerCase()
    }
  }

  update(progress: ProgressBar): void {
    this.comparisons++

    progress.accumulate(Math.round(
      Math.min(100, (this.comparisons / progress.total) * 100)
    ))

    progress.update()
  }

  printStats(stats: SortStats, logger: any) {
    logger.info('\n📊 SORTING STATISTICS:')
    logger.info(`Field:    ${stats.field}${stats.reverse ? ' (↕️)' : ''}`)
    logger.info(`Total:    ${stats.original}`)

    if (stats.field === 'hue') {
      const uniquePct = ((stats.uniqueValues / stats.original) * 100).toFixed(1)
      logger.info(`Unique hue: ${stats.uniqueValues} (${uniquePct}%)`)
    } else {
      logger.info(`Unique:     ${stats.uniqueValues}`)
    }
  }
}
