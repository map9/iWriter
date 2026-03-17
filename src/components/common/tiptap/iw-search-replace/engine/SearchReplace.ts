/*
 * This code is modified from the code by sereneinserenade, with the specific URL as follows:
 * https://github.com/sereneinserenade/tiptap-search-and-replace/blob/main/src/searchAndReplace.ts
 * Modifications made by sunyafu:
 * - Add wholeWord support
 * - Remove the generation of decorations
 * - Add search range support
 */

// MIT License

// Copyright (c) 2023 - 2024 Jeet Mandaliya (Github Username: sereneinserenade)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Range } from '@tiptap/core'
import { buildSearchPattern } from '../utils/searchUtils';

interface TextSegment {
  text: string;
  pmPos: number;
}

interface SegmentOffset {
  textOffset: number;
  pmPos: number;
}

/**
 * 将合并文本中的偏移量映射回 ProseMirror 文档位置
 */
function textOffsetToPmPos(textOffset: number, segments: SegmentOffset[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!
    if (textOffset >= seg.textOffset) {
      return seg.pmPos + (textOffset - seg.textOffset)
    }
  }
  return 0
}

/**
 * 在 ProseMirror 文档中查找所有匹配项
 * 使用合并文本 + 位置映射的方式，支持跨段落的 \n 搜索
 */
export function findMatchesInDocument(
  doc: ProseMirrorNode,
  searchTerm: string,
  options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
  range?: { from: number; to: number }
): Range[] {
  if (!searchTerm) return []

  const pattern: RegExp = buildSearchPattern(searchTerm, options)
  const segments: TextSegment[] = []
  let currentSegment: TextSegment | null = null

  // 确定搜索范围
  const startPos = range?.from ?? 0
  const endPos = range?.to ?? doc.content.size

  doc?.descendants((node, pos) => {
    // 跳过范围外的节点
    if (range && (pos + node.nodeSize <= startPos || pos >= endPos)) {
      return false
    }

    if (node.isText) {
      if (currentSegment) {
        currentSegment.text += node.text
      } else {
        currentSegment = { text: `${node.text}`, pmPos: pos }
      }
    } else {
      if (currentSegment) {
        segments.push(currentSegment)
        currentSegment = null
      }
    }
  })
  if (currentSegment) segments.push(currentSegment)

  if (segments.length === 0) return []

  // 将所有段落用 \n 连接，并记录每段在合并字符串中的起始偏移
  const segmentOffsets: SegmentOffset[] = []
  let combined = ''
  for (const seg of segments) {
    if (combined.length > 0) combined += '\n'
    segmentOffsets.push({ textOffset: combined.length, pmPos: seg.pmPos })
    combined += seg.text
  }

  const results: Range[] = []
  const allMatches = Array.from(combined.matchAll(pattern))

  for (const m of allMatches) {
    if (m[0].length === 0 || m.index === undefined) continue

    const matchFrom = textOffsetToPmPos(m.index, segmentOffsets)
    const matchTo = textOffsetToPmPos(m.index + m[0].length, segmentOffsets)

    if (range) {
      if (matchFrom >= startPos && matchTo <= endPos) {
        results.push({ from: matchFrom, to: matchTo })
      }
    } else {
      results.push({ from: matchFrom, to: matchTo })
    }
  }

  return results
}