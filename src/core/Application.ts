import { CommandContext, DatasetAPI, HookHandler, MiddlewareHandler, ParsedArgs } from '@/types'

import { parseArgs } from './parser'
import { PipeHandler } from '../utils/PipeHandler'
import { Command } from './Command'

import { Logger } from '../utils/Logger'
import { Tracer } from '../utils/Tracer'

export class Application {
  name: string
  version: string
  commands: Map<string, Command> = new Map()
  pipeHandler: PipeHandler
  logger: Logger
  tracer: Tracer

  private middlewares: MiddlewareHandler[] = []
  private plugins: Map<string, any> = new Map()
  private hooks: {
    preParse: HookHandler[]
    postParse: HookHandler[]
    preExecute: HookHandler[]
    postExecute: HookHandler[]
    preCommand: Map<string, HookHandler[]>
    postCommand: Map<string, HookHandler[]>
    error: HookHandler[]
  } = {
    preParse: [],
    postParse: [],
    preExecute: [],
    postExecute: [],
    preCommand: new Map(),
    postCommand: new Map(),
    error: []
  }

  constructor(name: string = 'cli', version: string = '1.0.0') {
    this.name = name
    this.version = version

    this.pipeHandler = new PipeHandler()
    this.logger = new Logger()
    this.tracer = new Tracer()

    this.registerBuiltins()
  }

  private registerBuiltins(): void {
    this.registerAction('help', '[command]', 'Показать справку', (args: any) => {
      if (args[0]) {
        const cmd = this.commands.get(args[0])
        if (cmd) cmd.showHelp()
        else this.logger.error(`Команда "${args[0]}" не найдена`)
      } else {
        this.showHelp()
      }

      return Promise.resolve()
    })

    this.registerAction('version', '', 'Показать версию', () => {
      this.logger.info(`${this.name} v${this.version}`)
      return Promise.resolve()
    })

    this.registerAction('plugins', '', 'Список плагинов', () => {
      this.logger.info('Загруженные плагины:')

      for (const [name, plugin] of this.plugins) {
        this.logger.info(`  ${name} v${plugin.version || '1.0.0'} - ${plugin.description || ''}`)
      }

      return Promise.resolve()
    })
  }

  use(middleware: MiddlewareHandler): this {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware должен быть функцией')
    }

    this.middlewares.push(middleware)

    return this
  }

  registerAction(name: string, signature: string = '', description: string = '', action: any, config: any = {}): Command {
    return this.registerCommand(
      new Command(name, signature, description, action, config)
    )
  }

  registerCommand(command: Command): Command {
    this.commands.set(command.name, command)

    return command
  }

  registerPlugin(name: string, plugin: any): this {
    if (typeof plugin.install !== 'function') {
      throw new Error('Плагин должен иметь метод install')
    }

    this.plugins.set(name, plugin)

    plugin.install(this, {
      logger: this.logger,
      tracer: this.tracer,
      registerCommand: this.registerCommand.bind(this),
      use: this.use.bind(this)
    })

    this.logger.debug(`Плагин "${name}" загружен`)

    return this
  }

  hook(hookName: string, handler: HookHandler, commandName?: string): this {
    if (commandName) {
      const map = this.hooks[hookName as keyof typeof this.hooks] as Map<string, HookHandler[]>
      if (!map.has(commandName)) {
        map.set(commandName, [])
      }
      map.get(commandName)!.push(handler)
    } else {
      const arr = this.hooks[hookName as keyof typeof this.hooks] as HookHandler[]
      if (Array.isArray(arr)) {
        arr.push(handler)
      }
    }

    return this
  }

  private async executeHooks(hookName: string, context: any, commandName?: string): Promise<void> {
    const hooks =
      commandName && this.hooks[hookName as keyof typeof this.hooks] instanceof Map
        ? (this.hooks[hookName as keyof typeof this.hooks] as Map<string, HookHandler[]>).get(commandName) || []
        : ((this.hooks[hookName as keyof typeof this.hooks] as HookHandler[]) || [])

    for (const hook of hooks) {
      await hook(context, this)
    }
  }

  async run(argv: string[] = process.argv.slice(2)): Promise<void> {
    try {
      // preParse хук
      await this.executeHooks('preParse', { argv })

      // Ранний парсинг глобальных флагов
      const earlyParsed: ParsedArgs = parseArgs(argv)
      this.applyGlobalFlags(earlyParsed.flags, earlyParsed.options)

      // postParse хук
      await this.executeHooks('postParse', {
        commandName: earlyParsed.commandName,
        args: earlyParsed.args,
        options: earlyParsed.options,
        flags: earlyParsed.flags
      })

      // Парсинг для команды
      const { commandName, args, options, flags } = parseArgs(argv)
      if (!commandName || commandName === 'help') {
        this.showHelp(commandName === 'help' ? args[0] : undefined)
        return process.exit(0)
      }

      const command = this.commands.get(commandName!)
      if (!command) {
        this.logger.error(`Команда "${commandName}" не найдена`)
        this.showHelp()
        return process.exit(1)
      }

      const context: CommandContext = {
        command,
        args,
        options,
        flags,
        logger: this.logger,
        tracer: this.tracer,
        pipe: this.pipeHandler,
        dataset: this.plugins.get('dataset') as DatasetAPI,
        app: this as unknown as Application & {
          dataset: DatasetAPI
        }
      }

      await this.executeHooks('preExecute', context)
      await this.executeHooks('preCommand', context, commandName)

      await this.executeMiddleware(context, async () => {
        context.result = await command.execute(args, options, flags, context)
      })

      await this.executeHooks('postCommand', { ...context, result: context.result }, commandName)
      await this.executeHooks('postExecute', { ...context, result: context.result })

    } catch (error: any) {
      await this.executeHooks('error', { error, argv })
      this.logger.error(error.message)
      if (this.tracer.enabled && error.stack) {
        this.logger.error(error.stack)
      }

      process.exit(1)
    }
  }

  private applyGlobalFlags(flags: string[], options: Record<string, any>): void {
    if (flags.includes('v') || flags.includes('verbose')) {
      this.logger.setLevel('debug')
    }
    if (flags.includes('trace')) {
      this.tracer.enable()
    }
    if (options.noColor || flags.includes('no-color')) {
      this.logger.disableColors()
    }
  }

  private async executeMiddleware(
    context: CommandContext,
    finalAction: () => Promise<void>
  ): Promise<void> {
    const execute = async (index: number): Promise<void> => {
      if (index === this.middlewares.length) {
        return await finalAction()
      }

      const middleware = this.middlewares[index]
      await middleware(context, () => execute(index + 1))
    }

    await execute(0)
  }

  private showHelp(commandName?: string): void {
    if (commandName) {
      const cmd = this.commands.get(commandName)
      if (cmd) cmd.showHelp()
      else this.logger.error(`Команда "${commandName}" не найдена`)
    } else {
      this.logger.info(`${this.name} v${this.version}`)
      this.logger.info('Использование: cli <command> [аргументы]')
      this.logger.info('\nДоступные команды:')

      for (const [name, cmd] of this.commands) {
        const signature = cmd.signature ? `${name} ${cmd.signature}` : name
        this.logger.info(`  ${signature.padEnd(30)} - ${cmd.description}`)
      }

      this.logger.info('\nГлобальные опции:')
      this.logger.info('  --help, -h              Показать справку')
      this.logger.info('  --version, -v           Показать версию')
      this.logger.info('  --verbose               Подробный вывод')
      this.logger.info('  --trace                 Включить трассировку')
      this.logger.info('  --no-color              Отключить цвета')
    }
  }
}
