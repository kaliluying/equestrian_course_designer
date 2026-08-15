/**
 * 清洗用户提供的 SVG，只保留障碍物预览需要的静态元素和属性。
 * 不执行脚本、不加载外部资源，返回空字符串表示输入不是安全 SVG。
 */
export function sanitizeSvg(svg: string | null): string {
  if (!svg || svg.length > 200_000 || typeof DOMParser === 'undefined') return ''

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = document.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') return ''

  const allowedTags = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  ])
  const allowedAttributes = new Set([
    'viewbox', 'width', 'height', 'fill', 'fill-opacity', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'd', 'x', 'y',
    'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform',
  ])

  const nodes = Array.from(root.querySelectorAll('*'))
  for (const node of nodes) {
    if (!allowedTags.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (
        !allowedAttributes.has(name)
        || name.startsWith('on')
        || /url\s*\(|expression\s*\(|javascript:|data:/i.test(value)
      ) {
        node.removeAttribute(attribute.name)
      }
    }
  }

  for (const attribute of Array.from(root.attributes)) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value.trim()
    if (
      !allowedAttributes.has(name)
      || name.startsWith('on')
      || /url\s*\(|expression\s*\(|javascript:|data:/i.test(value)
    ) {
      root.removeAttribute(attribute.name)
    }
  }

  return new XMLSerializer().serializeToString(root)
}
