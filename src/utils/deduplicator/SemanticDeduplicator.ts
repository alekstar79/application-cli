import { ColorData, DuplicateGroup } from '@/types'

import { SemanticAnalyzer } from './SemanticAnalyzer'
import { StringMetrics } from './StringMetrics'
import { ColorMetrics } from '../ColorMetrics'
import { ProgressBar } from '../ProgressBar'

export interface DeduplicateRawResult {
  colors: ColorData[]
  stats: DuplicateGroup[]
}

export class SemanticDeduplicator {
  private analyzer = SemanticAnalyzer.init()
  private colorMetrics = ColorMetrics

  deduplicate(colors: ColorData[], priorityColors: ColorData[] = []): DeduplicateRawResult {
    const totalColors = colors.length
    const progress = new ProgressBar({
      showSpeed: true,
      total: totalColors,
      width: 40
    })

    const hexGroups = new Map<string, ColorData[]>()
    const nameGroups = new Map<string, ColorData[]>()

    // STEP 1: HEX Grouping (priority 1)
    let groupCount = 0
    for (const color of colors) {
      const hex = color.hex.toLowerCase()

      if (!hexGroups.has(hex)) {
        hexGroups.set(hex, [])
      }

      hexGroups.get(hex)!.push(color)

      groupCount++
      if (groupCount % 2 === 0) {
        progress.accumulate(groupCount, 0.2)
        progress.update()
      }
    }

    // Choosing winners by HEX groups with priority consideration
    const hexWinners: ColorData[] = []
    const hexDuplicates: DuplicateGroup[] = []

    for (const [hex, group] of hexGroups) {
      if (group.length === 1) {
        hexWinners.push(group[0])
      } else {
        const winner = this.selectBestName(group, priorityColors)
        hexWinners.push(winner)
        hexDuplicates.push({
          hex,
          names: group.map(g => g.name),
          selected: winner.name,
          reason: `${this.getSelectionReason(group, winner, priorityColors)} | HEX`
        })
      }

      groupCount++
      if (groupCount % 2 === 0) {
        progress.accumulate(groupCount, 0.3)
        progress.update()
      }
    }

    // STEP 2. Grouping winners by name (priority 2)
    for (const winner of hexWinners) {
      if (winner.name === '') continue

      const name = winner.name.toLowerCase()

      if (!nameGroups.has(name)) {
        nameGroups.set(name, [])
      }

      nameGroups.get(name)!.push(winner)

      groupCount++
      if (groupCount % 2 === 0) {
        progress.accumulate(groupCount, 0.2)
        progress.update()
      }
    }

    if (!nameGroups.size) return { colors: hexWinners, stats: hexDuplicates }

    // Final result: winners by name
    const finalResult: ColorData[] = []
    const nameDuplicates: DuplicateGroup[] = []

    for (const [, nameGroup] of nameGroups) {
      if (nameGroup.length === 1) {
        finalResult.push(nameGroup[0])
      } else {
        // Choosing the best among HEX winners with the same name
        const winner = this.selectBestName(nameGroup, priorityColors)
        finalResult.push(winner)
        nameDuplicates.push({
          hex: nameGroup.map(c => c.hex).join(', '),
          names: nameGroup.map(g => g.name),
          selected: winner.name,
          reason: `${this.getSelectionReason(nameGroup, winner, priorityColors)} | NAME`
        })
      }
    }

    progress.processing()

    return {
      colors: finalResult,
      stats: hexDuplicates.concat(nameDuplicates)
    }
  }

  private selectBestName(group: ColorData[], priorityColors: ColorData[] = []): ColorData {
    const scores = group.map((color, idx) => ({
      score: this.calculateScore(color, group, idx, priorityColors),
      color
    }))

    scores.sort((a, b) => {
      return b.score - a.score
    })

    return scores[0].color
  }

  private calculateScore(color: ColorData, group: ColorData[], index: number, priorityColors: ColorData[] = []): number {
    let score = 0

    // 0. Priority bonus: 60% (highest priority)
    if (priorityColors.some(pc =>
      pc.hex.toLowerCase() === color.hex.toLowerCase() &&
      pc.name.toLowerCase() === color.name.toLowerCase()
    )) {
      score += 60
    }

    // 1. Semantic: 30% (reduced from 50%)
    const semanticScore = this.analyzer.scoreSemanticMatch(color)
    score += semanticScore * 0.3

    // 2. Uniqueness: 15% (reduced from 25%)
    let minDistance = Infinity
    for (const other of group) {
      if (other === color) continue
      const dist = StringMetrics.damerauLevenshtein(color.name, other.name)
      minDistance = Math.min(minDistance, dist)
    }
    score += Math.min(minDistance * 10, 100) * 0.15

    // 3. Length: 10% (reduced from 15%)
    const lengthScore = Math.max(0, 10 - Math.abs(color.name.length - 10))
    score += lengthScore * 0.1

    // 4. Priority: 5% (reduced from 10%)
    const priorityScore = (group.length - index) * 5
    score += priorityScore * 0.05

    return score
  }

  private getSelectionReason(group: ColorData[], winner: ColorData, priorityColors: ColorData[] = []): string {
    const reasons: string[] = []
    const names = group.map(g => g.name)

    // Check if winner is from priority dataset
    if (priorityColors.some(pc =>
      pc.hex.toLowerCase() === winner.hex.toLowerCase() &&
      pc.name.toLowerCase() === winner.name.toLowerCase()
    )) {
      reasons.push('Priority dataset')
    }

    if (names.includes('gray') && names.includes('grey')) {
      reasons.push('CSS standard')
    }

    const semanticScore = this.analyzer.scoreSemanticMatch(winner)
    if (semanticScore > 50) {
      reasons.push(`Semantic: ${Math.round(semanticScore)}`)
    }

    return reasons.join(' | ')
  }

  generateReport(colors: ColorData[]) {
    const { colors: deduped, stats } = this.deduplicate(colors)

    return {
      summary: {
        original: colors.length,
        deduplicated: deduped.length,
        removed: colors.length - deduped.length,
        removalRate: ((colors.length - deduped.length) / colors.length * 100).toFixed(1) + '%'
      },
      duplicates: stats,
      analysis: {
        byCategory: this.analyzeByCategory(deduped),
        semanticDistribution: this.analyzeSemantic(deduped)
      }
    }
  }

  private analyzeByCategory(colors: ColorData[]) {
    const categories: Record<string, number> = {}

    for (const color of colors) {
      const temp = this.colorMetrics.getTemperature(color.hsl!)
      categories[temp] = (categories[temp] || 0) + 1
    }

    return categories
  }

  private analyzeSemantic(colors: ColorData[]) {
    const distribution: Record<string, number> = {}

    for (const color of colors) {
      const semantics = this.analyzer.extractSemantics(color.name)
      const mainKernel = semantics.kernels[0] || 'unclassified'
      distribution[mainKernel] = (distribution[mainKernel] || 0) + 1
    }

    return distribution
  }
}
