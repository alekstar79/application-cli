import { WriteStream } from 'node:tty'

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'success'

interface LoggerOptions {
  colors?: boolean;
  level?: LogLevel;
}

interface Writter {
  (...data: any[]): void;
}

export class Logger {
  loggerType!: 'console' | 'stdout'
  write!: Writter

  colorsEnabled: boolean
  level: LogLevel

  levels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
    success: 2
  }
  levelColors: Record<LogLevel, string> = {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    debug: 'gray',
    trace: 'magenta',
    success: 'green'
  }
  colors: Record<string, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    reset: '\x1b[0m'
  }

  constructor(options: LoggerOptions = {}) {
    this.colorsEnabled = options.colors !== false && process.stdout.isTTY
    this.level = options.level || 'info'
    this.setWriter(process.stdout)
  }

  setWriter(writer: any) {
    if (writer instanceof WriteStream) {
      this.write = writer.write.bind(process.stdout)
      this.loggerType = 'stdout'
    } else {
      this.write = console.log.bind(console)
      this.loggerType = 'console'
    }
  }

  colorize(text: string, color: string): string {
    if (this.colorsEnabled) {
      return `${this.colors[color] || ''}${text}${this.colors.reset}`
    }

    return text
  }

  log(level: LogLevel, message: string, ...args: any[]): void {
    if (this.levels[level] > this.levels[this.level]) return

    const timestamp = new Date().toISOString().slice(11, 23)
    const color = this.levelColors[level] || 'white'
    const prefix = this.colorize(`[${timestamp}] ${level.toUpperCase()}:`, color)

    this.write(`${prefix} ${message}`)

    while ((message = args.shift())) {
      this.write(`\n  ${prefix} ${message}`)
    }

    if (this.loggerType === 'stdout') {
      this.write('\n')
    }
  }

  error = (msg: string, ...args: any[]) => this.log('error', msg, ...args)
  warn = (msg: string, ...args: any[]) => this.log('warn', msg, ...args)
  info = (msg: string, ...args: any[]) => this.log('info', msg, ...args)
  success = (msg: string, ...args: any[]) => this.log('success', msg, ...args)
  debug = (msg: string, ...args: any[]) => this.log('debug', msg, ...args)
  trace = (msg: string, ...args: any[]) => this.log('trace', msg, ...args)

  setLevel(level: LogLevel): void {
    if (this.levels[level] !== undefined) {
      this.level = level
    }
  }

  disableColors(): void {
    this.colorsEnabled = false
  }
}
