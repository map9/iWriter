import {
  IconFile,
  IconFileCode,
  IconPhoto,
  IconFileMusic,
  IconVideo,
  IconFileText,
  IconMarkdown,
  IconFileTypeTxt,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileZip,
  IconBrandJavascript,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandPython,
  IconDatabase,
  IconSettings
} from '@tabler/icons-vue'

/**
 * Get file icon based on file extension
 * @param fileName - The name of the file including extension
 * @returns Vue component for the appropriate icon
 */
export const getFileIconByExtension = (fileName: string) => {
  const extension = fileName.toLowerCase().split('.').pop()
  
  switch (extension) {
    // Code files
    case 'js':
    case 'mjs':
      return IconBrandJavascript
    case 'ts':
    case 'tsx':
      return IconFileCode
    case 'html':
    case 'htm':
      return IconBrandHtml5
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return IconBrandCss3
    case 'py':
      return IconBrandPython
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'cs':
    case 'php':
    case 'rb':
    case 'go':
    case 'rs':
    case 'swift':
    case 'kt':
      return IconFileCode
    
    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'svg':
    case 'webp':
    case 'ico':
      return IconPhoto
    
    // Audio
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
    case 'ogg':
    case 'm4a':
      return IconFileMusic
    
    // Video
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
    case 'webm':
    case 'mkv':
      return IconVideo
    
    // Documents
    case 'txt':
      return IconFileTypeTxt

    case 'md':
      return IconMarkdown
      
    case 'rtf':
      return IconFileText

    case 'doc':
      return IconFileTypeDoc

    case 'docx':
      return IconFileTypeDocx

    case 'pdf':
      return IconFileTypePdf
    
    // Archives
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
    case 'bz2':
      return IconFileZip
    
    // Database
    case 'db':
    case 'sqlite':
    case 'sql':
      return IconDatabase
    
    // Config
    case 'json':
    case 'xml':
    case 'yml':
    case 'yaml':
    case 'toml':
    case 'ini':
    case 'cfg':
    case 'conf':
      return IconSettings
    
    default:
      return IconFile
  }
}

/**
 * Get file category based on extension
 * @param fileName - The name of the file including extension
 * @returns Category string
 */
export const getFileCategory = (fileName: string): string => {
  const extension = fileName.toLowerCase().split('.').pop()
  
  const codeExtensions = ['js', 'mjs', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt']
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico']
  const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv']
  const documentExtensions = ['txt', 'md', 'rtf', 'doc', 'docx', 'pdf']
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  const databaseExtensions = ['db', 'sqlite', 'sql']
  const configExtensions = ['json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf']
  
  if (codeExtensions.includes(extension || '')) return 'code'
  if (imageExtensions.includes(extension || '')) return 'image'
  if (audioExtensions.includes(extension || '')) return 'audio'
  if (videoExtensions.includes(extension || '')) return 'video'
  if (documentExtensions.includes(extension || '')) return 'document'
  if (archiveExtensions.includes(extension || '')) return 'archive'
  if (databaseExtensions.includes(extension || '')) return 'database'
  if (configExtensions.includes(extension || '')) return 'config'
  
  return 'unknown'
}