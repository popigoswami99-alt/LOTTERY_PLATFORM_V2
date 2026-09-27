<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const phone = ref('');
const password = ref('');
const confirm = ref('');

// Prefilled from an invite link (?invite=CODE) so a shared link actually
// attributes the signup instead of just looking like it does.
const inviteCode = ref(String(route.query.invite ?? '').toUpperCase());
const fromLink = ref(inviteCode.value.length > 0);
const agreed = ref(false);
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match';
    return;
  }
  busy.value = true;
  try {
    await auth.register({
      phone: phone.value.trim(),
      password: password.value,
      inviteCode: inviteCode.value.trim().toUpperCase() || undefined,
    });
    router.replace('/wingo');
  } catch (err) {
    error.value = apiError(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth">
    <header class="hero">
      <h1>Register</h1>
      <p>18+ only. Please play responsibly.</p>
    </header>

    <form class="form" @submit.prevent="submit">
      <label class="label">Phone number</label>
      <div class="field">
        <span class="pfx">+91</span>
        <input v-model="phone" type="tel" inputmode="numeric" placeholder="Phone number" />
      </div>

      <label class="label">Password</label>
      <div class="field">
        <input v-model="password" type="password" placeholder="At least 6 characters" />
      </div>

      <label class="label">Confirm password</label>
      <div class="field">
        <input v-model="confirm" type="password" placeholder="Re-enter password" />
      </div>

      <label class="label">
        Invite code (optional)
        <em v-if="fromLink" class="applied">from invite link</em>
      </label>
      <div class="field">
        <input
          v-model="inviteCode"
          type="text"
          maxlength="8"
          placeholder="8-character code"
          @input="fromLink = false"
        />
      </div>

      <label class="agree">
        <input v-model="agreed" type="checkbox" />
        <span>I am 18 or older and accept the terms</span>
      </label>

      <p v-if="error" class="err">{{ error }}</p>

      <button
        class="btn btn-primary"
        type="submit"
        :disabled="busy || !agreed || !phone || password.length < 6"
      >
        {{ busy ? 'Creating…' : 'Register' }}
      </button>

      <router-link class="btn btn-ghost" :to="{ name: 'login' }">I already have an account</router-link>
    </form>
  </div>
</template>

<style scoped lang="scss">
.auth {
  min-height: 100vh;
  padding: 40px 20px 24px;
}

.hero {
  text-align: center;
  margin-bottom: 20px;

  h1 {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .label {
    margin-top: 10px;
  }

  .btn {
    margin-top: 12px;
    text-decoration: none;
  }
}

.pfx {
  color: var(--text-faint);
  font-size: 13px;
  border-right: 1px solid var(--line);
  padding-right: 10px;
}

.agree {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-dim);

  input {
    accent-color: var(--gold);
  }
}

.err {
  margin: 10px 0 0;
  color: var(--red);
  font-size: 12px;
}

.applied {
  margin-left: 6px;
  font-style: normal;
  color: var(--green);
  font-size: 10px;
}
</style>
