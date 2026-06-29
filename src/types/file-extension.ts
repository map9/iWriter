export const TEXT_IWT_EXTENSION = 'iwt' as const
export const TEXT_MD_EXTENSIONS = ['md', 'markdown'] as const
export const TEXT_TXT_EXTENSIONS = ['txt'] as const
export const TEXT_IWT_EXTENSIONS = [TEXT_IWT_EXTENSION] as const
export const CODE_EXTENSIONS = ['js', 'mjs', 'ts', 'tsx', 'jsx', 'vue', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'sh', 'bash', 'sql', 'graphql'] as const
// 可搜索的文本文件：包含 Markdown、纯文本、iWriter 格式和代码文件
export const TEXT_EXTENSIONS = [...TEXT_MD_EXTENSIONS, ...TEXT_TXT_EXTENSIONS, ...TEXT_IWT_EXTENSIONS, ...CODE_EXTENSIONS] as const
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'] as const
export const PDF_EXTENSIONS = ['pdf'] as const
export const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] as const
export const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'] as const