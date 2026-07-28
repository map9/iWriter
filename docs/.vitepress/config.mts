import { defineConfig } from 'vitepress'

const base = process.env.BASE_PATH || '/'
const repositoryUrl = process.env.DOCS_REPO_URL || 'https://github.com/map9/iWriter'
const editLinkPattern =
  process.env.DOCS_EDIT_LINK_PATTERN || `${repositoryUrl}/edit/main/docs/:path`

export default defineConfig({
  lang: 'zh-CN',
  title: 'iWriter',
  description: '免费的跨平台本地 AI 写作与个人知识管理工具',
  base,
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '功能', link: '/features' },
      { text: '下载', link: '/download' },
      { text: '文档', link: '/docs/' }
    ],
    sidebar: {
      '/docs/': [
        {
          text: '开始使用',
          items: [
            { text: '概述', link: '/docs/' },
            { text: '快速开始', link: '/quick-start' },
            { text: '工作区与文件管理', link: '/docs/workspace' },
            { text: 'Git 文档版本管理', link: '/docs/source-control' },
            { text: '编辑器使用', link: '/docs/editor' },
            { text: '搜索与替换', link: '/docs/search' },
            { text: '目录与结构导航', link: '/docs/toc' }
          ]
        },
        {
          text: 'AI 功能',
          items: [
            { text: 'AI Writing Buddy 总览', link: '/docs/ai-overview' },
            { text: '日常写作搭子', link: '/docs/ai-edit-mode' },
            { text: '小说创作搭子', link: '/docs/ai-creative-mode' },
            { text: 'Provider 配置', link: '/docs/ai-provider' }
          ]
        },
        {
          text: '高级配置',
          items: [
            { text: '偏好设置', link: '/docs/preferences' },
            { text: '更新机制', link: '/docs/update' },
            { text: '故障排查', link: '/docs/troubleshooting' }
          ]
        },
        {
          text: '支持与其他',
          items: [
            { text: '更新日志', link: '/changelog' },
            { text: 'FAQ', link: '/faq' },
            { text: '安全说明', link: '/security' },
            { text: '路线图', link: '/roadmap' },
            { text: '开源许可', link: '/docs/licenses' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: repositoryUrl }],
    editLink: {
      pattern: editLinkPattern,
      text: '在 GitHub 上编辑此页'
    },
    footer: {
      message: 'iWriter 文档以当前代码实现为准。',
      copyright: 'Copyright © 2026 iWriter'
    },
    search: {
      provider: 'local'
    },
    outline: {
      label: '本页目录'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
})
