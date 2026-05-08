# Print Theme Spec

## Overview

`PrintPreviewDialog` will support a dedicated `printTheme` system for print layout and styling.

This feature is intentionally separate from the app's UI theme system. A print theme controls the printed document's CSS, including:

- page margin defaults
- header and footer styling
- body typography and spacing
- heading, code block, table, blockquote, and link presentation

## Goals

- Add a user-selectable print theme inside `PrintPreviewDialog`.
- Define each print theme primarily as CSS text rather than a structured style object.
- Keep print layout extensible for future paged-media features without repeatedly expanding TypeScript schema.
- Preserve existing runtime print controls such as paper size, orientation, page range, grayscale, and scale.
- Preserve the existing odd/even/custom page-number fix in preview and final print output.

## Non-Goals

- Reusing the existing app UI theme (`ThemeOption`) for print.
- Implementing a full user-editable custom theme editor in this phase.
- Supporting arbitrary dynamic page-number placement beyond the initial MVP behavior.

## Data Model

Print themes use a lightweight wrapper around CSS:

```ts
export interface PrintThemeDefinition {
  id: string
  name: string
  description?: string
  css: string
}
```

Notes:

- `css` is the primary styling payload.
- `id` and `name` are used for UI selection and defaults.
- Themes remain independent from the app's UI theme model.

## CSS Composition Model

Final print CSS is composed in three layers:

1. `basePrintCss`
Contains stable shared defaults and normalization rules used by every print theme.

2. `selectedPrintTheme.css`
Contains the theme's actual paged-media and content styling.

3. `dialogOverrideCss`
Contains runtime overrides from `PrintPreviewDialog`, such as:
- paper size
- orientation
- margin override
- grayscale
- content scale
- optional header/footer disable switch

Final CSS:

```ts
const finalCss = [
  basePrintCss,
  selectedTheme.css,
  dialogOverrideCss,
].join('\n')
```

## Dynamic Tokens

Themes are CSS-based, but a small token system is supported for runtime values.

Initial tokens:

- `__IW_DOCUMENT_TITLE__`
- `__IW_PRINT_DATE__`
- `__IW_PAGE_NUMBER__`

### Token Behavior

`__IW_DOCUMENT_TITLE__`
- Replaced during CSS build with the current document title.

`__IW_PRINT_DATE__`
- Replaced during CSS build with the current print date string.

`__IW_PAGE_NUMBER__`
- Placeholder for page numbers.
- Supported in paged-media margin boxes such as `@top-left`, `@top-center`, `@top-right`, `@bottom-left`, `@bottom-center`, and `@bottom-right`.
- During CSS build, it is replaced with a placeholder margin-box content so paged.js creates the target box.
- After pagination and page filtering, preview code rewrites the footer to preserve original page numbers for odd/even/custom ranges.

## Header and Footer Behavior

Themes may define header/footer in CSS using paged-media margin boxes such as:

- `@top-left`
- `@top-center`
- `@top-right`
- `@bottom-left`
- `@bottom-center`
- `@bottom-right`

Behavior:

- static header/footer text is fully theme-defined in CSS
- document title and date can be inserted with tokens
- page number correction remains program-controlled and follows the actual margin-box location where the token is used
- the existing dialog checkbox can temporarily disable themed header/footer rendering

## Built-In Themes

Initial implementation should ship with a small built-in set:

- `default`
- `novel`
- `minimal`

Each theme should demonstrate different typography and header/footer treatment while remaining print-safe.

## UI Changes

Inside `PrintPreviewDialog`, add a new setting:

- label: `打印主题`
- control: select dropdown

Initial options:

- 默认
- 小说
- 极简

MVP state can remain local to the dialog. Persisting the last selected print theme is optional and can come later.

## Document Title Source

The print preview flow should pass the active document title into `PrintPreviewDialog` so theme tokens can use it.

## Implementation Plan

1. Add this spec document.
2. Introduce `printThemes.ts` with built-in theme definitions.
3. Introduce CSS builder helpers for:
- token replacement
- base CSS
- theme CSS
- runtime override CSS
4. Add theme selection to `PrintPreviewDialog`.
5. Pass document title into print preview state.
6. Keep existing preview page-number correction logic and adapt it so it only runs when the selected theme uses the page-number token.

## Risks and Constraints

- paged.js margin-box behavior is sensitive; CSS generation should remain deterministic.
- Runtime dialog overrides must stay later in the cascade than theme CSS.
- Page-number correction must continue to work after odd/even/custom page filtering.
- Since themes are CSS-first, the system should avoid turning theme definitions back into a large structured print-style object.

## MVP Acceptance Criteria

- User can choose a print theme in `PrintPreviewDialog`.
- Preview and print output reflect the selected theme CSS.
- Theme CSS can affect page margin defaults, header/footer, and content styling.
- Document title token works in theme CSS.
- Print date token works in theme CSS.
- Page-number token continues to produce correct original page numbers for odd/even/custom page selections.
- Existing runtime print options still function.
