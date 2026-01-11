export class StringMetrics {
  static damerauLevenshtein(a: string, b: string): number {
    const aLen = a.length, bLen = b.length
    const maxDist = aLen + bLen
    const da = new Map<string, number>()

    let H = Array(aLen + 2).fill(null).map(() => Array(bLen + 2).fill(maxDist))

    for (let i = 0; i <= aLen; i++) {
      H[i + 1][0] = maxDist
      H[i + 1][1] = i
    }
    for (let j = 0; j <= bLen; j++) {
      H[0][j + 1] = maxDist
      H[1][j + 1] = j
    }

    for (let i = 1; i <= aLen; i++) {
      let db = 0

      for (let j = 1; j <= bLen; j++) {
        const i1 = da.get(b[j - 1]) || 0
        const j1 = db
        const cost = a[i - 1] === b[j - 1] ? 0 : 1

        if (cost === 0) db = j

        H[i + 1][j + 1] = Math.min(
          H[i][j + 1] + cost,
          H[i + 1][j] + 1,
          H[i][j] + 1,
          H[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
        )
      }

      da.set(a[i - 1], i)
    }

    return H[aLen + 1][bLen + 1]
  }
}
