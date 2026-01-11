import { CommandContext, ColorData, RecalcResult, RecalcStats } from '@/types'

import { ColorMetrics } from '../utils/ColorMetrics.ts'
import { ProgressBar } from '../utils/ProgressBar'
import { Command } from '../core/Command'

export class RecalcCommand extends Command {
  constructor() {
    super(
      'recalc',
      '<dataset> [output]',
      'Пересчёт rgb/hsl/hueRange из hex',
      (_args: string[], _options: Record<string, any>, _flags: string[], ctx: CommandContext) =>
        this.perform(ctx.parsedDatasets!, ctx.parseMetadata!, ctx), {
        allowUnknownOptions: false,
        strict: true,
        schema: {
          args: [
            { name: 'dataset', required: true, type: 'path'   },
            { name: 'output', required: false, type: 'output' }
          ]
        }
      }
    )

    this.option('-o, --output <path>', 'Сохранить результат')
      .option('--format <format>', 'Формат (json|ts)', 'ts')
      .option('--denormalize, -d', 'Денормализовать (normalize -d)')
      .validate(({ args }) => !args[0]
        ? '❌ Укажите путь к датасету: recalc <dataset> <output>'
        : true
      )
      .validate(({ args, options }) => !(options.output || options.o || args[1])
        ? '❌ Укажите путь для сохранения: recalc <dataset> <output>'
        : true
      )
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, options, logger, app }: CommandContext
  ): Promise<RecalcResult> {
    logger.info('🔄 Пересчёт всех цветовых значений из HEX...')

    const colors = datasets[args[0]]
    const useDenormalize = options.denormalize || options.d

    const result = this.recalculateFromHex(colors, logger)
    logger.success('✅ Пересчёт завершён')
    this.printStats(result.stats, logger)

    let finalData = result.data

    if (useDenormalize) {
      logger.info('🔗 Денормализация...')

      const normalizeCommand = app.commands.get('normalize') as any
      if (!normalizeCommand?.processNormalization) {
        throw new Error('❌ Метод processNormalization не найден')
      }

      const denormResult = normalizeCommand.processNormalization(
        result.data, 'denormalize', 'all', logger
      )

      finalData = denormResult.data
      logger.success('✅ Денормализация завершена')
    }

    return { stats: result.stats, data: finalData }
  }

  recalculateFromHex(data: ColorData[], _logger: any): { stats: RecalcStats; data: ColorData[] } {
    const progress = new ProgressBar({ total: data.length, width: 40 })
    const stats: RecalcStats = { total: data.length, recalculated: { rgb: 0, hsl: 0, hueRange: 0 }, errors: 0 }

    // let i = 0
    const processed = data.map(color => {
      try {
        const rgb = ColorMetrics.hexToRgb(color.hex)
        const metrics = ColorMetrics.hexToHslMetrics(color.hex)
        const hsl = {
          h: metrics.h / 360,
          s: metrics.s / 100,
          l: metrics.l / 100
        }

        // // TODO
        // if (i < 5) {
        //   console.log('recalculateFromHex', {
        //     metricsHSL: { h: metrics.h, s: metrics.s, l: metrics.l }
        //   }, hsl)
        // }
        //
        // i++

        const processed: ColorData = {
          ...color,
          family: color.family ?? ColorMetrics.getColorFamily(hsl),
          hueRange: metrics.hueRange,
          hsl,
          rgb
        }

        stats.recalculated.rgb++
        stats.recalculated.hsl++
        stats.recalculated.hueRange++

        progress.update(1)
        return processed
      } catch (error) {
        progress.update(1)
        stats.errors++
        return color
      }
    })

    progress.processing()

    return { stats, data: processed }
  }

  private printStats(stats: RecalcStats, logger: any) {
    logger.info('📊 СТАТИСТИКА ПЕРЕСЧЁТА:')
    logger.info(`  Всего: ${stats.total}`)
    logger.info(`  ✅ RGB: ${stats.recalculated.rgb}`)
    logger.info(`  ✅ HSL: ${stats.recalculated.hsl}`)
    logger.info(`  ✅ HueRange: ${stats.recalculated.hueRange}`)
    logger.info(`  ❌ Ошибок: ${stats.errors}`)
  }
}
