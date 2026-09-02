<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: 'Фильтр' },
  options: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  searchable: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue', 'close', 'apply'])
const draft = ref([])
const q = ref('')
watch(() => props.open, v => { if (v) { draft.value = [...props.modelValue]; q.value = '' } })
const shown = computed(() => {
  const query = q.value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  if (!query) return props.options
  return props.options.filter(o => String(o.label ?? o.value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').includes(query))
})
function toggle(value) {
  const s = new Set(draft.value)
  s.has(value) ? s.delete(value) : s.add(value)
  draft.value = [...s]
}
function apply() {
  emit('update:modelValue', [...draft.value])
  emit('apply', [...draft.value])
}
function reset() {
  draft.value = []
  emit('update:modelValue', [])
  emit('apply', [])
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop" @pointerdown.self="$emit('close')">
      <section class="bottom-sheet" role="dialog" aria-modal="true" :aria-label="title">
        <header class="sheet-head">
          <div><small>ФИЛЬТР</small><h3>{{ title }}</h3></div>
          <button type="button" class="icon-circle" @click="$emit('close')">×</button>
        </header>
        <div v-if="searchable" class="sheet-search"><span>⌕</span><input v-model="q" placeholder="Найти…" autofocus></div>
        <div class="sheet-list">
          <button v-for="o in shown" :key="String(o.value)" type="button" class="sheet-option" @click="toggle(o.value)">
            <span class="check-box" :class="{checked: draft.includes(o.value)}">{{ draft.includes(o.value) ? '✓' : '' }}</span>
            <span>{{ o.label ?? o.value }}</span>
          </button>
          <div v-if="!shown.length" class="empty-mini">Ничего не найдено</div>
        </div>
        <footer class="sheet-actions">
          <button type="button" class="secondary-btn" @click="reset">Сбросить</button>
          <button type="button" class="primary-btn" @click="apply">Применить · {{ draft.length }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
