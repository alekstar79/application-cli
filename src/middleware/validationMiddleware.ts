import { CommandContext, MiddlewareHandler, ValidationSchema } from '@/types'

export function validationMiddleware(): MiddlewareHandler {
  return async (ctx: CommandContext, next: () => Promise<void>) => {
    const { command, args, options, logger } = ctx
    const errors: string[] = []

    // Читаем схему из команды (config.schema)
    const schema: ValidationSchema = (command as any).config?.schema || {}

    // Валидация аргументов
    if (schema.args) {
      schema.args.forEach((rule, index) => {
        if (rule.required && !args[index]) {
          errors.push(`❌ Отсутствует обязательный аргумент: "${rule.name}"`)
        }
        if (rule.type === 'number' && args[index] && isNaN(Number(args[index]))) {
          errors.push(`❌ Аргумент "${rule.name}" должен быть числом`)
        }
        if (rule.type === 'path' && args[index] && !args[index].match(/\.(ts|js|json)$/)) {
          errors.push(`❌ "${rule.name}" должен быть файлом (.ts/.js/.json)`)
        }
        if (rule.type === 'output' && args[index]) {
          // output может быть любым
        }
      })
    }

    // Валидация опций
    if (schema.options) {
      Object.entries(schema.options).forEach(([key, rule]) => {
        if (rule.required && options[key] === undefined) {
          errors.push(`❌ Требуется опция: --${key}`)
        }
        if (rule.type === 'number' && options[key] !== undefined && isNaN(Number(options[key]))) {
          errors.push(`❌ Опция --${key} должна быть числом`)
        }
      })
    }

    if (errors.length > 0) {
      logger.error('🚫 Ошибки валидации:')
      errors.forEach(err => logger.error(`  ${err}`))
      logger.info(`💡 ${command.name} ${command.signature}`)
      throw new Error('Неверные параметры команды')
    }

    await next()
  }
}
