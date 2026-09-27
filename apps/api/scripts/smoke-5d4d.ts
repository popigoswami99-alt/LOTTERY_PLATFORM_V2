const BASE='http://127.0.0.1:4000';

async function req(path:string,o:any={}){
  const r=await fetch(BASE+path,{
    ...o,headers:{'content-type':'application/json',...(o.headers||{})}
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return j;
}

(async()=>{
 try{
  console.log('5D/4D E2E: START');

  const phone=String(9800000000+Math.floor(Math.random()*999999));
  const reg=await req('/api/auth/register',{
    method:'POST',
    body:JSON.stringify({phone,password:'Test@123456',nickname:'E2E_5D4D'})
  });
  const auth={Authorization:`Bearer ${reg.data.accessToken}`};

  await req('/api/virtual/credit',{
    method:'POST',headers:auth,
    body:JSON.stringify({amount:10000,reason:'5D4D E2E'})
  });

  const games=await req('/api/games');

  for(const [code,roomKey] of [['5D','5D_1M'],['4D','4D_1M']]){
    const g=(games.data||[]).find((x:any)=>x.gameCode===code);
    if(!g){console.log(`${code}: ❌ GAME`);continue;}

    const rooms=await req(`/api/games/${code}/rooms`);
    const room=(rooms.data||[]).find((x:any)=>x.key===roomKey);

    if(!room){console.log(`${code}: ❌ ROOM`);continue;}

    const state=await req(`/api/rooms/${roomKey}/state`);
    if(!state.ok){console.log(`${code}: ❌ STATE`);continue;}

    await req(`/api/rooms/${roomKey}/bet`,{
      method:'POST',headers:auth,
      body:JSON.stringify({
        betType:'A_NUMBER',
        selection:'4',
        unitAmount:'100',
        multiplier:1
      })
    });

    console.log(`${code}: BET ✅`);

    let settled=false;
    for(let i=0;i<75;i++){
      await new Promise(r=>setTimeout(r,1000));
      const x=await req(`/api/rooms/${roomKey}/my-bets`,{headers:auth});
      const bets=x.data||[];
      const b=bets[0];
      if(b && !['OPEN','PENDING'].includes(String(b.status).toUpperCase())){
        settled=true;break;
      }
    }
    console.log(`${code}: SETTLEMENT ${settled?'✅':'❌'}`);
  }

  const ledger=await req('/api/virtual/ledger',{headers:auth});
  console.log(`LEDGER: ${ledger.ok?'✅':'❌'}`);
  console.log('5D/4D E2E: DONE');
 }catch(e:any){
  console.log(`5D/4D E2E: ❌ ${String(e.message).slice(0,180)}`);
  process.exitCode=1;
 }
})();
