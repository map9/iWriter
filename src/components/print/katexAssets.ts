import katexCssRaw from 'katex/dist/katex.min.css?raw'

import f_AMS_Regular from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'
import f_Cal_Bold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline'
import f_Cal_Regular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'
import f_Fraktur_Bold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline'
import f_Fraktur_Regular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline'
import f_Main_Bold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'
import f_Main_BoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'
import f_Main_Italic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'
import f_Main_Regular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'
import f_Math_BoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'
import f_Math_Italic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'
import f_SansSerif_Bold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline'
import f_SansSerif_Italic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline'
import f_SansSerif_Regular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'
import f_Script_Regular from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?inline'
import f_Size1_Regular from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'
import f_Size2_Regular from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'
import f_Size3_Regular from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline'
import f_Size4_Regular from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline'
import f_Typewriter_Regular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline'

const FONT_MAP: Record<string, string> = {
  'KaTeX_AMS-Regular': f_AMS_Regular,
  'KaTeX_Caligraphic-Bold': f_Cal_Bold,
  'KaTeX_Caligraphic-Regular': f_Cal_Regular,
  'KaTeX_Fraktur-Bold': f_Fraktur_Bold,
  'KaTeX_Fraktur-Regular': f_Fraktur_Regular,
  'KaTeX_Main-Bold': f_Main_Bold,
  'KaTeX_Main-BoldItalic': f_Main_BoldItalic,
  'KaTeX_Main-Italic': f_Main_Italic,
  'KaTeX_Main-Regular': f_Main_Regular,
  'KaTeX_Math-BoldItalic': f_Math_BoldItalic,
  'KaTeX_Math-Italic': f_Math_Italic,
  'KaTeX_SansSerif-Bold': f_SansSerif_Bold,
  'KaTeX_SansSerif-Italic': f_SansSerif_Italic,
  'KaTeX_SansSerif-Regular': f_SansSerif_Regular,
  'KaTeX_Script-Regular': f_Script_Regular,
  'KaTeX_Size1-Regular': f_Size1_Regular,
  'KaTeX_Size2-Regular': f_Size2_Regular,
  'KaTeX_Size3-Regular': f_Size3_Regular,
  'KaTeX_Size4-Regular': f_Size4_Regular,
  'KaTeX_Typewriter-Regular': f_Typewriter_Regular,
}

// Replace relative woff2 font URLs with inline data URIs, then strip the woff
// and ttf fallback entries. Leaving relative paths causes pagedjs to call
// new URL(href, blobBase) which throws "Invalid URL" in blob-URL iframes.
export const KATEX_INLINE_CSS: string = katexCssRaw
  .replace(
    /url\(fonts\/(KaTeX_[\w-]+)\.woff2\)/g,
    (match, name: string) => {
      const dataUri = FONT_MAP[name]
      return dataUri ? `url(${dataUri})` : match
    },
  )
  .replace(/,url\(fonts\/KaTeX_[\w-]+\.(?:woff|ttf)\) format\("[^"]*"\)/g, '')
