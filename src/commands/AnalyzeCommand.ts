import { AnalyzeResult, ColorData, CommandContext, DatasetStats, Distributions, Metadata, Patterns, TopStats } from '@/types'
import { ProgressBar } from '../utils/ProgressBar'
import { Command } from '../core/Command'

import { buildPath } from '../utils/paths'
import { writeFile } from 'fs/promises'

export class AnalyzeCommand extends Command {
  constructor() {
    super(
      'analyze',
      '<dataset> [output]',
      'Полный анализ датасета: статистика, топы, паттерны, распределения',
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

    this.option('-o, --output <path>', 'Сохранить в файл')
      .option('--format <format>', 'Формат (json|ts)', 'json')
      .option('--console', 'Показать в консоли (по умолчанию)')
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, Metadata>,
    { args, options, logger }: CommandContext
  ): Promise<Record<string, AnalyzeResult>> {
    logger.info('🔬 Запуск полного анализа датасета...')

    const outputPath = options.output || options.o || args[1]
    const showConsole = options.console !== false && !outputPath

    let result: Record<string, AnalyzeResult> = {}
    for (const [path, data] of Object.entries(datasets)) {
      result[path] = this.analyze(data, logger)

      // РЕЖИМ 1: консоль
      if (showConsole) {
        this.printReport(path, result[path], logger)
      }

      // РЕЖИМ 2: сохранение
      if (outputPath) {
        await writeFile(buildPath(path, outputPath), JSON.stringify(result[path], null, 2), 'utf-8')
        logger.success(`📄 Отчёт сохранён: ${outputPath}`)
      }
    }

    return result
  }

  analyze(data: ColorData[], _logger: any): AnalyzeResult {
    const progress = new ProgressBar({ total: data.length, width: 40 })
    const stats: DatasetStats = {
      nameLength: { avg: 0, min: Infinity, max: 0 },
      hexUsage: { '3-digit': 0, '6-digit': 0 },
      nameWords: { avgWords: 0, avgWordLength: 0 }
    }

    const top: TopStats = { longestNames: [], shortestNames: [], mostCommonWords: [] }
    const distributions: Distributions = { nameLengthBuckets: {}, hexGroups: {} }
    const patterns: Patterns = { hasNumbers: 0, hasSpecialChars: 0, camelCase: 0, allLower: 0, allUpper: 0 }

    const hexSet = new Set<string>()
    const nameSet = new Set<string>()
    const exactSet = new Set<string>()
    const familySet = new Set<string>()
    let hexDuplicates = 0
    let nameDuplicates = 0
    let exactDuplicates = 0

    const wordCount: Record<string, number> = {}
    let validCount = 0

    for (const color of data) {
      progress.update(1)

      // Статистика дублей
      const hexKey = color.hex?.toLowerCase()
      const nameKey = color.name?.toLowerCase()
      const familyKey = color.family?.toLowerCase()
      const exactKey = `${hexKey}|${nameKey}`

      if (hexSet.has(hexKey)) hexDuplicates++
      else hexSet.add(hexKey)

      if (nameSet.has(nameKey)) nameDuplicates++
      else nameSet.add(nameKey)

      if (exactSet.has(exactKey)) exactDuplicates++
      else exactSet.add(exactKey)

      if (familyKey) {
        familySet.add(familyKey)
      }

      // Валидация HEX
      const isValidHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color.hex)
      if (isValidHex) validCount++

      // Длина имени
      const nameLen = color.name.length
      stats.nameLength.min = Math.min(stats.nameLength.min, nameLen)
      stats.nameLength.max = Math.max(stats.nameLength.max, nameLen)
      stats.nameLength.avg += nameLen

      // HEX статистика
      if (color.hex.length === 4) stats.hexUsage['3-digit']++
      else if (color.hex.length === 7) stats.hexUsage['6-digit']++

      // Слова в имени
      const words = color.name.toLowerCase().split(/\s+/)
      stats.nameWords.avgWords += words.length
      words.forEach(word => {
        stats.nameWords.avgWordLength += word.length / words.length
        wordCount[word] = (wordCount[word] || 0) + 1
      })

      // Топы
      if (nameLen > (top.longestNames[0]?.length || 0)) {
        top.longestNames.unshift(color.name)
        top.longestNames.splice(5)
      }
      if (nameLen < (top.shortestNames[0]?.length || Infinity)) {
        top.shortestNames.unshift(color.name)
        top.shortestNames.splice(5)
      }

      // Распределения
      const bucket = Math.floor(nameLen / 5) * 5 + '-'
      distributions.nameLengthBuckets[bucket] = (distributions.nameLengthBuckets[bucket] || 0) + 1
      distributions.hexGroups[color.hex.slice(1, 3)] = (distributions.hexGroups[color.hex.slice(1, 3)] || 0) + 1

      // Паттерны
      if (/\d/.test(color.name)) patterns.hasNumbers++
      if (/[^a-zA-Z\s-]/.test(color.name)) patterns.hasSpecialChars++
      if (/[a-z][A-Z]/.test(color.name)) patterns.camelCase++
      if (/^[a-z\s-]+$/.test(color.name)) patterns.allLower++
      if (/^[A-Z\s-]+$/.test(color.name)) patterns.allUpper++
    }

    progress.processing()

    // Финальные вычисления
    stats.nameLength.avg /= data.length
    stats.nameWords.avgWords /= data.length
    stats.nameWords.avgWordLength /= data.length

    top.mostCommonWords = Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word)

