declare module '@guyplusplus/turndown-plugin-gfm' {
  import TurndownService from 'turndown';

  /**
   * 插件函数：代码块高亮（如 highlight-source-js）
   */
  export function highlightedCodeBlock(turndownService: TurndownService): void;

  /**
   * 插件函数：删除线支持（<del>、<s>、<strike>）
   */
  export function strikethrough(turndownService: TurndownService): void;

  /**
   * 插件函数：GitHub 风格的表格支持
   */
  export function tables(turndownService: TurndownService): void;

  /**
   * 插件函数：任务列表项支持（task list items）
   */
  export function taskListItems(turndownService: TurndownService): void;

  /**
   * 安装全部 GFM 插件（推荐方式）
   */
  export function gfm(turndownService: TurndownService): void;
}
