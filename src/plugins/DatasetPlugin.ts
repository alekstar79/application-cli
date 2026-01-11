import { ColorData, CommandContext, PluginAPI } from '@/types'

import { ColorMetrics } from '@/utils/ColorMetrics'
import { Application } from '@/core/Application'

import { dirname, resolve } from 'node:path'
import { promises as fs } from 'node:fs'

export class DatasetPlugin {
  name = 'dataset'
  version = '1.0.0'
  description = 'Универсальный плагин загрузки и сохранения датасета'

  install(app: Application, api: PluginAPI): void {
    const { logger } = api

    // app.dataset
    ;(app as any).dataset = {
      load: this.load.bind(this),
      save: this.save.bind(this),
      validate: this.validate.bind(this)
    }

    // Middleware for context
    app.use(async (ctx: CommandContext, next: () => Promise<void>) => {
      ctx.dataset = (app as any).dataset
      await next()
    })

    logger.success(`✅ Плагин ${this.name} v${this.version} установлен`)
  }

  async load(datasetPath: string): Promise<any> {
    try {
      const module = await import(datasetPath)
      return module.default || module
    } catch (error: any) {
      throw new Error(`Ошибка загрузки "${datasetPath}": ${error.message}`)
    }
  }

  async save(
    data: ColorData[],
    path: string,
    format: string = 'ts',
    logger: any
  ): Promise<void> {
    const absolutePath = resolve(process.cwd(), path)
    const dirPath = dirname(absolutePath)

    try {
      await fs.mkdir(dirPath, { recursive: true })

      let content: string
      if (format === 'json') {
        content = JSON.stringify(data, null, 2)
      } else {
        content = `/**\n * Generated Color Dataset - ${data.length} цветов\n * Сгенерировано: ${new Date().toLocaleString('ru-RU')}\n */\n\nexport default [\n`

        data.forEach((color, index) => {
          let { hex, name, family, hueRange, rgb, hsl } = color

          family ??= ColorMetrics.getColorFamily(hsl)
          const rgbStr = `[${this.format(rgb[0])}, ${this.format(rgb[1])}, ${this.format(rgb[2])}]`
          const hslStr = `{ h: ${this.format(hsl.h)}, s: ${this.format(hsl.s)}, l: ${this.format(hsl.l)} }`
          content += `  { hex: "${hex}", name: "${name}", family: "${family!.toLowerCase()}", hueRange: [${hueRange![0].toFixed(1)}, ${hueRange![1].toFixed(1)}], rgb: ${rgbStr}, hsl: ${hslStr} }${index < data.length - 1 ? ',' : ''}\n`
        })

        content += `]\n`
      }

      await fs.writeFile(absolutePath, content, 'utf8')
      const stats = await fs.stat(absolutePath)
      logger.success(`💾 Сохранён: ${absolutePath} (${stats.size} байт)`)
    } catch (error: any) {
      logger.error(`❌ Ошибка сохранения ${absolutePath}: ${error.message}`)
      throw error
    }
  }

  // Dataset validation
  validate(data: ColorData[]): ColorData[] {
    return data.filter(color =>
      color.name && color.hex && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color.hex)
    )
  }

  format(num: number, fraction: number = 3): string {
    if (Number.isInteger(num)) return num.toString()

    const str = num.toFixed(fraction)

    return str.replace(/\.?0+$/, '')
  }
}
