<script setup lang="ts">
import { ref } from 'vue';
import { useInstantStore } from '@/stores/instant';
import { apiError } from '@/api/client';

const instant = useInstantStore();
const open = ref(false);
const editing = ref('');
const revealed = ref<{ serverSeed: string; clientSeed: string; betsPlayed: number } | null>(null);
const msg = ref('');

async function save() {
  try {
    await instant.setClientSeed(editing.value);
    msg.value = 'Client seed updated';
  } catch (err) {
    msg.value = apiError(err);
  }
}

async function rotate() {
  try {
    revealed.value = await instant.rotateSeed();
    msg.value = 'Old seed revealed — you can now verify every bet made under it';
  } catch (err) {
    msg.value = apiError(err);
  }
}

function toggle() {
  open.value = !open.value;
  if (open.value && instant.seed) editing.value = instant.seed.clientSeed;
}
</script>

<template>
  <section class="fair">
    <button class="hdr" @click="toggle">
      <span>🔒 Provably fair</span>
      <span class="faint tiny">{{ open ? 'hide' : 'show' }}</span>
    </button>

    <div v-if="open && instant.seed" class="body">
      <p class="note faint">
        Outcomes come from your server seed, your client seed and a nonce. The server seed is
        secret while in use — only its hash is shown. Rotate it to reveal the seed and check
        every bet you made with it.
      </p>

      <label class="lbl">Server seed hash (commitment)</label>
      <code class="code">{{ instant.seed.serverSeedHash }}</code>

      <label class="lbl">Client seed — yours to change</label>
      <div class="rowin">
        <input v-model="editing" class="in mono" maxlength="64" />
        <button class="mini" @click="save">Save</button>
      </div>

      <label class="lbl">Nonce (bets on this seed)</label>
      <code class="code">{{ instant.seed.nonce }}</code>

      <button class="rotate" @click="rotate">Rotate &amp; reveal server seed</button>

      <div v-if="revealed" class="revealed">
        <label class="lbl">Revealed server seed ({{ revealed.betsPlayed }} bets)</label>
        <code class="code">{{ revealed.serverSeed }}</code>
        <p class="note faint">
          Verify: <code>HMAC_SHA256(serverSeed, "{{ revealed.clientSeed }}:nonce:0")</code>
        </p>
      </div>

      <p v-if="msg" class="msg">{{ msg }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.fair {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}

.hdr {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  font-size: 13px;
  font-weight: 700;
}

.body {
  padding: 0 14px 14px;
}

.note {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.6;
}

.lbl {
  display: block;
  margin: 10px 0 4px;
  font-size: 11px;
  color: var(--text-dim);
}

.code {
  display: block;
  padding: 7px 9px;
  background: var(--surface-2);
  border-radius: 6px;
  font-size: 10px;
  word-break: break-all;
  font-family: ui-monospace, monospace;
}

.rowin {
  display: flex;
  gap: 6px;
}

.in {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  outline: none;
  font-size: 12px;
}

.mini {
  padding: 0 12px;
  height: 32px;
  border-radius: 6px;
  background: var(--surface-3);
  font-size: 12px;
  font-weight: 700;
}

.rotate {
  margin-top: 12px;
  width: 100%;
  height: 36px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--gold);
  font-size: 12px;
  font-weight: 700;
}

.revealed {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.msg {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--green);
}

.tiny {
  font-size: 11px;
}
</style>
