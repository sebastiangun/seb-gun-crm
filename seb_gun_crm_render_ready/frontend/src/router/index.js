import { createRouter, createWebHashHistory } from 'vue-router'
import DialogsView from '../views/DialogsView.vue'
import ChatView from '../views/ChatView.vue'
import ClientsView from '../views/ClientsView.vue'
import RemindersView from '../views/RemindersView.vue'
import MoreView from '../views/MoreView.vue'
import NotificationsView from '../views/NotificationsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dialogs' },
    { path: '/dialogs', component: DialogsView },
    { path: '/dialogs/:peerId', component: ChatView, props: true },
    { path: '/clients', component: ClientsView },
    { path: '/reminders', component: RemindersView },
    { path: '/notifications', component: NotificationsView },
    { path: '/more', component: MoreView },
    { path: '/:pathMatch(.*)*', redirect: '/dialogs' },
  ],
})
