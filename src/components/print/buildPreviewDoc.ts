// Relative path bypasses pagedjs's package.json "exports" field restriction —
// the self-contained ESM bundle is needed (not src/index.js which re-exports).
// The ?raw query is processed at BUILD TIME by Vite; the content is embedded as
// a string literal in the bundle. Packaged Electron apps never access node_modules
// at runtime, so this import is safe for production.
import pagedJsRaw from '../../../node_modules/pagedjs/dist/paged.esm.js?raw'

// media="screen" is critical: pagedjs's removeStyles() skips <style media~="screen"> elements,
// so these visual-only rules stay in the DOM via normal cascade without being processed by pagedjs.
const PREVIEW_STYLES = 
`:root {
  --color-mbox : rgba(0,0,0,0.2);
  --margin: 4px;
  --background: #fdfdfd;
}

#paged-preview-root {
  display: inline-block;
  padding: calc(var(--margin) * 4) var(--margin);
  box-sizing: content-box;
}

.pagedjs_page {
  background-color: var(--background);
  margin: 0;
  flex: none;
  box-shadow: 0 0 4px var(--color-mbox);
}

.pagedjs_pages {
  width: calc((var(--width) * 2) + (var(--margin) * 4));
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  column-gap: calc(var(--margin) * 2);
  row-gap: calc(var(--margin) * 8);
  transform-origin: 0 0;
  margin: 0;
}

.pps_pages_container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--margin) * 8) calc(var(--margin) * 2);
  box-sizing: border-box;
  background: transparent;
}

.pps_pages_sheet {
  display: grid;
  background: var(--background);
  box-shadow: 0 0 4px var(--color-mbox);
  overflow: hidden;
  break-after: page;
  page-break-after: always;
  margin: 0 auto;
}

.pps_pages_cell {
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  background: var(--background);
}
`

