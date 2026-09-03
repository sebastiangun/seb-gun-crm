<script setup>
import { computed, ref, watch } from 'vue'
const props=defineProps({open:Boolean,title:String,options:{type:Array,default:()=>[]},modelValue:{default:''},emptyLabel:{type:String,default:'Не выбрано'},searchable:{type:Boolean,default:true}})
const emit=defineEmits(['update:modelValue','close'])
const q=ref('')
watch(()=>props.open,v=>{if(v)q.value=''})
const shown=computed(()=>{const x=q.value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');return x?props.options.filter(o=>String(o.label??o.value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(x)):props.options})
function choose(value){emit('update:modelValue',value);emit('close')}
</script>
<template>
  <Teleport to="body"><div v-if="open" class="sheet-backdrop" @pointerdown.self="$emit('close')"><section class="bottom-sheet single-select-sheet" role="dialog" aria-modal="true">
    <header class="sheet-head"><div><small>ВЫБОР</small><h3>{{title}}</h3></div><button type="button" class="icon-circle" @click="$emit('close')">×</button></header>
    <div v-if="searchable" class="sheet-search"><span>⌕</span><input v-model="q" placeholder="Найти…"></div>
    <div class="sheet-list"><button type="button" class="sheet-option" @click="choose('')"><span class="radio-dot" :class="{checked:!modelValue}"></span><span>{{emptyLabel}}</span></button><button v-for="o in shown" :key="String(o.value)" type="button" class="sheet-option" @click="choose(o.value)"><span class="radio-dot" :class="{checked:String(modelValue)===String(o.value)}"></span><span>{{o.label??o.value}}</span></button></div>
  </section></div></Teleport>
</template>
