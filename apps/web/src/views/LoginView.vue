<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const identifier = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await auth.login(identifier.value.trim(), password.value);
    router.replace(String(route.query.redirect ?? '/wingo'));
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
      <h1>Win Go</h1>
      <p>Log in with your phone number to play</p>
    </header>

    <form class="form" @submit.prevent="submit">
      <label class="label">Phone number or email</label>
      <div class="field">
        <span class="pfx">+91</span>
        <input v-model="identifier" type="text" placeholder="Phone number" autocomplete="username" />
      </div>

      <label class="label">Password</label>
      <div class="field">
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
        />
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <button class="btn btn-primary" type="submit" :disabled="busy || !identifier || !password">
        {{ busy ? 'Logging in…' : 'Log in' }}
      </button>

      <router-link class="btn btn-ghost" :to="{ name: 'register' }">Create an account</router-link>
      <router-link class="skip" :to="{ name: 'wingo' }">Continue as guest</router-link>
    </form>
  </div>
</template>

<style scoped lang="scss">
.auth {
  min-height: 100vh;
  padding: 48px 20px 24px;
}

.hero {
  text-align: center;
  margin-bottom: 28px;

  h1 {
    margin: 0 0 6px;
    font-size: 30px;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  p {
    margin: 0;
    color: var(--text-dim);
    font-size: 13px;
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
    margin-top: 14px;
    text-decoration: none;
  }
}

.pfx {
  color: var(--text-faint);
  font-size: 13px;
  border-right: 1px solid var(--line);
  padding-right: 10px;
}

.err {
  margin: 10px 0 0;
  color: var(--red);
  font-size: 12px;
}

.skip {
  margin-top: 16px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
  text-decoration: none;
}
</style>