// preview() is called with null stylesheets so pagedjs calls its own removeStyles(),
// which collects all <style> elements NOT filtered by [media~="screen"] or [data-pagedjs-ignore].
// The printCss <style> (no media attribute) is picked up, @page { size; margin } is processed,
// and PREVIEW_STYLES <style media="screen"> is left untouched in the DOM.
function buildRunner(options: {
  pagesPerSheet: number
  orientation: 'portrait' | 'landscape'
  pageSelectionMode: 'all' | 'odd' | 'even' | 'custom'
  selectedPages: number[] | null
  contentScale: number
  enablePageNumberFix: boolean
  pageNumberMarginBoxes: string[]
}): string {
  const serializedOptions = JSON.stringify(options)
  return `;(async () => {
  try {
    const previewOptions = ${serializedOptions};
    const bodyContent = '<div class="iw-print-scale-root">' + document.body.innerHTML + '</div>';
    document.body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.id = 'paged-preview-root';
    document.body.appendChild(wrapper);
    const previewer = new Previewer();
    const result = await previewer.preview(bodyContent, null, wrapper);

    var totalPages = result.total ?? 0;

    var shouldKeepPage = function(page, selectedPages, selectionMode) {
      if (selectionMode === 'odd') {
        return page.classList.contains('pagedjs_right_page');
      }
      if (selectionMode === 'even') {
        return page.classList.contains('pagedjs_left_page');
      }
      if (selectionMode === 'custom') {
        if (!Array.isArray(selectedPages) || !selectedPages.length) return true;
        var keep = new Set(selectedPages.map(function(n) { return String(n); }));
        var pageNumber = page.dataset.pageNumber;
        if (!pageNumber) return false;
        return keep.has(pageNumber);
      }
      return true;
    };

    var filterPages = function(selectedPages, selectionMode) {
      if (selectionMode === 'all') return;
      var pages = Array.from(document.querySelectorAll('.pagedjs_page'));
      pages.forEach(function(page) {
        if (!shouldKeepPage(page, selectedPages, selectionMode)) {
          page.parentNode && page.parentNode.removeChild(page);
        }
      });
      totalPages = document.querySelectorAll('.pagedjs_page').length;
    };
    filterPages(previewOptions.selectedPages, previewOptions.pageSelectionMode);

    var syncFooterPageNumbers = function(originalTotal, marginBoxes) {
      var existingStyle = document.querySelector('style[data-iw-footer-page-numbers]');
      if (existingStyle && existingStyle.parentNode) {
        existingStyle.parentNode.removeChild(existingStyle);
      }

      var pages = Array.from(document.querySelectorAll('.pagedjs_page'));
      if (!pages.length || !originalTotal || !Array.isArray(marginBoxes) || !marginBoxes.length) return;

      var cssRules = pages.map(function(page) {
        var pageNumber = page.dataset.pageNumber;
        if (!pageNumber) return '';
        var footerText = JSON.stringify(pageNumber + '/' + originalTotal);
        return marginBoxes.map(function(box) {
          return '[data-page-number="' + pageNumber + '"] .pagedjs_margin-' + box + ' > .pagedjs_margin-content::after { content: ' + footerText + ' !important; }';
        }).join('');
      }).filter(Boolean).join('');

      if (!cssRules) return;

      var style = document.createElement('style');
      style.setAttribute('data-iw-footer-page-numbers', 'true');
      style.textContent = cssRules;
      document.head.appendChild(style);
    };
    if (previewOptions.enablePageNumberFix) {
      syncFooterPageNumbers(result.total ?? 0, previewOptions.pageNumberMarginBoxes);
    }

    // Rearranges individual pagedjs pages into N-up sheet groups after rendering.
    // Runs as inline JS inside the iframe after pagedjs.preview() resolves.
    var getGrid = function(pps, orientation) {
      if (pps === 2) return orientation === 'portrait' ? { rows: 1, cols: 2 } : { rows: 2, cols: 1 };
      if (pps === 4) return { rows: 2, cols: 2 };
      if (pps === 6) return orientation === 'portrait' ? { rows: 2, cols: 3 } : { rows: 3, cols: 2 };
      if (pps === 9) return { rows: 3, cols: 3 };
      return { rows: 1, cols: 1 };
    };

    var injectSheetPageStyle = function(sheetWidth, sheetHeight) {
      var style = document.createElement('style');
      style.setAttribute('data-iw-sheet-style', 'true');
      style.textContent =
        '@media print {' +
        '@page { size: ' + sheetWidth + 'px ' + sheetHeight + 'px; margin: 0; }' +
        '.pps_pages_container { display: flex !important; flex-direction: column !important; align-items: center !important; width: ' + sheetWidth + 'px !important; }' +
        '.pps_pages_sheet { display: grid !important; width: ' + sheetWidth + 'px !important; height: ' + sheetHeight + 'px !important; margin: 0 !important; box-shadow: none !important; overflow: hidden !important; }' +
        '.pps_pages_sheet:last-child { break-after: auto; page-break-after: auto; }' +
        '.pps_pages_cell { position: relative !important; overflow: hidden !important; }' +
        '.pps_pages_cell > .pagedjs_page {' +
        'box-shadow: none !important;' +
        'margin: 0 !important;' +
        'height: auto !important;' +
        'min-height: 0 !important;' +
        'max-height: none !important;' +
        'break-after: auto !important;' +
        'page-break-after: auto !important;' +
        '}' +
        '.pps_pages_cell > .pagedjs_page > .pagedjs_sheet {' +
        'height: auto !important;' +
        'min-height: 0 !important;' +
        'max-height: none !important;' +
        '}' +
        '}';
      document.head.appendChild(style);
    };

    var buildNUpLayout = function (pps, orientation) {
      if (pps <= 1) return;
      var pages = Array.from(document.querySelectorAll('.pagedjs_page'));
      if (!pages.length) return;
      var container = pages[0].closest('.pagedjs_pages');
      if (!container) return;
      var pageW = pages[0].offsetWidth, pageH = pages[0].offsetHeight;
      var grid = getGrid(pps, orientation);
      var rows = grid.rows, cols = grid.cols;
      var logicalLandscape = orientation === 'landscape';
      var sheetLandscape = (pps === 2 || pps === 6 ) ? !logicalLandscape : logicalLandscape;
      var sheetW = sheetLandscape ? Math.max(pageW, pageH) : Math.min(pageW, pageH);
      var sheetH = sheetLandscape ? Math.min(pageW, pageH) : Math.max(pageW, pageH);
      var cellW = Math.floor(sheetW / cols), cellH = Math.floor(sheetH / rows);
      var scale = Math.min(cellW / pageW, cellH / pageH);
      var scaledPageW = pageW * scale, scaledPageH = pageH * scale;
      var offsetX = Math.max((cellW - scaledPageW) / 2, 0);
      var offsetY = Math.max((cellH - scaledPageH) / 2, 0);
      pages.forEach(function (p) { p.parentNode && p.parentNode.removeChild(p); });
      container.classList.add('pps_pages_container');
      container.style.width = sheetW + 'px';
      var i = 0;
      while (i < pages.length) {
        var sheet = document.createElement('div');
        sheet.className = 'pps_pages_sheet';
        sheet.style.cssText =
          'width:' + sheetW + 'px;' +
          'height:' + sheetH + 'px;' +
          'grid-template-columns:repeat(' + cols + ',1fr);' +
          'grid-template-rows:repeat(' + rows + ',1fr);';
        for (var j = 0; j < pps; j ++) {
          var cell = document.createElement('div');
          cell.className = 'pps_pages_cell';
          cell.style.cssText = 'width:' + cellW + 'px;height:' + cellH + 'px;';
          if (i + j < pages.length) {
            var page = pages[i + j];
            page.style.transformOrigin = '0 0';
            page.style.transform = 'scale(' + scale + ')';
            page.style.position = 'absolute';
            page.style.top = offsetY + 'px';
            page.style.left = offsetX + 'px';
            page.style.breakAfter = 'auto';
            page.style.pageBreakAfter = 'auto';
            cell.appendChild(page);
          }
          sheet.appendChild(cell);
        }
        container.appendChild(sheet);
        i += pps;
      }
      injectSheetPageStyle(sheetW, sheetH);
    };
    buildNUpLayout(previewOptions.pagesPerSheet, previewOptions.orientation);
    totalPages = document.querySelectorAll('.pagedjs_page').length;
    
    var lastMetrics = null;
    var collectMetrics = function() {
      return {
        width: document.documentElement.scrollWidth || 0,
        height: document.documentElement.scrollHeight || 0,
      };
    };
    var notifyMetrics = function(type) {
      var metrics = collectMetrics();
      var payload = {
        type: type,
        total: totalPages,
        originalTotal: result.total ?? 0,
        scrollWidth: metrics.width,
        scrollHeight: metrics.height,
      };
      var serialized = JSON.stringify(payload);
      if (type !== 'paged-ready' && serialized === lastMetrics) return;
      lastMetrics = serialized;
      window.parent.postMessage(payload, '*');
    };
    var scheduleMetrics = function() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          notifyMetrics('paged-metrics');
        });
      });
    };
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(scheduleMetrics);
      var pagesRoot = document.querySelector('.pagedjs_pages');
      if (pagesRoot) ro.observe(pagesRoot);
    }
    var mo = new MutationObserver(scheduleMetrics);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('load', scheduleMetrics, { once: true });
    requestAnimationFrame(function() {
      notifyMetrics('paged-ready');
    });
  } catch (err) {
    window.parent.postMessage({ type: 'paged-error', error: String(err) }, '*');
  }
})();`
}

