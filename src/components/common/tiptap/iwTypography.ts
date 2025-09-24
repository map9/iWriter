import { Extension } from '@tiptap/core'
import { iwTextInputRule, createIwTextInputRule } from './iwTextInputRule'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwTypography: {
      /**
       * 设置智能标点功能的启用状态
       * Set smart punctuation enable state
       */
      setSmartPunctuation: (enable: boolean) => ReturnType
      /**
       * 切换特定规则的启用状态
       * Toggle specific rule enable state
       */
      toggleTypographyRule: (ruleName: string, enable: boolean) => ReturnType
      /**
       * 获取所有规则的状态
       * Get all rules status
       */
      getTypographyRulesStatus: () => ReturnType
    }
  }
}

export interface iwTypographyOptions {
  /**
   * 全局启用状态
   * Global enable state
   */
  globalEnable?: boolean

  /**
   * The em dash character.
   * @default '—'
   */
  emDash?: false | string

  /**
   * The ellipsis character.
   * @default '…'
   */
  ellipsis?: false | string

  /**
   * The open double quote character.
   * @default '"'
   */
  openDoubleQuote?: false | string

  /**
   * The close double quote character.
   * @default '"'
   */
  closeDoubleQuote?: false | string

  /**
   * The open single quote character.
   * @default '''
   */
  openSingleQuote?: false | string

  /**
   * The close single quote character.
   * @default '''
   */
  closeSingleQuote?: false | string

  /**
   * The left arrow character.
   * @default '←'
   */
  leftArrow?: false | string

  /**
   * The right arrow character.
   * @default '→'
   */
  rightArrow?: false | string

  /**
   * The copyright character.
   * @default '©'
   */
  copyright?: false | string

  /**
   * The trademark character.
   * @default '™'
   */
  trademark?: false | string

  /**
   * The servicemark character.
   * @default '℠'
   */
  servicemark?: false | string

  /**
   * The registered trademark character.
   * @default '®'
   */
  registeredTrademark?: false | string

  /**
   * The one half character.
   * @default '½'
   */
  oneHalf?: false | string

  /**
   * The plus minus character.
   * @default '±'
   */
  plusMinus?: false | string

  /**
   * The not equal character.
   * @default '≠'
   */
  notEqual?: false | string

  /**
   * The laquo character.
   * @default '«'
   */
  laquo?: false | string

  /**
   * The raquo character.
   * @default '»'
   */
  raquo?: false | string

  /**
   * The multiplication character.
   * @default '×'
   */
  multiplication?: false | string

  /**
   * The superscript two character.
   * @default '²'
   */
  superscriptTwo?: false | string

  /**
   * The superscript three character.
   * @default '³'
   */
  superscriptThree?: false | string

  /**
   * The one quarter character.
   * @default '¼'
   */
  oneQuarter?: false | string

  /**
   * The three quarters character.
   * @default '¾'
   */
  threeQuarters?: false | string
}

/**
 * Enhanced Typography extension with dynamic enable/disable functionality
 * 支持动态启用/禁用功能的增强 Typography 扩展
 */
