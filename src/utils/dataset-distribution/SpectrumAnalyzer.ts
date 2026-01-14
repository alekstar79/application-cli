import { ColorData, Family } from '@/types'

interface SpectrumBucket {
  hueMin: number;
  hueMax: number;
  colors: ColorData[];
  density: number;
  avgSaturation: number;
  avgLightness: number;
}

interface FamilyRange {
  minH: number;
  maxH: number;
  minS: number;
  maxS: number;
  minL: number;
  maxL: number;
}

interface SpectrumCoverage {
  buckets: Map<number, SpectrumBucket>;
  minHue: number;
  maxHue: number;
  families: Set<Family>;
  familyRanges: Map<Family, FamilyRange>
}

export class SpectrumAnalyzer {
  private readonly BUCKET_SIZE = 15 // 15° per bucket

  analyzeCoverage(colors: ColorData[]): SpectrumCoverage {
    const buckets = new Map<number, SpectrumBucket>()
    const families = new Set<Family>()
    const familyRanges = new Map<Family, FamilyRange>()

    // Initializing buckets
    for (let i = 0; i < 360; i += this.BUCKET_SIZE) {
      buckets.set(i, {
        hueMin: i,
        hueMax: i + this.BUCKET_SIZE,
        colors: [],
        density: 0,
        avgSaturation: 0,
        avgLightness: 0
      })
    }

    // Distributing colors among the buckets
    for (const color of colors) {
      const h = color.hsl.h
      const bucketKey = Math.floor(h / this.BUCKET_SIZE) * this.BUCKET_SIZE

      if (buckets.has(bucketKey)) {
        buckets.get(bucketKey)!.colors.push(color)
      }

      // Tracking families and their ranges
      families.add(color.family as Family)
      if (!familyRanges.has(color.family as Family)) {
        familyRanges.set(color.family as Family, {
          minH: h, maxH: h,
          minS: color.hsl.s, maxS: color.hsl.s,
          minL: color.hsl.l, maxL: color.hsl.l
        })
      } else {
        const range = familyRanges.get(color.family as Family)!
        range.minH = Math.min(range.minH, h)
        range.maxH = Math.max(range.maxH, h)
        range.minS = Math.min(range.minS, color.hsl.s)
        range.maxS = Math.max(range.maxS, color.hsl.s)
        range.minL = Math.min(range.minL, color.hsl.l)
        range.maxL = Math.max(range.maxL, color.hsl.l)
      }
    }

    // Calculating the density and the average value of S, L
    for (const bucket of buckets.values()) {
      bucket.density = bucket.colors.length

      if (bucket.colors.length > 0) {
        bucket.avgSaturation = bucket.colors
          .reduce((sum, c) => sum + c.hsl.s, 0) / bucket.colors.length
        bucket.avgLightness = bucket.colors
          .reduce((sum, c) => sum + c.hsl.l, 0) / bucket.colors.length
      }
    }

    return {
      buckets,
      minHue: Math.min(...Array.from(buckets.values())
        .filter(b => b.density > 0)
        .map(b => b.hueMin)),
      maxHue: Math.max(...Array.from(buckets.values())
        .filter(b => b.density > 0)
        .map(b => b.hueMax)),
      families,
      familyRanges
    }
  }

  getCriticalBuckets(coverage: SpectrumCoverage): SpectrumBucket[] {
    const buckets = Array.from(coverage.buckets.values()).filter(b => b.density > 0)
    const avgDensity = buckets.reduce((sum, b) => sum + b.density, 0) / buckets.length

    // Buckets with a density < 50% of the average = critical
    return buckets.filter(b => b.density < avgDensity * 0.5)
  }
}
