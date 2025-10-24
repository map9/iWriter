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

interface TextNodesWithPosition {
  text: string;
  pos: number;
}

/**
 * 在 ProseMirror 文档中查找所有匹配项
 */
export function findMatchesInDocument(
  doc: ProseMirrorNode,
  searchTerm: string,
  options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
  range?: { from: number; to: number }
): Range[] {
  if (!searchTerm) return []

  const pattern: RegExp = buildSearchPattern(searchTerm, options)
  let textNodesWithPosition: TextNodesWithPosition[] = []
  let index = 0
  const results: Range[] = [];

  // 确定搜索范围
  const startPos = range?.from ?? 0
  const endPos = range?.to ?? doc.content.size

  doc?.descendants((node, pos) => {
    // 跳过范围外的节点
    if (range && (pos + node.nodeSize <= startPos || pos >= endPos)) {
      return false // 跳过此节点及其子节点
    }

    if (node.isText) {
      if (textNodesWithPosition[index]) {
        textNodesWithPosition[index] = {
          text: textNodesWithPosition[index]!.text + node.text,
          pos: textNodesWithPosition[index]!.pos,
        }
      } else {
        textNodesWithPosition[index] = {
          text: `${node.text}`,
          pos,
        }
      }
    } else {
      index += 1;
    }
  });

  textNodesWithPosition = textNodesWithPosition.filter(Boolean);

  for (const element of textNodesWithPosition) {
    const { text, pos } = element;
    const matches = Array.from(text.matchAll(pattern)).filter(
      ([matchText]) => matchText.trim(),
    );

    for (const m of matches) {
      if (m[0] === "") break

      if (m.index !== undefined) {
        const matchFrom = pos + m.index
        const matchTo = matchFrom + m[0].length

        // 额外检查：确保匹配完全在范围内
        if (range) {
          if (matchFrom >= startPos && matchTo <= endPos) {
            results.push({
              from: matchFrom,
              to: matchTo,
            })
          }
        } else {
          results.push({
            from: matchFrom,
            to: matchTo,
          })
        }
      }
    }
  }

  return results
}