/**
 * Builds a self-contained HTML document for the iframe preview.
 * All pagedjs style injections stay inside the iframe's own document.head,
 * so the main app's styles are never affected.
 *
 * Style tag layout:
 *   <style media="screen"> PREVIEW_STYLES </style>   ← pagedjs skips (media filter)
 *   <style>                printCss       </style>   ← pagedjs removeStyles() picks this up
 */
export function buildPreviewDocument(html: string, printCss: string, pagesPerSheet = 1): string {
  const options = {
    pagesPerSheet,
    orientation: 'portrait' as const,
    pageSelectionMode: 'all' as const,
    selectedPages: null as number[] | null,
    contentScale: 1,
    enablePageNumberFix: false,
    pageNumberMarginBoxes: [] as string[],
  }
  return buildPreviewDocumentWithOptions(html, printCss, options)
}

export function buildPreviewDocumentWithOptions(
  html: string,
  printCss: string,
  options: {
    pagesPerSheet?: number
    orientation?: 'portrait' | 'landscape'
    pageSelectionMode?: 'all' | 'odd' | 'even' | 'custom'
    selectedPages?: number[] | null
    contentScale?: number
    enablePageNumberFix?: boolean
    pageNumberMarginBoxes?: string[]
  } = {},
): string {
  // Prevent any </script sequences in user HTML from breaking the iframe document
  const safeHtml = html.split('</script').join('<\\/script')

  // In a plain .ts file (no SFC parser) these strings are just strings
  const TAG_OPEN = '<script type="module">'
  const TAG_CLOSE = '</script>'

  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<style media="screen">', PREVIEW_STYLES, '</style>',
    '<style>', printCss, '</style>',
    '</head><body>',
    safeHtml,
    TAG_OPEN, '\n', pagedJsRaw, '\n', buildRunner({
      pagesPerSheet: options.pagesPerSheet ?? 1,
      orientation: options.orientation ?? 'portrait',
      pageSelectionMode: options.pageSelectionMode ?? 'all',
      selectedPages: options.selectedPages ?? null,
      contentScale: options.contentScale ?? 1,
      enablePageNumberFix: options.enablePageNumberFix ?? false,
      pageNumberMarginBoxes: options.pageNumberMarginBoxes ?? [],
    }), '\n', TAG_CLOSE,
    '</body></html>',
  ].join('')
}
