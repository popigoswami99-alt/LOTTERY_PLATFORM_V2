<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

/**
 * The right-edge floating dock, following the reference layout: a short stack
 * of quick-access reward shortcuts that rides above the page and can be
 * collapsed out of the way. Each entry routes somewhere real rather than being
 * decorative.
 */

const router = useRouter();
const open = ref(true);

const ITEMS = [
  { key: 'vip', icon: '👑', label: 'VIP', to: { name: 'vip' } },
  { key: 'wheel', icon: '🎡', label: 'Wheel', to: { name: 'wheel' } },
  { key: 'gift', icon: '🎁', label: 'Rewards', to: { name: 'rewards' } },
  { key: 'promo', icon: '💰', label: 'Invite', to: { name: 'promotion' } },
];

function go(to: { name: string }) {
  router.push(to);
}
</script>

<template>
  <div class="dock" :class="{ collapsed: !open }">
    <button class="tab" :aria-label="open ? 'Hide' : 'Show'" @click="open = !open">
      {{ open ? '›' : '‹' }}
    </button>

    <transition-group name="pop" tag="div" class="items">
      <button
        v-for="it in ITEMS"
        v-show="open"
        :key="it.key"
        class="item"
        @click="go(it.to)"
      >
        <span class="ic">{{ it.icon }}</span>
        <span class="lb">{{ it.label }}</span>
      </button>
    </transition-group>
  </div>
</template>

<style scoped lang="scss">
.dock {
  position: fixed;
  right: max(8px, calc(50vw - var(--shell) / 2 + 8px));
  bottom: calc(96px + var(--safe-bottom));
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

.dock > * {
  pointer-events: auto;
}

.tab {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
  box-shadow: var(--shadow-pop);
}

.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);

  .ic {
    font-size: 20px;
    line-height: 1;
  }

  .lb {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-dim);
  }

  &:active {
    transform: scale(0.94);
  }
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateX(10px) scale(0.9);
}
</style>
