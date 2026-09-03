<script setup>
import { computed, ref, watch } from 'vue'
import { useDialogsStore } from '../stores/dialogs'
import { api } from '../services/api'
const props=defineProps({open:Boolean,message:Object,currentPeerId:Number})
const emit=defineEmits(['close','forward'])
const dialogs=useDialogsStore(),q=ref(''),peerId=ref('')
watch(()=>props.open,v=>{if(v){q.value='';peerId.value='';if(!dialogs.items.length)dialogs.load({reset:true,all:false}).catch(()=>{})}})
const rows=computed(()=>{const x=q.value.trim().toLocaleLowerCase('ru-RU');return dialogs.items.filter(d=>String(d.peerId)!==String(props.currentPeerId)&&(!x||`${d.name} ${d.peerId}`.toLocaleLowerCase('ru-RU').includes(x))).slice(0,60)})
function send(id){if(Number(id))emit('forward',Number(id))}
</script>
<template><Teleport to="body"><div v-if="open" class="sheet-backdrop" @pointerdown.self="$emit('close')"><section class="bottom-sheet forward-sheet">
  <header class="sheet-head"><div><small>СООБЩЕНИЕ</small><h3>Переслать</h3></div><button class="icon-circle" @click="$emit('close')">×</button></header>
  <div class="forward-searches"><div class="sheet-search"><span>⌕</span><input v-model="q" placeholder="Имя или VK ID"></div><form class="forward-id" @submit.prevent="send(peerId)"><input v-model="peerId" inputmode="numeric" placeholder="VK ID"><button class="primary-btn">Переслать</button></form></div>
  <div class="sheet-list"><button v-for="d in rows" :key="d.peerId" class="sheet-option forward-option" @click="send(d.peerId)"><img v-if="d.avatar" :src="api.imageUrl(d.avatar)" alt=""><span><b>{{d.name}}</b><small>VK {{d.peerId}}</small></span></button><div v-if="!rows.length" class="empty-mini">Диалог не найден</div></div>
</section></div></Teleport></template>
