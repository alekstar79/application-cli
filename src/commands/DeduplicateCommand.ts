import { CommandContext, ColorData, DeduplicateResult, DeduplicateStats } from '@/types'

import { SemanticDeduplicator } from '../utils/deduplicator/SemanticDeduplicator'
import { Command } from '../core/Command'
import { Logger } from '../utils/Logger'

import { writeFile } from 'fs/promises'

export class DeduplicateCommand extends Command {
  private deduplicator: SemanticDeduplicator

  constructor() {
    super(
      'deduplicate',
      '<dataset> [output]',
      'Дедублицировать датасет цветов по HEX и имени (exact match)',
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

    this.deduplicator = new SemanticDeduplicator()

    this.option('-o, --output <path>', 'Сохранить результат')
      .option('--format <format>', 'Формат (json|ts)', 'ts')
      .option('--report', 'Показать подробный отчёт')
      .option('--save-report <path>', 'Сохранить отчёт')
      .validate(({ args }) => !args[0]
        ? '❌ Укажите путь к датасету: deduplicate <dataset> <output>'
        : true
      )
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, options, logger }: CommandContext
  ): Promise<DeduplicateResult> {
    logger.info('🔬 Семантическая дедупликация датасета...')

    const colors = datasets[args[0]]
    const showReport = options.report

    logger.info(`📊 Исходных цветов: ${colors.length}`)

    const result = this.deduplicate(colors)

    logger.success(`✅ Дедупликация завершена: ${result.stats.removed} удалено`)
    this.printStats(result.stats, logger)

    if (showReport) {
      this.printDetailedReport(result, logger)
    }
    if (options.saveReport) {
      await this.saveReport(result, options.saveReport, logger)
    }

    return result
  }

  deduplicate(colors: ColorData[]): DeduplicateResult {
    const result = this.deduplicator.deduplicate(colors)
    const stats: DeduplicateStats = {
      original: colors.length,
      unique: result.colors.length,
      removed: colors.length - result.colors.length,
      removalRate: ((colors.length - result.colors.length) / colors.length * 100).toFixed(1)
    }

    return {
      data: result.colors,
      duplicates: result.stats,
      stats
    }
  }

  printStats(stats: DeduplicateStats, logger: any) {
    logger.info('\n📊 СТАТИСТИКА ДЕДУПЛИКАЦИИ:')
    logger.info(`Оригинал:    ${stats.original}`)
    logger.info(`Уникальных:  ${stats.unique}`)
    logger.info(`Удалено:     ${stats.removed}`)
    logger.info(`Процент:     ${stats.removalRate}%`)
  }

  printDetailedReport(result: DeduplicateResult, logger: any) {
    logger.info('\n📈 ДЕТАЛЬНЫЙ ОТЧЁТ:')

    for (const dup of result.duplicates.slice(0, 10)) {
      logger.info(`  ${dup.hex}: ${dup.names.join(' → ')} → ${dup.selected} (${dup.reason})`)
    }
    if (result.duplicates.length > 10) {
      logger.info(`  ... и ещё ${result.duplicates.length - 10} групп`)
    }
  }

  private async saveReport(
    result: DeduplicateResult,
    path: string,
    logger: Logger
  ) {
    const report = this.deduplicator.generateReport(result.data)
    await writeFile(path, JSON.stringify(report, null, 2), 'utf-8')
    logger.success(`📄 Отчёт сохранён: ${path}`)
  }
}
