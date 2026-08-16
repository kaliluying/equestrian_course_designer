import { describe, expect, it } from 'vitest'

import { SVGToCanvasConverter } from '../svgToCanvasConverter'

describe('SVGToCanvasConverter', () => {
  it('应根据路径坐标计算边界框', () => {
    const result = new SVGToCanvasConverter().parseSVGPath('M10 20 L30 40')

    expect(result.boundingBox).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 20,
    })
  })
})
