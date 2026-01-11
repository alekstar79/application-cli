import { ColorData, CommandContext, CapitalizeResult } from '@/types'
import { ProgressBar } from '../utils/ProgressBar'
import { Command } from '../core/Command'

export class CapitalizeCommand extends Command {
  constructor() {
    super(
      'capitalize',
      '<dataset> [output]',
      'Привести названия цветов к Title Case (первая буква заглавная)',
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
  }

  async perform(
    datasets: Record<string, ColorData[]>,
    _metadata: Record<string, any>,
    { args, logger }: CommandContext
  ): Promise<CapitalizeResult> {
    logger.info('🔬 Запуск TitleCase наименований...')

    const colors = datasets[args[0]]
    logger.info(`📊 Исходных цветов: ${colors.length}`)

    const result = this.capitalizeNames(colors)
    logger.success(`✅ Названия приведены к Title Case`)
    logger.info(`📈 ${result.original} → ${result.capitalized} цветов обработано`)

    return result
  }

  capitalizeNames(data: ColorData[]): CapitalizeResult {
    const progress = new ProgressBar({
      showSpeed: true,
      total: data.length,
      width: 40
    })

    const capitalized: ColorData[] = []

    for (const color of data) {
      const titleCaseName = this.capitalize(color.name)

      capitalized.push({ ...color, name: titleCaseName })
      progress.update(1)
    }

    progress.processing()

    return {
      original: data.length,
      capitalized: capitalized.length,
      data: capitalized
    }
  }

  capitalize(name: string): string {
    return name.split(/\s+/)
      .map(word => word.length ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '')
      .filter(Boolean)
      .join(' ')
  }
}
