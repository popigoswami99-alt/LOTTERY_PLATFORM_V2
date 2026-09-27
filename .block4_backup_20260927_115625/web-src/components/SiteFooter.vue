<script setup lang="ts">
import { ref } from 'vue';
import { GAMES } from '@lp/shared';

/**
 * Site footer, laid out like the reference: a statement block, a row of
 * info links, then the app-install buttons.
 *
 * The COPY is deliberately not copied. The reference advertises "more than
 * 10,000 live dealers" and "fast deposit and withdrawal" — neither is true
 * here yet (no aggregator contract, no payment provider), and shipping claims
 * the product cannot honour is how a footer becomes a liability. The layout
 * matches; the sentences describe what this platform actually does.
 */

/** One constant to rebrand the whole footer. */
const BRAND = 'Skyway Games';

const inhouseGames = Object.keys(GAMES).length + 9; // period games + originals

type PanelKey = 'language' | 'announcement' | 'support' | 'guide' | 'about';

const panel = ref<PanelKey | null>(null);

const LINKS: Array<{ key: PanelKey; label: string; icon: string }> = [
  { key: 'language', label: 'Language', icon: '🌐' },
  { key: 'announcement', label: 'Announcement', icon: '📢' },
  { key: 'support', label: '24/7 Customer service', icon: '🎧' },
  { key: 'guide', label: "Beginner's Guide", icon: '📘' },
  { key: 'about', label: 'About us', icon: 'ℹ️' },
];

const PANELS: Record<PanelKey, { title: string; body: string[] }> = {
  language: {
    title: 'Language',
    body: [
      'English is the only language bundled in this build.',
      'The interface is wired for translation, but no other locale files have been added yet.',
    ],
  },
  announcement: {
    title: 'Announcement',
    body: [
      `Welcome to ${BRAND}. Every round is provably fair: the result is committed as a hash before betting opens and the seed is revealed afterwards, so you can verify it rather than trust it.`,
      'This is a development build running on test balance.',
    ],
  },
  support: {
    title: '24/7 Customer service',
    body: [
      'No support desk is connected to this build yet.',
      'When one is, this panel is where the live chat handoff will live.',
    ],
  },
  guide: {
    title: "Beginner's Guide",
    body: [
      'Pick a game from the categories above. Lottery games run on a fixed timer — you bet before the countdown locks. Originals resolve instantly or run continuous rounds.',
      'Every game shows its odds before you stake, and its fairness commitment while you play.',
      'Minimum bet is ₹10.',
    ],
  },
  about: {
    title: 'About us',
    body: [
      `${BRAND} runs ${inhouseGames} in-house games built on one shared money ledger.`,
      'Payouts are computed from exact odds, and the house edge is a single 2% stake rake — the same on every game and every bet type.',
      'This is a development build. No payment provider is connected and no real money is involved.',
    ],
  },
};

function installPwa() {
  panel.value = 'guide';
}
</script>

<template>
  <footer class="site-footer">
    <!-- Statement block -->
    <div class="statement">
      <p>
        The platform advocates fairness, justice, and openness. We operate provably fair
        lottery draws and original games, with every result verifiable after the fact.
      </p>
      <p>
        {{ BRAND }} runs {{ inhouseGames }} in-house games. The house edge is a single 2%
        stake rake — identical across every game and every bet type.
      </p>
      <p>
        This is a development build running on test balance. No payment provider is
        connected and no real money is involved.
      </p>
      <p class="warn">Gambling can be addictive, please play rationally.</p>
      <p class="warn">{{ BRAND }} only accepts customers above the age of 18.</p>
    </div>

    <!-- Info links -->
    <nav class="links">
      <template v-for="l in LINKS" :key="l.key">
        <router-link v-if="l.key === 'support'" :to="{ name: 'support' }" class="link">
          <span class="ico">{{ l.icon }}</span>
          <span>{{ l.label }}</span>
        </router-link>
        <button v-else class="link" @click="panel = l.key">
          <span class="ico">{{ l.icon }}</span>
          <span>{{ l.label }}</span>
        </button>
      </template>
    </nav>

    <!-- Install buttons -->
    <div class="installs">
      <button class="install" @click="installPwa">
        <span class="ico">⬇</span>
        Download APP
      </button>
      <button class="install ghost" @click="installPwa">
        <span class="ico">🖥</span>
        Add to Desktop
      </button>
    </div>

    <p class="copyright">© {{ new Date().getFullYear() }} {{ BRAND }}. 18+ only.</p>

    <!-- Info panel -->
    <transition name="fade">
      <div v-if="panel" class="backdrop" @click.self="panel = null">
        <div class="sheet">
          <header>
            <strong>{{ PANELS[panel].title }}</strong>
            <button class="x" @click="panel = null">✕</button>
          </header>
          <p v-for="(line, i) in PANELS[panel].body" :key="i">{{ line }}</p>
        </div>
      </div>
    </transition>
  </footer>
</template>

<style scoped lang="scss">
.site-footer {
  margin-top: 6px;
  padding: 16px 14px 8px;
  border-top: 1px solid var(--line);
  background: var(--surface);
  border-radius: var(--radius) var(--radius) 0 0;
}

.statement p {
  margin: 0 0 9px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-dim);
}

.warn {
  color: var(--text-faint) !important;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0;
  padding: 12px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;

  &:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .ico {
    font-size: 12px;
  }
}

.installs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.install {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
  font-size: 13px;
  font-weight: 700;

  &.ghost {
    background: var(--surface-2);
    color: var(--text-dim);
    border: 1px solid var(--line);
  }
}

.copyright {
  margin: 14px 0 0;
  text-align: center;
  font-size: 10px;
  color: var(--text-faint);
}

/* --- info panel ---------------------------------------------------------- */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 300;
}

.sheet {
  width: 100%;
  max-width: var(--shell);
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 16px;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;

    strong {
      font-size: 15px;
    }
  }

  p {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-dim);
  }
}

.x {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 12px;
}
</style>
