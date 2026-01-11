import { ColorData, CommandContext, NormalizeResult, NormalizeStats, Tuple } from '@/types'
import { ProgressBar } from '../utils/ProgressBar'
import { Command } from '../core/Command'

export class NormalizeCommand extends Command {
  constructor() {
    super(
      'normalize',
      '<dataset> [output]',
      'Нормализация/денормализация RGB/HSL значений [0-255/360] ↔ [0-1]',
      (_args: string[], _options: Record<string, any>, _flags: string[], ctx: CommandContext) =>
        this.perform(ctx.parsedDatasets!, ctx.parseMetadata!, ctx), {
        allowUnknownOptions: false,
        strict: true,
        schema: {
          options: {},
          args: [
            { name: 'dataset', required: true, type: 'path'   },
            { name: 'output', required: false, type: 'output' }
          ]
        }
      }
    )

    this.option('-o, --output <path>', 'Сохранить результат')
      .option('--format <format>', 'Формат (json|ts)', 'ts')
      .option('--normalize, -n', 'Нормализовать → [0-1] (по умолчанию)')
      .option('--denormalize, -d', 'Денормализовать [0-1] → [0-255/360]')
      .option('--rgb', 'Только RGB свойства')
      .option('--hsl', 'Только HSL свойства')
      .option('--all', 'Все свойства (по умолчанию)')
      .validate(({ args }) => !args[0]
        ? '❌ Укажите путь к датасету: normalize <dataset> <output>'
        : true
      )
      .validate(({ args, options }) => !(options.output || options.o || args[1])
        ? '❌ Укажите путь для сохранения: normalize <dataset> <output>'
        : true
      )
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, flags, options, logger }: CommandContext
  ): Promise<NormalizeResult> {
    logger.info('🔢 Нормализация/денормализация цветовых значений...')

    const colors = datasets[args[0]]
    const mode = options.denormalize || options.d ? 'denormalize' : 'normalize'
    const target = this.getTarget(options, flags)

    logger.info(`📊 Цветов: ${colors.length}`)

    const result = this.processNormalization(colors, mode, target)

    logger.success(`✅ ${mode === 'normalize' ? 'Нормализация' : 'Денормализация'} завершена`)
    this.printStats(result.stats, logger)

    return result
  }

  private getTarget(options: Record<string, any>, flags: string[]): 'rgb' | 'hsl' | 'all' {
    if (options.rgb || flags.includes('rgb')) return 'rgb'
    if (options.hsl || flags.includes('hsl')) return 'hsl'
    return 'all'
  }

  processNormalization(
    data: ColorData[],
    mode: 'normalize' | 'denormalize',
    target: 'rgb' | 'hsl' | 'all',
  ): NormalizeResult {
    const progress = new ProgressBar({ total: data.length, width: 40 })
    const stats: NormalizeStats = {
      rgbProcessed: 0, rgbSkipped: 0,
      hslProcessed: 0, hslSkipped: 0,
      normalized: 0, denormalized: 0,
      totalColors: data.length,
    }

    const processedData = data.map(color => {
      const processed: any = { ...color }

      // RGB
      if ((target === 'rgb' || target === 'all') && processed.rgb !== undefined) {
        try {
          processed.rgb = this.processRGB(processed.rgb, mode)
          stats.rgbProcessed++
        } catch {
          stats.rgbSkipped++
        }
      }

      // HSL
      if ((target === 'hsl' || target === 'all') && processed.hsl !== undefined) {
        try {
          processed.hsl = this.processHSL(processed.hsl, mode)
          stats.hslProcessed++
        } catch {
          stats.hslSkipped++
        }
      }

      progress.update(1)

      return processed
    })

    progress.processing()

    stats[mode === 'normalize' ? 'normalized' : 'denormalized'] = data.length

    return { stats, data: processedData }
  }

  private processRGB(
    rgb: Tuple<number, 3> | { r: number; g: number; b: number },
    mode: 'normalize' | 'denormalize'
  ): Tuple<number, 3> | { r: number; g: number; b: number } {
    let r, g, b

    if (Array.isArray(rgb)) { // Tuple [r,g,b]
      [r, g, b] = rgb
    } else {                  // Object {r,g,b}
      r = rgb.r ?? 0
      g = rgb.g ?? 0
      b = rgb.b ?? 0
    }

    return [
      this.processValue(r, mode, 255),
      this.processValue(g, mode, 255),
      this.processValue(b, mode, 255),
    ]
  }

  private processHSL(
    hsl: { h: number; s: number; l: number },
    mode: 'normalize' | 'denormalize'
  ): { h: number; s: number; l: number } {
    return {
      h: this.processValue(hsl.h, mode, 360),
      s: this.processValue(hsl.s, mode, 1),
      l: this.processValue(hsl.l, mode, 1),
    }
  }

  private processValue(value: number, mode: 'normalize' | 'denormalize', maxFull: number): number {
    if (isNaN(value) || value === undefined) {
      throw new Error('Invalid value')
    }

    if (mode === 'normalize') {
      // Полный диапазон → нормализуем, если уже нормализовано [0-1] → не трогаем
      const normalized = value > 1 ? value / maxFull : value
      return Number(normalized.toFixed(3))
    } else {
      // Денормализация [0-1] → полный диапазон
      if (value <= 1.001) return Math.round(value * maxFull)
      // Уже полный диапазон → не трогаем
      return Math.round(value)
    }
  }

  printStats(stats: NormalizeStats, logger: any) {
    logger.info('\n📊 СТАТИСТИКА ОБРАБОТКИ:')
    logger.info(`Всего цветов: ${stats.totalColors}`)

    logger.info(`\n🎨 RGB:`)
    logger.info(`  ✅ Обработано: ${stats.rgbProcessed}`)
    logger.info(`  ❌ Пропущено: ${stats.rgbSkipped}`)

    logger.info(`\n🌈 HSL:`)
    logger.info(`  ✅ Обработано: ${stats.hslProcessed}`)
    logger.info(`  ❌ Пропущено: ${stats.hslSkipped}`)

    logger.info(`\n🔄 Режим: ${stats.normalized > 0 ? 'Нормализация' : 'Денормализация'}`)
  }
}
