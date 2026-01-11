import { Family } from './words.ts'
import { Tuple } from '@/types'

export class ColorMetrics {
  static getTemperature(hsl: { h: number; s: number; l: number }): string {
    const h = hsl.h % 360

    if ((h >= 0 && h <= 60) || (h >= 300 && h <= 360)) return 'warm'
    if (h >= 120 && h <= 240) return 'cool'

    return 'neutral'
  }

  static getLightness(hsl: { h: number; s: number; l: number }): string {
    if (hsl.l < 0.2) return 'very-dark'
    if (hsl.l < 0.4) return 'dark'
    if (hsl.l < 0.6) return 'medium'
    if (hsl.l < 0.8) return 'light'

    return 'very-light'
  }

  static getSaturation(hsl: { h: number; s: number; l: number }): string {
    if (hsl.s < 0.05) return 'achromatic'
    if (hsl.s < 0.25) return 'muted'
    if (hsl.s < 0.5) return 'soft'
    if (hsl.s < 0.75) return 'vivid'

    return 'saturated'
  }

  private static normalizeRgb(rgb: Tuple<number, 3> | Tuple<number, 4>): Tuple<number, 3> {
    return rgb.map(v => v >= 1 ? v / 255 : v) as Tuple<number, 3>
  }

  /** HEX(A) → RGB(A) conversion [0-1] */
  static hexToRgb(hex: string): Tuple<number, 3> {
    let r: number = 0, g: number = 0, b: number = 0, a: number = 1
    let normalized = hex.trim().toLowerCase()

    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1)
    }

    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/.test(normalized)) {
      return [r, g, b, a] as unknown as Tuple<number, 3>
    }

    if (hex.length === 3) {
      normalized = normalized.split('')
        .map(ch => ch + ch)
        .join('')
    }

    switch (normalized.length) {
      case 6:
        r = parseInt(normalized.slice(0, 2), 16)
        g = parseInt(normalized.slice(2, 4), 16)
        b = parseInt(normalized.slice(4, 6), 16)
        break

      case 8:
        r = parseInt(normalized.slice(0, 2), 16)
        g = parseInt(normalized.slice(2, 4), 16)
        b = parseInt(normalized.slice(4, 6), 16)
        a = parseInt(normalized.slice(6, 8), 16)
        break

      default:
        return [r, g, b, a] as unknown as Tuple<number, 3>
    }

    const round = (v: number) => Math.round(v * 1000) / 1000

    return this.normalizeRgb([r, g, b, a])
      .map(round) as Tuple<number, 3>
  }

  static hexToHslMetrics(hex: string) {
    const [r, g, b] = this.hexToRgb(hex)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const delta = max - min

    let s, h = 0

    if (max === min) {
      h = 0; s = 0
    } else {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

      switch (max) {
        case r: h = (g - b) / delta * 60; if (g < b) h += 360; break
        case g: h = (b - r) / delta * 60 + 120; break
        case b: h = (r - g) / delta * 60 + 240; break
      }
    }

    return {
      h: Math.round(h),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
      hueRange: this.calculateHueRange({ h, s, l })
    }
  }

  /** Calculating the hueRange in degrees */
  static calculateHueRange(hsl: { h: number; s: number; l: number }): Tuple<number, 2> {
    const { h, s } = hsl

    // If the color is not saturated, it is gray
    if (s < 0.05) return [0, 360]

    // Calculate the spread based on saturation
    const spread = Math.max(1, 20 * (1 - s)) // from 1° to 20°

    let start = h - spread
    let end = h + spread

    // Adjusting the borders
    if (start < 0) start = 0
    if (end > 360) end = 360

    // Wide range → [0,360]
    if (end - start > 180) {
      return [0, 360]
    }

    // Round to 0.1
    return [
      Math.round(start * 10) / 10,
      Math.round(end * 10) / 10
    ]
  }

  static getColorFamily(
    { h, s = 1, l = 0.5 }: { h: number; s: number; l: number }
  ): Family {
    // Normalize hue to 0-360
    h = (h % 360 + 360) % 360

    // 1. Achromatic (black/white/gray)
    if (l < 0.15) return 'black'
    if (s < 0.1) {
      if (l > 0.9) return 'white'
      return 'gray'
    }

    // 2. Early special categories
    if (s < 0.3 && l > 0.6) return 'pastel'
    if (s > 0.8 && l > 0.8) return 'neon'

    // 3. Base hue families (12 основных)
    let baseFamily: Family
    if (h >= 345 || h <= 15) baseFamily = 'red'
    else if (h < 45) baseFamily = 'orange'
    else if (h < 75) baseFamily = 'yellow'
    else if (h < 105) baseFamily = 'chartreuse'
    else if (h < 135) baseFamily = 'green'
    else if (h < 165) baseFamily = 'springgreen'
    else if (h < 195) baseFamily = 'cyan'
    else if (h < 225) baseFamily = 'azure'
    else if (h < 255) baseFamily = 'blue'
    else if (h < 285) baseFamily = 'violet'
    else if (h < 315) baseFamily = 'magenta'
    else if (h < 345) baseFamily = 'rose'
    else baseFamily = 'red'

    // Special categories based on saturation and lightness - use l
    if (s < 0.5 && l < 0.7) {
      if (['orange', 'yellow', 'red'].includes(baseFamily)) {
        if (s < 0.6 && l < 0.7) return 'brown'
        return 'earth'
      }
    }

    // Pink tones (розовые оттенки красного/маджента)
    if ((baseFamily === 'red' || baseFamily === 'rose' || baseFamily === 'magenta') &&
      l > 0.7 && s > 0.3 && s < 0.8) {
      return 'pink'
    }

    // Metallic (металлические желтые/оранжевые)
    if (['yellow', 'orange'].includes(baseFamily) && s > 0.2 && s < 0.7 && l > 0.5) {
      return 'metallic'
    }

    // Skin tones (телесные)
    if (['orange', 'yellow', 'brown'].includes(baseFamily) &&
      s > 0.2 && s < 0.7 && l > 0.4 && l < 0.9) {
      return 'skin'
    }

    // Jewel tones (драгоценные)
    if (['red', 'green', 'blue', 'purple', 'magenta'].includes(baseFamily) &&
      s > 0.7 && l > 0.5) {
      return 'jewel'
    }

    // Nature tones (природные)
    if (['green', 'blue', 'springgreen', 'cyan'].includes(baseFamily) &&
      s > 0.3 && s < 0.8 && l > 0.3 && l < 0.9) {
      return 'nature'
    }

    // Food tones (пищевые)
    if (['red', 'orange', 'yellow', 'green', 'brown'].includes(baseFamily) &&
      s > 0.5 && l > 0.5) {
      return 'food'
    }

    // Lime/teal/purple - возвращаем базовые
    if (baseFamily === 'chartreuse') return 'lime'
    if (baseFamily === 'cyan' || baseFamily === 'springgreen') return 'teal'
    if (baseFamily === 'violet') return 'purple'

    return baseFamily
  }
}