    top.longestNames = top.longestNames.slice(0, 5)
    top.shortestNames = top.shortestNames.slice(0, 5)

    return {
      total: data.length,
      valid: validCount,
      invalid: data.length - validCount,
      families: familySet.size,
      duplicates: {
        hexDuplicates,
        nameDuplicates,
        exactDuplicates,
        uniqueHex: hexSet.size,
        uniqueNames: nameSet.size
      },
      stats,
      top,
      distributions,
      patterns
    }
  }

  printReport(dataset: string, result: AnalyzeResult, logger: any) {
    logger.success(`📊 АНАЛИЗ ДАТАСЕТА ${dataset}`)
    logger.info(`Всего цветов: ${result.total} из ${result.families} семейств`)
    logger.info(`✅ Валидных: ${result.valid} (${((result.valid/result.total)*100).toFixed(1)}%)`)
    logger.info(`❌ Невалидных: ${result.invalid}`)

    logger.info('\n🔍 ДУБЛИКАТЫ:')
    logger.info(`🎨 HEX дубли: ${result.duplicates.hexDuplicates} (${((result.duplicates.hexDuplicates/result.total)*100).toFixed(1)}%)`)
    logger.info(`📝 NAME дубли: ${result.duplicates.nameDuplicates} (${((result.duplicates.nameDuplicates/result.total)*100).toFixed(1)}%)`)
    logger.info(`🔗 Полные дубли: ${result.duplicates.exactDuplicates}`)
    logger.info(`✨ Уникальных HEX: ${result.duplicates.uniqueHex}`)
    logger.info(`✨ Уникальных имён: ${result.duplicates.uniqueNames}`)

    logger.info('\n📏 СТАТИСТИКА ИМЁН:')
    logger.info(`Длина: ${result.stats.nameLength.avg.toFixed(1)} ± ${(result.stats.nameLength.max - result.stats.nameLength.min)/2} символов`)
    logger.info(`Слов: ${result.stats.nameWords.avgWords.toFixed(1)} в среднем`)
    logger.info(`HEX: ${result.stats.hexUsage['3-digit']} коротких, ${result.stats.hexUsage['6-digit']} полных`)

    logger.info('\n🏆 ТОПЫ:')
    logger.info(`Самые длинные: ${result.top.longestNames.slice(0,3).join(', ')}...`)
    logger.info(`Самые короткие: ${result.top.shortestNames.slice(0,3).join(', ')}...`)
    logger.info(`Популярные слова: ${result.top.mostCommonWords.slice(0,5).join(', ')}`)

    logger.info('\n🎨 ПАТТЕРНЫ:')
    logger.info(`🔢 С числами: ${result.patterns.hasNumbers}`)
    logger.info(`✨ Специальные символы: ${result.patterns.hasSpecialChars}`)
    logger.info(`🐫 CamelCase: ${result.patterns.camelCase}`)
  }
}
