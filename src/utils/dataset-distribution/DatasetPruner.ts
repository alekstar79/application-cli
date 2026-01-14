import { ColorData, ColorQualityMetrics, Family, PruningStats } from '@/types'

import { SpectrumAnalyzer } from './SpectrumAnalyzer'
import { QualityScorer } from './QualityScorer'

import { ProgressBar } from '../ProgressBar'
import { Logger } from '../Logger'

interface PruningConfig {
  targetCount: number
  minFamilies: number // Minimum families to save
  minCoverage: number // Minimum % from the original spectrum
  preserveExtremes: boolean // Keep the minimum and maximum shades
}

export class DatasetPruner {
  private analyzer = new SpectrumAnalyzer()
  private scorer = new QualityScorer()

  private comparisons: number = 0

  prune(
    colors: ColorData[],
    targetCount: number,
    options: Partial<PruningConfig>,
    logger: Logger
  ): { data: ColorData[], stats: PruningStats } {
    const config: PruningConfig = {
      targetCount,
      minFamilies: Math.max(20, Math.ceil(new Set(colors.map(c => c.family)).size * 0.7)),
      minCoverage: 0.85, // 85% of the original spectrum
      preserveExtremes: true,
      ...options
    }

    logger.info('🧹 PRUNING DATASET')
    logger.info(`📊 From: ${colors.length} → To: ${config.targetCount}`)
    logger.info(`🎯 Min families: ${config.minFamilies}, Min coverage: ${(config.minCoverage * 100).toFixed(0)}%`)

    // PHASE 1: Analysis of the source dataset
    logger.info('\n📈 Phase 1: Spectrum Analysis...')
    const originalCoverage = this.analyzer.analyzeCoverage(colors)
    logger.info(`  📊 Original families: ${originalCoverage.families.size}`)
    logger.info(`  🌈 Hue range: ${originalCoverage.minHue.toFixed(0)}° - ${originalCoverage.maxHue.toFixed(0)}°`)

    // PHASE 2: Evaluation of the quality of each color
    logger.info('\n🎯 Phase 2: Quality Scoring...')
    const scoredColors = this.scoreAllColors(colors, originalCoverage)

    // PHASE 3: Intellectual selection
    logger.info('\n✂️  Phase 3: Intelligent Selection...')
    const selected = this.selectOptimalColors(scoredColors, config, logger)

    const stats = {
      removedCount: colors.length - selected.length,
      keptCount: selected.length,
      avgScoreKept: selected.reduce((sum, sc) => sum + sc.overallScore, 0) / selected.length,
      avgScoreRemoved: scoredColors
        .filter(sc => !selected.some(s => s.color.hex === sc.color.hex))
        .reduce((sum, sc) => sum + sc.overallScore, 0) / Math.max(
          1, scoredColors.length - selected.length
      )
    }

    return {
      data: selected.map(sc => sc.color),
      stats
    }
  }

  private scoreAllColors(
    colors: ColorData[],
    coverage: ReturnType<typeof SpectrumAnalyzer.prototype.analyzeCoverage>,
  ): ColorQualityMetrics[] {
    const pb = new ProgressBar({ total: colors.length, width: 40 })
    const scored: ColorQualityMetrics[] = []

    for (const color of colors) {
      const familyColors = colors.filter(c => c.family === color.family)
      const familyRange = coverage.familyRanges.get(color.family as Family)!

      const nearbyColors = colors.filter(c => {
        const dist = Math.min(
          Math.abs(c.hsl.h - color.hsl.h),
          360 - Math.abs(c.hsl.h - color.hsl.h)
        )
        return c.hex !== color.hex && dist < 30
      })

      const metrics = this.scorer.scoreColor(color, nearbyColors, familyColors, {
        hMin: familyRange.minH, hMax: familyRange.maxH,
        sMin: familyRange.minS, sMax: familyRange.maxS,
        lMin: familyRange.minL, lMax: familyRange.maxL
      })

      scored.push(metrics)

      pb.update(1)
    }

    pb.processing()

    return scored
  }

  private selectOptimalColors(
    scoredColors: ColorQualityMetrics[],
    config: PruningConfig,
    logger: Logger
  ): ColorQualityMetrics[] {
    const selected: ColorQualityMetrics[] = []

    // Step 1: Top colors from each family
    logger.info(`  ⚙️  Step 1: Family representation...`)
    const familiesMap = new Map<Family, ColorQualityMetrics[]>()
    const pb1 = new ProgressBar({ total: scoredColors.length, width: 40 })

    for (const scored of scoredColors) {
      if (!familiesMap.has(scored.color.family as Family)) {
        familiesMap.set(scored.color.family as Family, [])
      }

      familiesMap.get(scored.color.family as Family)!.push(scored)
      pb1.update()
    }

    const pb2 = new ProgressBar({ total: familiesMap.size, width: 40 })

    for (const [_family, colors] of familiesMap) {
      const sorted = colors.sort((a, b) => b.overallScore - a.overallScore)
      const toTake = Math.ceil(config.targetCount / familiesMap.size * 1.2)

      for (let i = 0; i < Math.min(toTake, sorted.length); i++) {
        selected.push(sorted[i])
        this.update(pb2)
      }
    }

    pb2.processing()

    // Step 2: Top Quality
    logger.info(`  ⚙️  Step 2: Quality ranking...`)
    const sortedByScore = selected.sort((a, b) => b.overallScore - a.overallScore)
    let final = sortedByScore.slice(0, config.targetCount)

    // Step 3: Filling in the gaps in the spectrum
    logger.info(`  ⚙️  Step 3: Spectrum gaps...`)
    const finalCoverage = this.analyzer.analyzeCoverage(final.map(sc => sc.color))
    const gapBuckets = this.analyzer.getCriticalBuckets(finalCoverage)

    // If there are gaps, return the colors from the missing batches
    if (gapBuckets.length > 0) {
      const removed = scoredColors.filter(sc => {
        return !final.some(f => f.color.hex === sc.color.hex)
      })

      for (const gapBucket of gapBuckets.slice(0, Math.ceil(config.targetCount * 0.05))) {
        const candidates = removed
          .filter(sc => sc.color.hsl.h >= gapBucket.hueMin && sc.color.hsl.h < gapBucket.hueMax)
          .sort((a, b) => b.overallScore - a.overallScore)

        if (candidates.length > 0 && final.length < config.targetCount) {
          final.push(candidates[0])
          final = final.sort((a, b) => b.overallScore - a.overallScore).slice(0, config.targetCount)
        }
      }
    }

    // Step 4: Checking the minimum number of families
    // if (new Set(final.map(sc => sc.color.family)).size < config.minFamilies) {
    //   logger.warn(`  ⚠️  Not enough families (${new Set(final.map(sc => sc.color.family)).size} < ${config.minFamilies}), adjusting...`)
    //
    //   // Adding the missing families
    //   for (const [family, colors] of familiesMap) {
    //     if (!new Set(final.map(sc => sc.color.family)).has(family)) {
    //       const best = colors.sort((a, b) => b.overallScore - a.overallScore)[0]
    //       final.push(best)
    //     }
    //   }
    //
    //   final = final.sort((a, b) => b.overallScore - a.overallScore).slice(0, config.targetCount)
    // }

    return final
  }

  update(progress: ProgressBar): void {
    this.comparisons++

    progress.accumulate(Math.round(
      Math.min(100, (this.comparisons / progress.total) * 100)
    ))

    progress.update()
  }
}