export const iwTypography = Extension.create<iwTypographyOptions>({
  name: 'iwTypography',

  addOptions() {
    return {
      globalEnable: true,
      closeDoubleQuote: '\u201D',
      closeSingleQuote: '\u2019',
      copyright: '\u00A9',
      ellipsis: '\u2026',
      emDash: '\u2014',
      laquo: '\u00AB',
      leftArrow: '\u2190',
      multiplication: '\u00D7',
      notEqual: '\u2260',
      oneHalf: '\u00BD',
      oneQuarter: '\u00BC',
      openDoubleQuote: '\u201C',
      openSingleQuote: '\u2018',
      plusMinus: '\u00B1',
      raquo: '\u00BB',
      registeredTrademark: '\u00AE',
      rightArrow: '\u2192',
      servicemark: '\u2120',
      superscriptThree: '\u00B3',
      superscriptTwo: '\u00B2',
      threeQuarters: '\u00BE',
      trademark: '\u2122',
    }
  },

  addStorage() {
    return {
      // 存储规则实例的引用
      ruleRegistry: new Map<string, iwTextInputRule>(),
    }
  },

  addInputRules() {
    const rules: iwTextInputRule[] = []
    const ruleRegistry = this.storage.ruleRegistry as Map<string, iwTextInputRule>

    // Em Dash: -- → —
    if (this.options.emDash !== false) {
      const rule = createIwTextInputRule({
        find: /--$/,
        replace: this.options.emDash || '\u2014',
        name: 'emDash',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('emDash', rule)
      rules.push(rule)
    }

    // Ellipsis: ... → …
    if (this.options.ellipsis !== false) {
      const rule = createIwTextInputRule({
        find: /\.\.\.$/,
        replace: this.options.ellipsis || '\u2026',
        name: 'ellipsis',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('ellipsis', rule)
      rules.push(rule)
    }

    // Open Double Quote: " → "
    if (this.options.openDoubleQuote !== false) {
      const rule = createIwTextInputRule({
        find: /(?:^|[\s{[(<'"\u2018\u201C])(")$/,
        replace: this.options.openDoubleQuote || '\u201C',
        name: 'openDoubleQuote',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('openDoubleQuote', rule)
      rules.push(rule)
    }

    // Close Double Quote: " → "
    if (this.options.closeDoubleQuote !== false) {
      const rule = createIwTextInputRule({
        find: /"$/,
        replace: this.options.closeDoubleQuote || '\u201D',
        name: 'closeDoubleQuote',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('closeDoubleQuote', rule)
      rules.push(rule)
    }

    // Open Single Quote: ' → '
    if (this.options.openSingleQuote !== false) {
      const rule = createIwTextInputRule({
        find: /(?:^|[\s{[(<'"\u2018\u201C])(')$/,
        replace: this.options.openSingleQuote || '\u2018',
        name: 'openSingleQuote',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('openSingleQuote', rule)
      rules.push(rule)
    }

    // Close Single Quote: ' → '
    if (this.options.closeSingleQuote !== false) {
      const rule = createIwTextInputRule({
        find: /'$/,
        replace: this.options.closeSingleQuote || '\u2019',
        name: 'closeSingleQuote',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('closeSingleQuote', rule)
      rules.push(rule)
    }

    // Left Arrow: <- → ←
    if (this.options.leftArrow !== false) {
      const rule = createIwTextInputRule({
        find: /<-$/,
        replace: this.options.leftArrow || '\u2190',
        name: 'leftArrow',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('leftArrow', rule)
      rules.push(rule)
    }

    // Right Arrow: -> → →
    if (this.options.rightArrow !== false) {
      const rule = createIwTextInputRule({
        find: /->$/,
        replace: this.options.rightArrow || '\u2192',
        name: 'rightArrow',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('rightArrow', rule)
      rules.push(rule)
    }

    // Copyright: (c) → ©
    if (this.options.copyright !== false) {
      const rule = createIwTextInputRule({
        find: /\(c\)$/,
        replace: this.options.copyright || '\u00A9',
        name: 'copyright',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('copyright', rule)
      rules.push(rule)
    }

    // Trademark: (tm) → ™
    if (this.options.trademark !== false) {
      const rule = createIwTextInputRule({
        find: /\(tm\)$/,
        replace: this.options.trademark || '\u2122',
        name: 'trademark',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('trademark', rule)
      rules.push(rule)
    }

    // Service Mark: (sm) → ℠
    if (this.options.servicemark !== false) {
      const rule = createIwTextInputRule({
        find: /\(sm\)$/,
        replace: this.options.servicemark || '\u2120',
        name: 'servicemark',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('servicemark', rule)
      rules.push(rule)
    }

    // Registered Trademark: (r) → ®
    if (this.options.registeredTrademark !== false) {
      const rule = createIwTextInputRule({
        find: /\(r\)$/,
        replace: this.options.registeredTrademark || '\u00AE',
        name: 'registeredTrademark',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('registeredTrademark', rule)
      rules.push(rule)
    }

    // One Half: 1/2 → ½
    if (this.options.oneHalf !== false) {
      const rule = createIwTextInputRule({
        find: /(?:^|\s)(1\/2)\s$/,
        replace: this.options.oneHalf || '\u00BD',
        name: 'oneHalf',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('oneHalf', rule)
      rules.push(rule)
    }

    // Plus Minus: +/- → ±
    if (this.options.plusMinus !== false) {
      const rule = createIwTextInputRule({
        find: /\+\/-$/,
        replace: this.options.plusMinus || '\u00B1',
        name: 'plusMinus',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('plusMinus', rule)
      rules.push(rule)
    }

    // Not Equal: != → ≠
    if (this.options.notEqual !== false) {
      const rule = createIwTextInputRule({
        find: /!=$/,
        replace: this.options.notEqual || '\u2260',
        name: 'notEqual',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('notEqual', rule)
      rules.push(rule)
    }

    // Laquo: << → «
    if (this.options.laquo !== false) {
      const rule = createIwTextInputRule({
        find: /<<$/,
        replace: this.options.laquo || '\u00AB',
        name: 'laquo',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('laquo', rule)
      rules.push(rule)
    }

    // Raquo: >> → »
    if (this.options.raquo !== false) {
      const rule = createIwTextInputRule({
        find: />>$/,
        replace: this.options.raquo || '\u00BB',
        name: 'raquo',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('raquo', rule)
      rules.push(rule)
    }

    // Multiplication: 2x3 → 2×3
    if (this.options.multiplication !== false) {
      const rule = createIwTextInputRule({
        find: /\d+\s?([*x])\s?\d+$/,
        replace: this.options.multiplication || '\u00D7',
        name: 'multiplication',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('multiplication', rule)
      rules.push(rule)
    }

    // Superscript Two: ^2 → ²
    if (this.options.superscriptTwo !== false) {
      const rule = createIwTextInputRule({
        find: /\^2$/,
        replace: this.options.superscriptTwo || '\u00B2',
        name: 'superscriptTwo',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('superscriptTwo', rule)
      rules.push(rule)
    }

    // Superscript Three: ^3 → ³
    if (this.options.superscriptThree !== false) {
      const rule = createIwTextInputRule({
        find: /\^3$/,
        replace: this.options.superscriptThree || '\u00B3',
        name: 'superscriptThree',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('superscriptThree', rule)
      rules.push(rule)
    }

    // One Quarter: 1/4 → ¼
    if (this.options.oneQuarter !== false) {
      const rule = createIwTextInputRule({
        find: /(?:^|\s)(1\/4)\s$/,
        replace: this.options.oneQuarter || '\u00BC',
        name: 'oneQuarter',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('oneQuarter', rule)
      rules.push(rule)
    }

    // Three Quarters: 3/4 → ¾
    if (this.options.threeQuarters !== false) {
      const rule = createIwTextInputRule({
        find: /(?:^|\s)(3\/4)\s$/,
        replace: this.options.threeQuarters || '\u00BE',
        name: 'threeQuarters',
        enable: this.options.globalEnable,
      })
      ruleRegistry.set('threeQuarters', rule)
      rules.push(rule)
    }

    return rules
  },

  addCommands() {
    return {
      setSmartPunctuation:
        (enable: boolean) =>
        () => {
          const ruleRegistry = this.storage.ruleRegistry as Map<string, iwTextInputRule>

          ruleRegistry.forEach(rule => {
            rule.setEnable(enable)
          })

          return true
        },

      toggleTypographyRule:
        (ruleName: string, enable: boolean) =>
        () => {
          const ruleRegistry = this.storage.ruleRegistry as Map<string, iwTextInputRule>
          const rule = ruleRegistry.get(ruleName)

          if (rule) {
            rule.setEnable(enable)
            return true
          }

          return false
        },

      getTypographyRulesStatus:
        () =>
        () => {
          const ruleRegistry = this.storage.ruleRegistry as Map<string, iwTextInputRule>
          const status: Record<string, boolean> = {}

          ruleRegistry.forEach((rule, name) => {
            status[name] = rule.getEnable()
          })

          console.log('Typography rules status:', status)
          return true
        },
    }
  },
})