const IMAGE_URL_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-actualsrc',
  'data-url',
  'data-image',
]

const IMAGE_SRCSET_ATTRIBUTES = [
  'data-srcset',
  'srcset',
]

const IMAGE_URL_PATTERN = /https?:\/\/[^\s"'<>\\)]+/gi
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((https?:\/\/[^\s"'<>\\)]+)(?:\s+["'][^"']*["'])?\)/gi

function decodeHtmlEntities(value: string): string {
  if (!value.includes('&')) return value

  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

function normalizeImageUrl(value: string | null): string | null {
  const normalized = value ? decodeHtmlEntities(value.trim()) : ''
  if (!normalized) return null

  if (normalized.startsWith('//')) {
    return `https:${normalized}`
  }

  const lowerNormalized = normalized.toLowerCase()
  if (
    lowerNormalized.startsWith('http://') ||
    lowerNormalized.startsWith('https://') ||
    lowerNormalized.startsWith('file://') ||
    lowerNormalized.startsWith('data:image/')
  ) {
    return normalized
  }

  return null
}

function looksLikeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const inspectable = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase()

    return (
      /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|image)(?:$|[?#/:])/i.test(inspectable) ||
      /(?:^|[/?&=:._-])(?:imagex?|img|photo|pic|thumbnail|thumb|tplv-|x-signature|x-expires)(?:$|[/?&=:._-])/i.test(inspectable)
    )
  } catch {
    return false
  }
}

function extractImageUrlFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null

  const candidates = srcset
    .split(',')
    .map(item => item.trim().split(/\s+/)[0] ?? null)
    .map(normalizeImageUrl)
    .filter((url): url is string => !!url)

  return candidates.length > 0 ? candidates[candidates.length - 1] ?? null : null
}

function extractImageUrlFromClosestPicture(element: HTMLElement): string | null {
  const picture = element.closest('picture')
  if (!picture) return null

  const sources = Array.from(picture.querySelectorAll('source'))
  for (const source of sources) {
    for (const attr of IMAGE_SRCSET_ATTRIBUTES) {
      const url = extractImageUrlFromSrcset(source.getAttribute(attr))
      if (url && !isPlaceholderSvgImageUrl(url)) {
        return url
      }
    }
  }

  return null
}

function extractImageUrlFromClosestLink(element: HTMLElement): string | null {
  const link = element.closest('a[href]')
  const href = normalizeImageUrl(link?.getAttribute('href') ?? null)

  if (href && !isPlaceholderSvgImageUrl(href) && looksLikeImageUrl(href)) {
    return href
  }

  return null
}

export function isPlaceholderSvgImageUrl(url: string): boolean {
  if (!url.toLowerCase().startsWith('data:image/svg+xml')) return false

  let decoded = url
  try {
    decoded = decodeURIComponent(url)
  } catch {
    // Malformed percent encoding should not block regular paste handling.
  }

  if (!decoded.includes('<svg')) return false

  return !/<(?:image|path|rect|circle|ellipse|line|polyline|polygon|text)\b/i.test(decoded)
}

export function extractBestImageUrl(element: HTMLElement): string | null {
  for (const attr of IMAGE_URL_ATTRIBUTES) {
    const url = normalizeImageUrl(element.getAttribute(attr))
    if (url && !isPlaceholderSvgImageUrl(url)) {
      return url
    }
  }

  const pictureUrl = extractImageUrlFromClosestPicture(element)
  if (pictureUrl) {
    return pictureUrl
  }

  for (const attr of IMAGE_SRCSET_ATTRIBUTES) {
    const url = extractImageUrlFromSrcset(element.getAttribute(attr))
    if (url && !isPlaceholderSvgImageUrl(url)) {
      return url
    }
  }

  const src = normalizeImageUrl(element.getAttribute('src'))
  if (src && !isPlaceholderSvgImageUrl(src)) {
    return src
  }

  const linkedUrl = extractImageUrlFromClosestLink(element)
  if (linkedUrl) {
    return linkedUrl
  }

  return null
}

function extractImageUrlFromText(text: string): string | null {
  const decoded = decodeHtmlEntities(text)

  for (const match of decoded.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const url = normalizeImageUrl(match[1] ?? null)
    if (url && !isPlaceholderSvgImageUrl(url)) return url
  }

  for (const match of decoded.matchAll(IMAGE_URL_PATTERN)) {
    const url = normalizeImageUrl(match[0])
    if (url && !isPlaceholderSvgImageUrl(url) && looksLikeImageUrl(url)) return url
  }

  return null
}

export function extractBestImageUrlFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  for (const image of images) {
    const url = extractBestImageUrl(image)
    if (url) return url
  }

  const noscripts = Array.from(doc.querySelectorAll('noscript'))
  for (const noscript of noscripts) {
    const url = extractBestImageUrlFromHtml(noscript.textContent ?? '')
    if (url) return url
  }

  const sources = Array.from(doc.querySelectorAll('source'))
  for (const source of sources) {
    for (const attr of IMAGE_SRCSET_ATTRIBUTES) {
      const url = extractImageUrlFromSrcset(source.getAttribute(attr))
      if (url && !isPlaceholderSvgImageUrl(url)) return url
    }
  }

  const textUrl = extractImageUrlFromText(html)
  if (textUrl) return textUrl

  return null
}

function unwrapStandaloneImageParagraphs(doc: Document): boolean {
  let changed = false
  const paragraphs = Array.from(doc.body.querySelectorAll('p'))

  for (const paragraph of paragraphs) {
    const childElements = Array.from(paragraph.children)
    const onlyElement = childElements[0]
    if (childElements.length !== 1 || onlyElement?.tagName.toLowerCase() !== 'img') {
      continue
    }

    const nonImageText = Array.from(paragraph.childNodes)
      .filter(node => node !== onlyElement)
      .map(node => node.textContent ?? '')
      .join('')

    if (nonImageText.trim()) {
      continue
    }

    paragraph.replaceWith(onlyElement)
    changed = true
  }

  return changed
}

export function normalizePastedImageHtml(html: string): string {
  if (!/<img\b/i.test(html)) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const fallbackUrl = extractBestImageUrlFromHtml(html)
  const images = Array.from(doc.querySelectorAll('img'))
  let changed = false

  for (const image of images) {
    const currentSrc = image.getAttribute('src')
    const url = extractBestImageUrl(image)

    if (url && currentSrc !== url) {
      image.setAttribute('src', url)
      changed = true
      continue
    }

    if (currentSrc && isPlaceholderSvgImageUrl(currentSrc)) {
      if (fallbackUrl && images.length === 1) {
        image.setAttribute('src', fallbackUrl)
      } else {
        image.remove()
      }
      changed = true
    }
  }

  changed = unwrapStandaloneImageParagraphs(doc) || changed

  return changed ? doc.body.innerHTML : html
}
