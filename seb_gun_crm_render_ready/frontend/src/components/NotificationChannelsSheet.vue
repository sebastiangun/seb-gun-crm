<script setup>
import { computed } from 'vue'
const props=defineProps({
  open:Boolean,
  manager:String,
  botConfigured:Boolean,
  botUsername:String,
  telegramConnected:Boolean,
  browserSupported:Boolean,
  browserEnabled:Boolean,
  browserPermission:String,
  busy:{type:String,default:''},
})
const emit=defineEmits(['close','pair','refresh','enable-browser','test-browser'])
const browserReady=computed(()=>props.browserSupported&&props.browserEnabled&&props.browserPermission==='granted')
const allReady=computed(()=>props.telegramConnected&&browserReady.value)
const permissionLabel=computed(()=>props.browserPermission==='granted'?'Разрешено':props.browserPermission==='denied'?'Запрещено в браузере':'Ещё не запрошено')
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop notification-channels-backdrop" @pointerdown.self="emit('close')">
      <section class="bottom-sheet notification-channels-sheet" role="dialog" aria-modal="true" aria-label="Подключение каналов уведомлений">
        <header class="sheet-head">
          <div><small>КАНАЛЫ ДОСТАВКИ</small><h3>Включить уведомления</h3></div>
          <button type="button" class="icon-circle" @click="emit('close')">×</button>
        </header>
        <div class="notification-channels-scroll">
          <div class="channels-intro" :class="{ready:allReady}">
            <b>{{allReady?'Оба канала подключены':'Подключите нужные каналы'}}</b>
            <span>Telegram работает независимо от открытого браузера. Браузерные уведомления относятся к этому устройству и текущему вошедшему аккаунту CRM.</span>
          </div>

          <article class="channel-card" :class="{ready:telegramConnected}">
            <div class="channel-icon">✈️</div>
            <div class="channel-copy">
              <div class="channel-title-row"><b>Telegram-бот</b><span :class="telegramConnected?'channel-status-ready':'channel-status-warn'">{{telegramConnected?'Подключён':'Не подключён'}}</span></div>
              <p v-if="botConfigured">Получатель: <b>{{manager||'не выбран'}}</b><template v-if="botUsername"> · @{{botUsername}}</template></p>
              <p v-else>Бот пока не настроен на сервере. Сначала нужен TELEGRAM_BOT_TOKEN в Render Environment.</p>
              <div class="channel-actions">
                <button v-if="botConfigured&&!telegramConnected" type="button" class="primary-btn" :disabled="busy==='telegram'" @click="emit('pair')">{{busy==='telegram'?'Открываю…':'Подключить бота'}}</button>
                <button v-if="botConfigured" type="button" class="secondary-btn" :disabled="busy==='refresh'" @click="emit('refresh')">{{busy==='refresh'?'Проверяю…':'Проверить подключение'}}</button>
              </div>
            </div>
          </article>

          <article class="channel-card" :class="{ready:browserReady}">
            <div class="channel-icon">🔔</div>
            <div class="channel-copy">
              <div class="channel-title-row"><b>Уведомления браузера</b><span :class="browserReady?'channel-status-ready':'channel-status-warn'">{{browserReady?'Включены':'Не включены'}}</span></div>
              <p v-if="!browserSupported">Этот браузер не поддерживает системные уведомления для CRM.</p>
              <p v-else>Разрешение на этом устройстве: <b>{{permissionLabel}}</b>. После включения CRM покажет тестовое системное уведомление.</p>
              <div class="channel-actions">
                <button v-if="browserSupported&&!browserReady" type="button" class="primary-btn" :disabled="busy==='browser'" @click="emit('enable-browser')">{{busy==='browser'?'Включаю…':'Разрешить на устройстве'}}</button>
                <button v-if="browserSupported&&browserReady" type="button" class="secondary-btn" :disabled="busy==='browser-test'" @click="emit('test-browser')">{{busy==='browser-test'?'Отправляю…':'Тест уведомления'}}</button>
              </div>
              <small v-if="browserPermission==='denied'">Если доступ ранее был запрещён, разрешите уведомления для сайта в настройках браузера, затем откройте это окно снова.</small>
            </div>
          </article>

          <div class="channel-security-note"><b>Фильтр не меняется</b><span>Подключение канала не расширяет аудиторию. И Telegram, и браузер получают события только после серверной проверки вашего строгого фильтра.</span></div>
        </div>
        <footer class="sheet-actions single-action-footer">
          <button type="button" class="primary-btn" @click="emit('close')">Готово</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
