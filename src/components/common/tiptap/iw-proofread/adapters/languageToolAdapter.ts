import type {
	SpellError
} from '../core/nodeTypes.js';

/**
 * LanguageTool API 配置
 */
export interface LanguageToolConfig {
	/**
	 * LanguageTool API 端点
	 * @default 'https://api.languagetool.org/v2/check'
	 */
	apiUrl?: string;
	/**
	 * 检查语言
	 * @default 'en-US'
	 */
	language?: string;
	/**
	 * API 密钥（付费用户）
	 */
	apiKey?: string;
	/**
	 * 请求超时时间（毫秒）
	 * @default 10000
	 */
	timeout?: number;
	/**
	 * 是否启用调试模式
	 */
	debug?: boolean;
	/**
	 * 自定义 fetch 函数
	 */
	customFetch?: typeof fetch;
	/**
	 * 额外的请求头
	 */
	headers?: Record<string, string>;
	/**
	 * 禁用的规则ID列表
	 */
	disabledRules?: string[];
	/**
	 * 启用的规则ID列表
	 */
	enabledRules?: string[];
}

/**
 * LanguageTool API 响应接口
 */
interface LanguageToolResponse {
	matches: LanguageToolMatch[];
}

interface LanguageToolMatch {
	offset: number;
	length: number;
	message: string;
	shortMessage?: string;
	rule: {
		id: string;
		description: string;
		category: {
			id: string;
			name: string;
		};
	};
	type: {
		typeName: string;
	};
	replacements: Array<{
		value: string;
		shortDescription?: string;
	}>;
}

/**
 * 创建 LanguageTool 适配器
 */
