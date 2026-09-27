const BASE="http://127.0.0.1:4000";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function req(path:string,init:any={}){
  const r=await fetch(BASE+path,{...init,headers:{"content-type":"application/json",...(init.headers||{})}});
  const t=await r.text(); let d:any;
  try{d=JSON.parse(t)}catch{d={raw:t}}
  if(!r.ok) throw new Error(`${path} HTTP ${r.status}: ${JSON.stringify(d).slice(0,300)}`);
  return d;
}

const phone=String(Date.now()).slice(-10), password="Test@123456";
const reg=await req("/api/auth/register",{method:"POST",body:JSON.stringify({phone,password,nickname:"EXTRA5_E2E"})});
const token=reg.data?.accessToken;
if(!token) throw new Error("AUTH FAILED");
const auth={Authorization:`Bearer ${token}`};

await req("/api/virtual/credit",{method:"POST",headers:auth,
  body:JSON.stringify({amount:"1000000",reason:"EXTRA5_E2E"})});

const games=(await req("/api/games")).data||[];
const wanted=[
 ["ROULETTE","ROULETTE_1M","COLOR","RED"],
 ["BLACKJACK","BLACKJACK_1M","RESULT","PLAYER"],
 ["TEEN_PATTI","TEEN_PATTI_1M","RESULT","PLAYER"],
 ["SLOTS","SLOTS_1M","SYMBOL","SEVEN"],
 ["FISHING","FISHING_1M","TARGET","FISH_1"],
];

for(const [game,room,betType,selection] of wanted){
  if(!games.some((g:any)=>g.gameCode===game)) throw new Error(`${game} NOT REGISTERED`);

  let placed=false, before=0, after=0;

  for(let attempt=1;attempt<=12 && !placed;attempt++){
    const me=await req("/api/auth/me",{headers:auth});
    before=Number(me.data?.balance||0);

    try{
      await req(`/api/rooms/${room}/bet`,{
        method:"POST",headers:auth,
        body:JSON.stringify({betType,selection,unitAmount:"100",multiplier:1})
      });
      placed=true;
    }catch(e:any){
      if(String(e.message).includes("BETTING_CLOSED")){
        await sleep(2500);
        continue;
      }
      throw e;
    }
  }

  if(!placed) throw new Error(`${game}: could not find open betting period`);

  let settled=false;
  let last:any=null;

  for(let i=0;i<30;i++){
    await sleep(1000);
    const b=await req(`/api/rooms/${room}/my-bets`,{headers:auth});
    const rows=Array.isArray(b.data)?b.data:(Array.isArray(b)?b:[]);
    last=rows[0];

    const status=String(last?.status||last?.state||"").toUpperCase();
    if(["SETTLED","WON","LOST","LOSE","COMPLETED"].includes(status)){
      settled=true; break;
    }

    const me=await req("/api/auth/me",{headers:auth});
    after=Number(me.data?.balance||0);
  }

  const me=await req("/api/auth/me",{headers:auth});
  after=Number(me.data?.balance||0);

  console.log(`${game}: BET ${placed?"✅":"❌"} | SETTLEMENT ${settled?"✅":"⚠️"} | BAL ${before}→${after}`);
  if(!settled && last) console.log(`  STATUS: ${String(last.status||last.state||"UNKNOWN")}`);
}

const ledger=await req("/api/virtual/ledger",{headers:auth});
console.log(`LEDGER: ${ledger?.ok!==false?"✅":"❌"}`);
console.log("EXTRA 5 E2E: DONE");
