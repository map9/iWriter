export type BuiltInMarkdownThemeId = 'system' | 'github' | 'github-dark' | 'prose' | 'novel'
export type MarkdownThemeId = string

export interface CustomThemeManifestPrint {
  pageSize?: PageSizeValue
  pageOrientation?: 'portrait' | 'landscape'
  marginMode?: 'single' | 'facing'
  marginTop?: string
  marginRight?: string
  marginBottom?: string
  marginLeft?: string
  marginInside?: string
  marginOutside?: string
  background?: boolean
  pageSideStart?: 'auto' | 'recto' | 'verso'
  paginationMode?: PaginationModePreset
  headerFooterEnabled?: boolean
  headerLeft?: string
  headerCenter?: string
  headerRight?: string
  footerLeft?: string
  footerCenter?: string
  footerRight?: string
  differentFirstPage?: boolean
  differentLeftRight?: boolean
  chapterSource?: 'none' | 'h1' | 'h2' | 'h3'
  sectionSource?: 'none' | 'h2' | 'h3' | 'h4'
}

export interface CustomThemeManifest {
  name: string
  description?: string
  version?: string
  author?: string
  print?: CustomThemeManifestPrint
  mermaid?: CustomThemeManifestMermaid
}

export type MarkdownMermaidColorScheme = 'light' | 'dark' | 'dynamic'

export interface MarkdownMermaidVariables {
  background: string
  primaryColor: string
  primaryTextColor: string
  primaryBorderColor: string
  secondaryColor: string
  tertiaryColor: string
  lineColor: string
  textColor: string
  [key: string]: string
}

export interface MarkdownMermaidTheme {
  colorScheme: MarkdownMermaidColorScheme
  variables: MarkdownMermaidVariables
}

export interface CustomThemeManifestMermaidSurface {
  colorScheme?: MarkdownMermaidColorScheme
  variables?: Partial<MarkdownMermaidVariables>
}

export interface CustomThemeManifestMermaid {
  screen?: CustomThemeManifestMermaidSurface
  print?: CustomThemeManifestMermaidSurface
}

export interface RawCustomTheme {
  id: string
  folderPath: string
  screenCss: string
  printCss: string
  manifest: CustomThemeManifest
  errors: string[]
}

export type MarginBoxSlot =
  | 'top-left-corner'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'top-right-corner'
  | 'left-top'
  | 'left-middle'
  | 'left-bottom'
  | 'right-top'
  | 'right-middle'
  | 'right-bottom'
  | 'bottom-left-corner'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-right-corner'

export interface ThemeTokens {
  bodyFontFamily?: string
  headingFontFamily?: string
  monoFontFamily?: string
  bodyColor?: string
  mutedColor?: string
  accentColor?: string
}

export type PageSizeValue =
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6'
  | 'A7'
  | 'A10'
  | 'B4'
  | 'B5'
  | 'Letter'
  | 'Legal'
  | 'Ledger'

export interface SinglePageMargins {
  top: string
  right: string
  bottom: string
  left: string
}

export interface FacingPageMargins {
  top: string
  bottom: string
  inside: string
  outside: string
}

export interface PageSetup {
  size: PageSizeValue
  orientation: 'portrait' | 'landscape'
  marginMode: 'single' | 'facing'
  margins: SinglePageMargins | FacingPageMargins
  pageSideStart: 'auto' | 'recto' | 'verso'
  background: boolean
}

export type PaginationModePreset = 'balanced' | 'compact' | 'strict-book'
export type PaginationMode = PaginationModePreset | 'custom'

export interface PaginationSetup {
  mode: PaginationMode
  keepWithNext: {
    headings: boolean
    figureCaption: boolean
    tableCaption: boolean
  }
  avoidBreakInside: {
    paragraph: boolean
    blockquote: boolean
    codeBlock: boolean
    table: boolean
    tableRow: boolean
    image: boolean
    listItem: boolean
  }
  widows: number | null
  orphans: number | null
  chapterStartSide: 'auto' | 'recto' | 'verso'
  blankPageBehavior: 'allow' | 'suppress-header-footer'
  /** Repeat the table header row on each page a table continues onto. */
  repeatTableHeader: boolean
}

export interface MarginBoxContent {
  template: string
  textAlign?: 'auto' | 'left' | 'center' | 'right'
}

export interface HeaderFooterSetup {
  enabled: boolean
  slots: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  firstPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  leftPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  rightPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  differentFirstPage: boolean
  differentLeftRight: boolean
}

export interface RunningTitleSetup {
  chapterSource: 'none' | 'h1' | 'h2' | 'h3'
  sectionSource: 'none' | 'h2' | 'h3' | 'h4'
}

export interface MarkdownTheme {
  id: MarkdownThemeId
  name: string
  description?: string
  tokens?: ThemeTokens
  screen: {
    css: string
    backgroundColor?: string
    mermaid: MarkdownMermaidTheme
  }
  print: {
    css: string
    mermaid: MarkdownMermaidTheme
    pageDefaults: PageSetup
    paginationDefaults: PaginationSetup
    headerFooterDefaults: HeaderFooterSetup
    runningTitleDefaults?: RunningTitleSetup
  }
}

export interface MarkdownThemeAssignment {
  screenThemeId: MarkdownThemeId
  printThemeId: MarkdownThemeId
  printUsesScreenTheme: boolean
}

export interface PageSetupOverrides extends Partial<Omit<PageSetup, 'margins'>> {
  margins?: SinglePageMargins | FacingPageMargins
}

export interface PaginationOverrides extends Partial<Omit<PaginationSetup, 'keepWithNext' | 'avoidBreakInside'>> {
  keepWithNext?: Partial<PaginationSetup['keepWithNext']>
  avoidBreakInside?: Partial<PaginationSetup['avoidBreakInside']>
}

export interface HeaderFooterOverrides extends Partial<Omit<HeaderFooterSetup, 'slots' | 'firstPageSlots' | 'leftPageSlots' | 'rightPageSlots'>> {
  slots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  firstPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  leftPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  rightPageSlots?: Partial<Record<MarginBoxSlot, MarginBoxContent>>
}

export interface MarkdownPrintOverrides {
  pageSetup?: PageSetupOverrides
  pagination?: PaginationOverrides
  headerFooter?: HeaderFooterOverrides
  runningTitle?: Partial<RunningTitleSetup>
}

export interface PrintThemeAssignmentOverride {
  printThemeId?: MarkdownThemeId
  printUsesScreenTheme?: boolean
}

export interface PrintRuntimeOverrides extends MarkdownPrintOverrides {
  themeAssignment?: PrintThemeAssignmentOverride
}

export interface MarkdownPrintPreferences {
  themeAssignment: MarkdownThemeAssignment
  printOverrides: MarkdownPrintOverrides
}

export interface ResolvedMarkdownPrintSettings {
  themeAssignment: MarkdownThemeAssignment
  pageSetup: PageSetup
  pagination: PaginationSetup
  headerFooter: HeaderFooterSetup
  runningTitle: RunningTitleSetup
}
