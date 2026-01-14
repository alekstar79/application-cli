import { ColorData, ColorQualityMetrics } from '@/types'

export class QualityScorer {
  scoreColor(
    color: ColorData,
    nearbyColors: ColorData[],
    familyColors: ColorData[],
    spectralRanges: { hMin: number, hMax: number, sMin: number, sMax: number, lMin: number, lMax: number }
  ): ColorQualityMetrics {
    const uniqueness = this.calculateUniqueness(color, nearbyColors)
    const saturationQuality = this.calculateSaturationQuality(color.hsl.s, spectralRanges.sMin, spectralRanges.sMax)
    const lightnessQuality = this.calculateLightnessQuality(color.hsl.l, spectralRanges.lMin, spectralRanges.lMax)
    const familyRepresentativity = this.calculateFamilyRepresentativity(color, familyColors)

    const overallScore = Math.round(
      uniqueness * 35 +
      saturationQuality * 25 +
      lightnessQuality * 25 +
      familyRepresentativity * 15
    )

    return {
      color,
      uniqueness,
      saturationQuality,
      lightnessQuality,
      familyRepresentativity,
      overallScore
    }
  }

  private calculateUniqueness(color: ColorData, nearbyColors: ColorData[]): number {
    if (nearbyColors.length === 0) return 1.0

    // The further away from other colors, the more unique it is
    const minDistance = Math.min(
      ...nearbyColors.map(c => this.colorDistance(color, c))
    )

    return Math.min(1.0, minDistance / 100)
  }

  private calculateSaturationQuality(s: number, sMin: number, sMax: number): number {
    const mid = (sMin + sMax) / 2

    // Colors closer to the edges of the range have higher quality
    const distanceFromMid = Math.abs(s - mid)
    const maxDistance = Math.max(mid - sMin, sMax - mid)

    return Math.min(1.0, distanceFromMid / maxDistance)
  }

  private calculateLightnessQuality(l: number, lMin: number, lMax: number): number {
    // Avoid too dark and too light (low quality)
    if (l < lMin + 10 || l > lMax - 10) return 0.3
    if (l < lMin + 20 || l > lMax - 20) return 0.6

    return 1.0
  }

  private calculateFamilyRepresentativity(color: ColorData, familyColors: ColorData[]): number {
    if (familyColors.length === 0) return 1.0

    // Looking for the "center" of the family
    const centerH = familyColors.reduce((sum, c) => sum + c.hsl.h, 0) / familyColors.length
    const centerS = familyColors.reduce((sum, c) => sum + c.hsl.s, 0) / familyColors.length
    const centerL = familyColors.reduce((sum, c) => sum + c.hsl.l, 0) / familyColors.length

    const distance = Math.sqrt(
      Math.pow((color.hsl.h - centerH) / 360, 2) * 0.3 +
      Math.pow((color.hsl.s - centerS) / 100, 2) * 0.3 +
      Math.pow((color.hsl.l - centerL) / 100, 2) * 0.4
    )

    return Math.max(0.3, 1.0 - distance * 2)
  }

  private colorDistance(c1: ColorData, c2: ColorData): number {
    const dH = Math.min(Math.abs(c1.hsl.h - c2.hsl.h), 360 - Math.abs(c1.hsl.h - c2.hsl.h))
    const dS = Math.abs(c1.hsl.s - c2.hsl.s)
    const dL = Math.abs(c1.hsl.l - c2.hsl.l)

    return Math.sqrt(
      Math.pow(dH / 360, 2) * 0.4 +
      Math.pow(dS / 100, 2) * 0.3 +
      Math.pow(dL / 100, 2) * 0.3
    ) * 100
  }
}
