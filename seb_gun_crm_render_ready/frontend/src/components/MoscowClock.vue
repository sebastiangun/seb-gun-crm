<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
const time=ref('')
let timer
function update(){time.value=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date())}
onMounted(()=>{update();timer=setInterval(update,1000)})
onBeforeUnmount(()=>clearInterval(timer))
</script>
<template><div class="moscow-clock" aria-label="Текущее время по Москве"><span>МСК</span><b>{{time}}</b></div></template>
