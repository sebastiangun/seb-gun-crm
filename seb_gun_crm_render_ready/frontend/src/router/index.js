import { createRouter, createWebHashHistory } from 'vue-router'
import DialogsView from '../views/DialogsView.vue'
import ChatView from '../views/ChatView.vue'
import ClientsView from '../views/ClientsView.vue'
import RemindersView from '../views/RemindersView.vue'
import MoreView from '../views/MoreView.vue'
import NotificationsView from '../views/NotificationsView.vue'
import NotificationHistoryView from '../views/NotificationHistoryView.vue'
import OutboxView from '../views/OutboxView.vue'
import ManagersView from '../views/ManagersView.vue'
import AdminView from '../views/AdminView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dialogs' },
    { path: '/dialogs', component: DialogsView },
    { path: '/dialogs/:peerId', component: ChatView, props: true },
    { path: '/clients', component: ClientsView },
    { path: '/reminders', component: RemindersView },
    { path: '/outbox', component: OutboxView },
    { path: '/sla', component: ManagersView },
    { path: '/notifications', component: NotificationsView },
    { path: '/notification-history', component: NotificationHistoryView },
    { path: '/more', component: MoreView },
    { path: '/admin/:section?', component: AdminView },
    { path: '/:pathMatch(.*)*', redirect: '/dialogs' },
  ],
})