export function createLanguageToolAdapter(config: LanguageToolConfig = {}) {
	const {
		apiUrl = 'https://api.languagetool.org/v2/check',
		language = 'en-US',
		apiKey,
		timeout = 10000,
		debug = false,
		customFetch = fetch,
		headers = {},
		disabledRules = [],
		enabledRules = []
	} = config;

	return async (text: string): Promise<{ matches: SpellError[] }> => {
		try {
			if (debug) {
				console.log('LanguageTool checking text:', text);
			}

			// 准备请求参数
			const params = new URLSearchParams({
				language,
				text
			});

			if (apiKey) {
				params.append('apiKey', apiKey);
			}

			if (disabledRules.length > 0) {
				params.append('disabledRules', disabledRules.join(','));
			}

			if (enabledRules.length > 0) {
				params.append('enabledRules', enabledRules.join(','));
			}

			// 创建 AbortController 用于超时控制
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await customFetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					...headers
				},
				body: params.toString(),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`);
			}

			const data: LanguageToolResponse = await response.json();

			// 转换为标准格式
			const matches: SpellError[] = data.matches.map(match => ({
				offset: match.offset,
				length: match.length,
				message: match.message,
				word: '', // LanguageTool不提供具体单词
				suggestions: match.replacements.map(r => r.value),
				type: (match.type.typeName === 'spelling' || match.type.typeName === 'grammar')
					? match.type.typeName
					: 'grammar'
			}));

			if (debug) {
				console.log(`LanguageTool check complete. Found ${matches.length} errors.`);
			}

			return { matches };
		} catch (error) {
			if (debug) {
				console.error('LanguageTool adapter error:', error);
			}

			// 网络错误或超时时返回空结果，不影响编辑器使用
			return { matches: [] };
		}
	};
}

/**
 * 高级 LanguageTool 适配器类
 */
export class LanguageToolAdvancedAdapter {
	private config: Required<LanguageToolConfig>;
	private cache = new Map<string, { result: { matches: SpellError[] }; timestamp: number }>();
	private readonly cacheExpiry = 5 * 60 * 1000; // 5分钟缓存

	constructor(config: LanguageToolConfig = {}) {
		this.config = {
			apiUrl: config.apiUrl || 'https://api.languagetool.org/v2/check',
			language: config.language || 'en-US',
			apiKey: config.apiKey || '',
			timeout: config.timeout || 10000,
			debug: config.debug || false,
			customFetch: config.customFetch || fetch,
			headers: config.headers || {},
			disabledRules: config.disabledRules || [],
			enabledRules: config.enabledRules || []
		};
	}

	/**
	 * 更新配置
	 */
	updateConfig(newConfig: Partial<LanguageToolConfig>): void {
		Object.assign(this.config, newConfig);
		// 配置更改后清除缓存
		this.clearCache();
	}

	/**
	 * 添加禁用规则
	 */
	addDisabledRule(ruleId: string): void {
		if (!this.config.disabledRules.includes(ruleId)) {
			this.config.disabledRules.push(ruleId);
		}
	}

	/**
	 * 移除禁用规则
	 */
	removeDisabledRule(ruleId: string): void {
		const index = this.config.disabledRules.indexOf(ruleId);
		if (index > -1) {
			this.config.disabledRules.splice(index, 1);
		}
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * 检查文本
	 */
	async checkText(text: string): Promise<{ matches: SpellError[] }> {
		// 检查缓存
		const cacheKey = this.getCacheKey(text);
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
			if (this.config.debug) {
				console.log('LanguageTool returning cached result');
			}
			return cached.result;
		}

		try {
			const adapter = createLanguageToolAdapter(this.config);
			const result = await adapter(text);

			// 缓存结果
			this.cache.set(cacheKey, {
				result,
				timestamp: Date.now()
			});

			// 清理过期缓存
			this.cleanupCache();

			return result;
		} catch (error) {
			if (this.config.debug) {
				console.error('LanguageToolAdvancedAdapter error:', error);
			}
			return { matches: [] };
		}
	}

	/**
	 * 批量检查多个文本
	 */
	async checkMultipleTexts(texts: string[]): Promise<{ matches: SpellError[] }[]> {
		const promises = texts.map(text => this.checkText(text));
		return Promise.all(promises);
	}

	/**
	 * 获取支持的语言列表
	 */
	async getSupportedLanguages(): Promise<string[]> {
		try {
			const response = await this.config.customFetch(`${this.config.apiUrl.replace('/check', '/languages')}`);
			const languages = await response.json();
			return languages.map((lang: any) => lang.code);
		} catch (error) {
			console.error('Failed to get supported languages:', error);
			return [];
		}
	}

	private getCacheKey(text: string): string {
		const configString = JSON.stringify({
			language: this.config.language,
			disabledRules: this.config.disabledRules,
			enabledRules: this.config.enabledRules
		});
		return `${text}:${configString}`;
	}

	private cleanupCache(): void {
		const now = Date.now();
		for (const [key, value] of this.cache.entries()) {
			if (now - value.timestamp > this.cacheExpiry) {
				this.cache.delete(key);
			}
		}
	}
}

/**
 * 预定义的 LanguageTool 配置
 */
export const LanguageToolPresets = {
	/**
	 * 英语（美式）配置
	 */
	EnglishUS: (): LanguageToolConfig => ({
		language: 'en-US',
		disabledRules: ['WHITESPACE_RULE'] // 禁用空格规则
	}),

	/**
	 * 英语（英式）配置
	 */
	EnglishGB: (): LanguageToolConfig => ({
		language: 'en-GB',
		disabledRules: ['WHITESPACE_RULE']
	}),

	/**
	 * 只检查拼写错误
	 */
	SpellingOnly: (): LanguageToolConfig => ({
		language: 'en-US',
		enabledRules: ['MORFOLOGIK_RULE_EN_US', 'HUNSPELL_RULE']
	}),

	/**
	 * 严格模式（包含所有检查）
	 */
	Strict: (): LanguageToolConfig => ({
		language: 'en-US',
		disabledRules: [] // 不禁用任何规则
	}),

	/**
	 * 宽松模式（只检查重要错误）
	 */
	Relaxed: (): LanguageToolConfig => ({
		language: 'en-US',
		disabledRules: [
			'WHITESPACE_RULE',
			'EN_QUOTES',
			'COMMA_PARENTHESIS_WHITESPACE',
			'SENTENCE_WHITESPACE'
		]
	})
};

/**
 * 创建本地 LanguageTool 适配器（用于自托管实例）
 */
export function createLocalLanguageToolAdapter(
	localApiUrl: string,
	config: Omit<LanguageToolConfig, 'apiUrl'> = {}
) {
	return createLanguageToolAdapter({
		...config,
		apiUrl: localApiUrl
	});
}