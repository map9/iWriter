<template>
  <div
    :class="{
      'is-active': item.isActive && !item.isScrolledOver,
      'is-scrolled-over': item.isScrolledOver,
    }"
    :style="{ '--level': item.level }"
  >
    <a :href="'#' + item.id" @click.prevent="onItemClick" :data-item-index="item.itemIndex">
      {{ item.textContent }}
    </a>
  </div>
</template>

<script setup lang="ts">
interface Props {
  item: {
    id: string
    textContent: string
    level: number
    isActive?: boolean
    isScrolledOver?: boolean
    itemIndex?: number
  }
  index: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'item-click': [event: Event, id: string]
}>()

function onItemClick(event: Event) {
  emit('item-click', event, props.item.id)
}
</script>