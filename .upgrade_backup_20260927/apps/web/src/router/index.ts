import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    {
      path: '/wingo',
      name: 'wingo',
      component: () => import('@/views/WinGoView.vue'),
    },
    {
      path: '/k3',
      name: 'k3',
      component: () => import('@/views/K3View.vue'),
    },
    {
      path: '/fived',
      name: 'fived',
      component: () => import('@/views/FiveDView.vue'),
    },
    {
      path: '/fourd',
      name: 'fourd',
      component: () => import('@/views/FourDView.vue'),
    },
    // `wide` lets a view escape the 480px mobile column — these two are laid
    // out for a full-width game client rather than a phone screen.
    {
      path: '/crash',
      name: 'crash',
      component: () => import('@/views/CrashView.vue'),
      meta: { wide: true },
    },
    {
      path: '/dice',
      name: 'dice',
      component: () => import('@/views/DiceView.vue'),
      meta: { wide: true },
    },
    { path: '/limbo', name: 'limbo', component: () => import('@/views/LimboView.vue') },
    { path: '/mines', name: 'mines', component: () => import('@/views/MinesView.vue') },
    { path: '/chicken-road', name: 'chicken-road', component: () => import('@/views/ChickenRoadView.vue') },
    { path: '/plinko', name: 'plinko', component: () => import('@/views/PlinkoView.vue') },
    { path: '/wheel', name: 'wheel', component: () => import('@/views/WheelView.vue') },
    { path: '/motorace', name: 'motorace', component: () => import('@/views/MotoRaceView.vue') },
    { path: '/keno', name: 'keno', component: () => import('@/views/KenoView.vue') },
    { path: '/hilo', name: 'hilo', component: () => import('@/views/HiloView.vue') },
    {
      path: '/andar-bahar',
      name: 'andar-bahar',
      component: () => import('@/views/AndarBaharView.vue'),
    },
    {
      path: '/dragon-tiger',
      name: 'dragon-tiger',
      component: () => import('@/views/DragonTigerView.vue'),
    },
    {
      path: '/wallet',
      name: 'wallet',
      component: () => import('@/views/WalletView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/activity', name: 'activity', component: () => import('@/views/ActivityView.vue') },
    {
      path: '/vip',
      name: 'vip',
      component: () => import('@/views/VipView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/rewards',
      name: 'rewards',
      component: () => import('@/views/RewardsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/support',
      name: 'support',
      component: () => import('@/views/SupportView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/promotion',
      name: 'promotion',
      component: () => import('@/views/PromotionView.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
    },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, wide: true },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.bootstrap();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' };
  }
  return true;
});

export default router;
