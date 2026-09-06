<script setup>
const props=defineProps({open:Boolean,rows:{type:Array,default:()=>[]},saving:Boolean,enabled:Boolean,description:{type:String,default:''}})
defineEmits(['close','confirm'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop notification-confirm-backdrop" @pointerdown.self="$emit('close')">
      <section class="bottom-sheet notification-confirm-sheet" role="dialog" aria-modal="true" aria-label="Подтверждение фильтра уведомлений">
        <header class="sheet-head">
          <div><small>ПРОВЕРКА ПЕРЕД СОХРАНЕНИЕМ</small><h3>Подтвердите фильтр</h3></div>
          <button type="button" class="icon-circle" :disabled="saving" @click="$emit('close')">×</button>
        </header>
        <div class="notification-confirm-scroll">
          <div class="confirm-lead" :class="{inactive:!enabled}">
            <b>{{enabled?'Уведомления будут работать только по этим условиям':'Правило будет сохранено выключенным'}}</b>
            <span v-if="enabled">Все пункты ниже проверяются одновременно. Если хотя бы один пункт не совпал — уведомление не отправляется.</span>
            <span v-else>Фильтр и расписание сохранятся, но рассылка не начнётся, пока вы не включите хотя бы один тип уведомлений.</span>
          </div>
          <div v-if="description" class="filter-description-preview"><small>КАК ЭТО БУДЕТ РАБОТАТЬ</small><p>{{description}}</p></div>
          <dl class="filter-confirm-list">
            <div v-for="row in rows" :key="row.label">
              <dt>{{row.label}}</dt>
              <dd>{{row.value}}</dd>
            </div>
          </dl>
          <div class="strict-confirm-note">
            <b>Подтверждаете именно этот фильтр?</b>
            <span>После подтверждения правило сохранится в серверном хранилище. Менеджеры и CRM-статусы не будут автоматически расширяться до «всех».</span>
          </div>
        </div>
        <footer class="sheet-actions notification-confirm-actions">
          <button type="button" class="secondary-btn" :disabled="saving" @click="$emit('close')">Назад к настройке</button>
          <button type="button" class="primary-btn" :disabled="saving" @click="$emit('confirm')">{{saving?'Сохраняю…':'Подтверждаю и сохраняю'}}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
