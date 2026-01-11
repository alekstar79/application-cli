import { ColorData, CommandContext, DeduplicateResult, DeduplicateStats, MergeResult } from '@/types'

import { Application } from '../core/Application'
import { Command } from '../core/Command'
import { Logger } from '../utils/Logger'

import { DeduplicateCommand } from './DeduplicateCommand'

interface MergeDeduplicateResult {
  data: ColorData[]
  stats: DeduplicateStats[]
}

export class MergeCommand extends Command {
  constructor() {
    super(
      'merge',
      '<output> [<dataset1> <dataset2> ...]',
      'Слияние датасетов без дублей HEX+NAME',
      (_args: string[], _options: Record<string, any>, _flags: string[], ctx: CommandContext) =>
        this.perform(ctx.parsedDatasets!, ctx.parseMetadata!, ctx), {
        allowUnknownOptions: false,
        strict: true,
        schema: {
          options: {},
          args: [
            { name: 'output', required: true, type: 'output' }
          ]
        }
      }
    )

    this.option('-f, --format <format>', 'Формат (json|ts)', 'ts')
      .option('--dedupe', 'Принудительная дедупликация (по умолчанию)')
      .validate(({ args }) => !args[0]
        ? '❌ Укажите путь для сохранения: merge <output> <dataset1> <dataset2> ...'
        : true
      )
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { app, options, logger }: CommandContext
  ): Promise<MergeResult> {
    const dedupe = options.dedupe !== false

    logger.info(`🔗 Мерж ${Object.keys(datasets).length} датасетов`)

    const allColors = Object.values(datasets).flat()

    const result: MergeDeduplicateResult = dedupe
      ? this.deduplicateAll(allColors, app, logger) as unknown as MergeDeduplicateResult
      : { data: allColors, stats: [] }

    logger.success(`✅ Мерж завершен: ${result.data.length} уникальных цветов`)
    this.printMergeStats(allColors.length, result, logger)

    return {
      data: result.data,
      stats: result.stats,
      inputCount: Object.keys(datasets).length
    }
  }

  private deduplicateAll(colors: ColorData[], app: Application, logger: Logger): DeduplicateResult {
    logger.info('🔬 Дедупликация HEX+NAME...')

    const deduplicateCommand = app.commands.get('deduplicate') as DeduplicateCommand
    if (!deduplicateCommand?.deduplicate) {
      throw new Error('❌ Команда "deduplicate" не найдена или метод deduplicate отсутствует')
    }

    return deduplicateCommand.deduplicate(colors)
  }

  printMergeStats(inputTotal: number, result: any, logger: any) {
    logger.info('\n📊 СТАТИСТИКА МЕРЖА:')
    logger.info(`Вход:        ${inputTotal} цветов`)
    logger.info(`Результат:   ${result.data.length} уникальных`)
    logger.info(`Удалено:     ${inputTotal - result.data.length} дублей`)
    logger.info(`Эффективно:  ${((result.data.length / inputTotal) * 100).toFixed(1)}%`)

    if (result.stats?.length > 0) {
      logger.info('\n🔍 ТОП-5 ДУБЛЕЙ:')
      result.stats.slice(0, 5).forEach((dup: any, i: number) => {
        logger.info(`  ${i+1}. ${dup.hex || dup.names?.[0]} → "${dup.selected}" (${dup.reason})`)
      })
    }
  }
}
