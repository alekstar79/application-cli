import { ColorData, CommandContext, GenerateResult, GenerateStats } from '@/types'

import { DatasetDistribution } from '../utils/dataset-distribution/DatasetDistribution'
import { DatasetBalancer } from '../utils/dataset-distribution/DatasetBalancer'
import { FamilyCoverageAnalyzer } from '../utils/dataset-distribution/FamilyCoverageAnalyzer'

import { Command } from '../core/Command'
import { Logger } from '../utils/Logger'

export class SmartGenerateCommand extends Command {
  private analyzer: FamilyCoverageAnalyzer

  constructor() {
    super(
      'smart-generate',
      '<output> <count>',
      'Генерация интеллектуального датасета с оптимальным охватом семейств',
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

    this.analyzer = new FamilyCoverageAnalyzer()

    this.option('--phases <value>', 'Количество фаз генерации (1-5)', '3')
      .option('--tolerance <value>', 'Допуск балансировки % (10-50)', '30')
  }

  async perform(
    _datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, options, logger }: CommandContext
  ): Promise<GenerateResult> {
    const count = parseInt(args[1] ?? 1200)
    const tolerance = parseInt(options.tolerance) || 30

    logger.info('🧠 Smart генерация интеллектуального датасета...')
    logger.info(`📊 Цветов: ${count}`)
    logger.info(`🎯 Фаз: 3, Допуск баланса: ±${tolerance}%`)

    const result = this.generateDataset(count, tolerance, logger)

    this.printStats(result.stats, logger)

    return result
  }

  generateDataset(
    count: number,
    tolerance: number, // ±30%
    logger: Logger
  ): { data: ColorData[], stats: any } {

    // ФАЗА 1: Структурированная генерация
    logger.info('📊 Фаза 1: Структурированная генерация...')
    const distribution = new DatasetDistribution(count)
    const generatedColors = distribution.generateStructuredDataset(logger)

    // ФАЗА 2: Балансировка
    logger.info('⚖️  Фаза 2: Балансировка семейств...')
    const balancer = new DatasetBalancer()
    const balancedColors = balancer.balance(generatedColors, tolerance, logger)

    // ФАЗА 3: Финальная проверка
    logger.info('✅ Фаза 3: Финальная оптимизация...')

    const finalColors = balancedColors.slice(0, count)

    const { families, coverage, quality } = this.analyzer.validate(finalColors, logger)

    return {
      data: finalColors,
      stats: {
        total: count,
        generated: finalColors.length,
        families: families.size,
        coverage: parseFloat(coverage.toFixed(1)),
        quality: parseFloat(quality.toFixed(1)),
        errors: 0
      }
    }
  }

  private printStats(stats: GenerateStats, logger: Logger) {
    logger.info('\n📊 СТАТИСТИКА SMART ГЕНЕРАЦИИ:')
    logger.info(`  ✅ Сгенерировано: ${stats.generated}/${stats.total}`)
    logger.info(`  ❌ Ошибок: ${stats.errors}`)
    logger.info(`  🎨 Семейств: ${stats.families}/${this.analyzer.TOTAL_FAMILIES}`)
    logger.info(`  🌈 Покрытие: ${((stats.families! / this.analyzer.TOTAL_FAMILIES) * 100).toFixed(1)}%`)
  }
}
