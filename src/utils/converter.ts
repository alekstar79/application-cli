import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ColorTuple = (string | number)[]
export type ColorArray = ColorTuple[]
export type ColorResult = {
  name: string;
  hex: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

function convertColors(colors: ColorArray): ColorResult[] {
  return colors.map(([name, r, g, b]) => ({
    hex: rgbToHex(r as number, g as number, b as number),
    name
  } as ColorResult))
}

async function saveToFile(
  data: ColorResult[],
  filename: string = 'colors.json'
): Promise<void> {
  try {
    const jsonData = JSON.stringify(data, null, 2)
    const dir = dirname(filename)

    if (dir !== '.') {
      await mkdir(dir, { recursive: true })
    }

    await writeFile(filename, jsonData, 'utf8')
    console.log(`✅ File was saved successfully: ${filename}`)
    console.log(`📊 Records processed: ${data.length}`)

  } catch (error) {
    console.error('❌ Error saving file:', error)
    throw error
  }
}

export async function convert(
  rawData: ColorArray,
  filename: string
): Promise<void> {
  try {
    console.log('🔄 Starting to process the colors...')

    const convertedData = convertColors(rawData)

    await saveToFile(convertedData, filename)

    console.log('\n🎨 Converted colors:')
    convertedData.slice(0, 5).forEach(item => {
      console.log(`  ${item.name.padEnd(25)} → ${item.hex}`)
    })

  } catch (error) {
    console.error('💥 Critical error:', error)
    process.exit(1)
  }
}
