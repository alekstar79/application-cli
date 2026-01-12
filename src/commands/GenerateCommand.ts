import { ColorData, CommandContext, GenerateResult, GenerateStats, Tuple } from '@/types'

import { ColorMetrics } from '../utils/ColorMetrics'
import { ProgressBar } from '../utils/ProgressBar'
import { Logger } from '../utils/Logger'

import { Command } from '../core/Command'

export class GenerateCommand extends Command {
  constructor() {
    super(
      'generate',
      '<output> <count>',
      'Генерация равномерного датасета цветов по цветовому спектру',
      (_args: string[], _options: Record<string, any>, _flags: string[], ctx: CommandContext) =>
        this.perform(ctx.parsedDatasets!, ctx.parseMetadata!, ctx), {
        allowUnknownOptions: false,
        strict: true,
        schema: {
          args: [
            { name: 'output', required: true, type: 'output' },
            { name: 'count', required: false, type: 'number' }
          ]
        }
      }
    )

    this.option('--saturation <value>', 'Насыщенность (10-100)', '85')
      .option('--lightness <value>', 'Яркость (10-90)', '50')
      .option('--hue-steps <value>', 'Шаг по Hue (1-30)', '3')
      .option('--sat-spread <value>', 'Разброс насыщенности (±)', '15')
      .option('--light-spread <value>', 'Разброс яркости (±)', '20')
  }

  async perform(
    _datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, options, logger }: CommandContext
  ): Promise<GenerateResult> {

    const count = parseInt(args[1] ?? 1200)
    const saturation = parseInt(options.saturation as string) || 85
    const lightness = parseInt(options.lightness as string) || 50
    const hueSteps = parseInt(options['hue-steps'] as string) || 3
    const satSpread = parseInt(options['sat-spread'] as string) || 15
    const lightSpread = parseInt(options['light-spread'] as string) || 20

    logger.info('🌈 Генерация равномерного цветового датасета...')
    logger.info(`📊 Цветов: ${count}`)
    logger.info(`🎚️  S: ${saturation}±${satSpread}, L: ${lightness}±${lightSpread}`)
    logger.info(`🔄 Hue шаг: ${hueSteps}°`)

    const result = await this.generateDataset(count, {
      saturation,
      lightness,
      hueSteps,
      satSpread,
      lightSpread
    }, logger)

    this.printStats(result.stats, logger)

    logger.success(`✅ Сгенерировано: ${result.data.length} цветов`)

    return result
  }

  private async generateDataset(
    count: number,
    params: {
      saturation: number
      lightness: number
      hueSteps: number
      satSpread: number
      lightSpread: number
    },
    logger: Logger
  ): Promise<GenerateResult> {
    const { saturation, lightness, satSpread, lightSpread } = params

    const progress = new ProgressBar({ total: count, width: 40 })
    const stats: GenerateStats = { total: count, generated: 0, errors: 0 }
    const colors: ColorData[] = []

    // Равномерное распределение Hue: 0-360°
    const hueStep = 360 / count
    let currentHue = 0

    for (let i = 0; i < count; i++) {
      try {
        // 1. Hue равномерно по кругу
        const h = Math.round((currentHue % 360 + 360) % 360)

        // 2. Saturation с разбросом вокруг базового значения
        const sVariation = (Math.random() - 0.5) * 2 * (satSpread / 100)
        const s = Math.max(10, Math.min(100, saturation + sVariation * 100))
        const sNorm = Math.round(s)

        // 3. Lightness с разбросом (избегаем слишком темных/светлых)
        const lVariation = (Math.random() - 0.5) * 2 * (lightSpread / 100)
        const l = Math.max(15, Math.min(85, lightness + lVariation * 100))
        const lNorm = Math.round(l)

        // 4. Генерируем цвет из HSL
        const hex = ColorMetrics.hslToHex({ h, s: sNorm, l: lNorm })

        // 5. Заполняем полную ColorData структуру
        const rgb = ColorMetrics.hexToRgb(hex)
        const hslMetrics = ColorMetrics.hexToHslMetrics(hex)
        const family = ColorMetrics.getColorFamily({ h, s: sNorm, l: lNorm })

        const color: ColorData = {
          hex,
          name: '',
          family,
          hueRange: hslMetrics.hueRange,
          rgb: rgb as Tuple<number, 3>,
          hsl: {
            h,
            s: sNorm,
            l: lNorm
          }
        }

        colors.push(color)
        stats.generated++

      } catch (error) {
        stats.errors++
        logger.debug(`Ошибка генерации цвета ${i}: ${error}`)
      }

      progress.update(1)
      currentHue += hueStep
    }

    progress.processing()

    return { data: colors, stats }
  }

  private printStats(stats: GenerateStats, logger: any) {
    logger.info('\n📊 СТАТИСТИКА ГЕНЕРАЦИИ:')
    logger.info(`  ✅ Сгенерировано: ${stats.generated}/${stats.total}`)
    logger.info(`  ❌ Ошибок: ${stats.errors}`)
    logger.info(`  🌈 Покрытие Hue: ${((stats.generated / stats.total) * 360).toFixed(0)}°`)
  }
}
