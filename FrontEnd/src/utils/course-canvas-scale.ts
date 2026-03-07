/**
 * 根据课程画布的实际可见尺寸计算每米对应的像素值。
 * 画布渲染使用宽高两个方向中更小的缩放比，这里必须保持一致，
 * 否则属性面板或编辑器中的尺寸换算会与画布实际显示不一致。
 */
export const getCourseCanvasMeterScale = (
  fieldWidth: number,
  fieldHeight: number,
  fallback = 1,
): number => {
  const canvas = document.querySelector('.course-canvas')
  if (!(canvas instanceof HTMLElement)) {
    return fallback
  }

  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height || !fieldWidth || !fieldHeight) {
    return fallback
  }

  const scaleByWidth = rect.width / fieldWidth
  const scaleByHeight = rect.height / fieldHeight

  return Math.min(scaleByWidth, scaleByHeight)
}

