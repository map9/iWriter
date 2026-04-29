// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeFeatureGallery from './components/HomeFeatureGallery.vue'
import SmartDownloadButton from './components/SmartDownloadButton.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app, router, siteData }) {
    app.component('HomeFeatureGallery', HomeFeatureGallery)
    app.component('SmartDownloadButton', SmartDownloadButton)
  }
} satisfies Theme
