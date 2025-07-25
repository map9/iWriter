<template>
  <node-view-wrapper data-type="image-with-caption">
    <node-view-content class="media-content" />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

</script>

<style scoped>
figure {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.media-content img {
  max-width: 100%;
  height: auto;
}
.media-caption {
  font-size: 0.875rem;
  color: #666;
}
.caption-top {
  margin-bottom: 0.5em;
}
.caption-bottom {
  margin-top: 0.5em;
}
</style>