---
layout: home
pageClass: home-page

hero:
  text: "免费的跨平台本地 AI 创作工具"
  tagline: "AI 全能创作搭子，陪你管理知识、打磨日常文稿，并从灵感构思一路完成小说创作"
  actions:
    - theme: brand
      text: 下载
      link: /download
    - theme: alt
      text: 快速开始
      link: /quick-start
---

<SmartDownloadButton :enhance-hero="true" />

<div class="home-screenshot">
  <img src="/images/home/main-window.png" alt="iWriter 主界面预览" />
</div>

<div class="home-release-note">
  <span>适用版本：iWriter <code>0.2.3</code></span>
  <span>最后更新：2026-08-10</span>
</div>

<section class="home-feature-stack">
  <div class="home-feature-row">
    <div class="home-feature-text">
      <p class="home-feature-text-eyebrow">AI Writing Buddy</p>
      <h2>AI 全能创作搭子</h2>
      <p>
        日常写作搭子（AI Doc Buddy）围绕个人知识管理与日常文档写作，陪你完成信息收集、内容创作与文稿打磨。
      </p>
      <p>
        小说创作搭子（AI Story Buddy）陪伴作者从灵感构思到作品完稿，覆盖提纲、正文、评审与重构全流程。
      </p>
      <p>
        AI Writing Buddy 的所有编辑，都需要等您审核后才落地。
      </p>
      <p>
        支持 Anthropic、DeepSeek、Gemini、GLM、OpenAI 等常见 AI 服务商配置。
      </p>
    </div>
    <div class="home-feature-collage">
      <HomeFeatureGallery
        :items="[
          {
            type: 'video',
            src: '/videos/home/writing-buddy-demo.mp4',
            alt: 'Writing Buddy 创作演示视频',
            size: 'hero'
          }
        ]"
      />
    </div>
  </div>

  <div class="home-feature-row">
    <div class="home-feature-collage">
      <HomeFeatureGallery
        :items="[
          {
            type: 'image',
            src: '/images/home/explorer.png',
            alt: '工作区与文件浏览',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/search.png',
            alt: '搜索',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/toc.png',
            alt: '目录',
            size: 'small',
          }
        ]"
      />
    </div>
    <div class="home-feature-text">
      <p class="home-feature-text-eyebrow">纯文件工作区</p>
      <h2>你的地盘你做主</h2>
      <p>
        你的本地文件或者远程云盘，你熟悉的Markdown文本格式，基于操作系统目录的纯文件工作区、目录树，增删除、拷贝、黏贴、拖拽、跨文件搜索与替换，外加工作区过滤规则，想怎么操作你的资产就怎么操作。资料、草稿，脑爆巧思、几审作品，可以自行组织和管理。
      </p>
      <p>
        内置标准 Git 文档版本管理，支持提交、分支、Diff、冲突合并、Graph、Timeline 和 Tags，重要改稿随时可比较、回退和固化。
      </p>
      <p>
        没有专属文件格式，没有数据库，没有远程文件服务。一切透明，无需担心，没有黑箱，零迁移成本。
      </p>
      <p>
        Windows、Linux、Mac，一套系统全支持。
      </p>
    </div>
  </div>

  <div class="home-feature-row">
    <div class="home-feature-text">
      <p class="home-feature-text-eyebrow">专注写作</p>
      <h2>所见即所得的富文本编辑</h2>
      <p>
        基于 TipTap 所见即所得的富文本编辑，Markdown 支持。图片、表格、公式块、代码块支持编辑器内工具，无需帮助文件，快速上手。
      </p>
      <p>
        专注模式、打字机模式、简洁模式，你只需关注手头文字，没有任何干扰。支持打印预览、Office 文档预览、导入已有文稿，并导出为 PDF、Word、EPUB 等常见格式。
      </p>
      <p>
        Light、Dark、Sunset等多种色彩主题，打造你说需要的生产环境。
      </p>
    </div>
    <div class="home-feature-collage">
      <HomeFeatureGallery
        :items="[
          {
            type: 'image',
            src: '/images/home/heading.png',
            alt: 'markdown-heading',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/image.png',
            alt: 'markdown-image',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/table.png',
            alt: 'markdown-table',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/math-code.png',
            alt: 'markdown-math-code',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/write-mode.png',
            alt: '简洁模式',
            size: 'small',
          },
          {
            type: 'image',
            src: '/images/home/print-preview.png',
            alt: '文档打印预览',
            size: 'small',
          },
        ]"
      />
    </div>
  </div>

</section>
