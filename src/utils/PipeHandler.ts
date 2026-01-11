// noinspection JSUnusedGlobalSymbols

interface Transformer {
  (data: any): string
}

export class PipeHandler {
  protected transformer?: Transformer
  protected encoding: BufferEncoding = 'utf8'
  protected stdinBuffer: string = ''

  setTransformer(transformer: Transformer) {
    this.transformer = transformer
  }

  isPiped(): boolean {
    return !process.stdin.isTTY
  }

  writeToStdout(data: any, transform?: Transformer): Promise<void> {
    transform ??= this.transformer

    return new Promise((resolve, reject) => {
      const output = transform ? transform(data) : data

      process.stdout.write(output.toString(), this.encoding, (error?: Error | null) => {
        error ? reject(error) : resolve()
      })
    })
  }

  readFromStdin(): Promise<string | null> {
    return new Promise((resolve) => {
      if (process.stdin.isTTY) {
        return resolve(null)
      }

      process.stdin.setEncoding(this.encoding)

      process.stdin.on('readable', () => {
        let chunk: string | null

        while ((chunk = process.stdin.read()) !== null) {
          this.stdinBuffer += chunk
        }
      })

      process.stdin.on('end', () => {
        resolve(this.stdinBuffer.trim() || null)
      })

      setTimeout(() => {
        resolve(this.stdinBuffer.trim() || null)
      }, 1000)
    })
  }

  async writeToSimulatedPipe(data: string): Promise<void> {
    this.stdinBuffer += data
  }

  getBuffer(): string {
    return this.stdinBuffer
  }

  clearBuffer(): void {
    this.stdinBuffer = ''
  }
}
