export interface RendererTitleBarColors {
  backgroundColor?: string
  symbolColor?: string
}

export interface TitleBarOverlayColorOptions {
  prefersDark: boolean
  rendererColors?: RendererTitleBarColors
}

export interface ResolvedTitleBarOverlayColors {
  color: string
  symbolColor: string
}

const FALLBACK_DARK_BACKGROUND = '#1e1e1e'
const FALLBACK_LIGHT_BACKGROUND = '#f5f5f5'
const FALLBACK_DARK_SYMBOL = '#f5f5f5'
const FALLBACK_LIGHT_SYMBOL = '#1f2937'

function fallbackBackground(prefersDark: boolean): string {
  return prefersDark ? FALLBACK_DARK_BACKGROUND : FALLBACK_LIGHT_BACKGROUND
}

function fallbackSymbol(prefersDark: boolean): string {
  return prefersDark ? FALLBACK_DARK_SYMBOL : FALLBACK_LIGHT_SYMBOL
}

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
}

function linearSrgbToByte(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  const srgb = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return srgb * 255
}

function normalizeOklchColor(color: string): string | undefined {
  const oklch = /^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(color)
  if (!oklch) return undefined

  const lightness = Number(oklch[1])
  const lightnessScale = oklch[2] === '%' ? 100 : 1
  const chroma = Number(oklch[3])
  const hue = Number(oklch[4])
  const alphaRaw = oklch[5]
  const alpha = alphaRaw?.endsWith('%')
    ? Number(alphaRaw.slice(0, -1)) / 100
    : alphaRaw === undefined
      ? 1
      : Number(alphaRaw)

  if (![lightness, chroma, hue, alpha].every(Number.isFinite) || alpha <= 0) return undefined

  const l = lightness / lightnessScale
  const hueRadians = hue * Math.PI / 180
  const a = chroma * Math.cos(hueRadians)
  const b = chroma * Math.sin(hueRadians)

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.2914855480 * b

  const lCube = lPrime ** 3
  const mCube = mPrime ** 3
  const sCube = sPrime ** 3

  const red = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube
  const green = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube
  const blue = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.7076147010 * sCube

  return `#${toHexByte(linearSrgbToByte(red))}${toHexByte(linearSrgbToByte(green))}${toHexByte(linearSrgbToByte(blue))}`
}

function normalizeCssColor(color: string | undefined): string | undefined {
  const trimmed = color?.trim()
  if (!trimmed || trimmed === 'transparent') return undefined

  const oklch = normalizeOklchColor(trimmed)
  if (oklch) return oklch

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)
  if (hex) {
    const value = hex[1] ?? ''
    return value.length === 3
      ? `#${value.split('').map(char => `${char}${char}`).join('').toLowerCase()}`
      : `#${value.toLowerCase()}`
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(trimmed)
  if (!rgb) return undefined

  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
  if (!Number.isFinite(alpha) || alpha <= 0) return undefined

  return `#${toHexByte(Number(rgb[1]))}${toHexByte(Number(rgb[2]))}${toHexByte(Number(rgb[3]))}`
}

export function resolveTitleBarOverlayColors(options: TitleBarOverlayColorOptions): ResolvedTitleBarOverlayColors {
  return {
    color: normalizeCssColor(options.rendererColors?.backgroundColor) ?? fallbackBackground(options.prefersDark),
    symbolColor: normalizeCssColor(options.rendererColors?.symbolColor) ?? fallbackSymbol(options.prefersDark),
  }
}
