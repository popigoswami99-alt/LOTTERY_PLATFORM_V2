<template>
  <div class="vp-banner">
    <div>
      <strong>Virtual Mode</strong>
      <span>Test credits only</span>
    </div>

    <div class="vp-status">
      <span>Deposit: OFF</span>
      <span>Withdrawal: OFF</span>
    </div>
  </div>
</template>

<style scoped>
.vp-banner{
  width:100%;
  box-sizing:border-box;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 13px;
  border:1px solid #30323a;
  border-radius:12px;
  background:#17181d;
  color:#fff;
}

.vp-banner strong{
  display:block;
  font-size:13px;
}

.vp-banner span{
  color:#9296a3;
  font-size:11px;
}

.vp-status{
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:6px;
}

.vp-status span{
  padding:5px 8px;
  border-radius:7px;
  background:#24262c;
}

@media(max-width:600px){
  .vp-banner{
    align-items:flex-start;
    flex-direction:column;
  }

  .vp-status{
    justify-content:flex-start;
  }
}
</style>
