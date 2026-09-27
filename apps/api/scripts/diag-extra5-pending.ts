import { prisma } from "../src/db/prisma.js";

const games=["ROULETTE","BLACKJACK","TEEN_PATTI","SLOTS","FISHING"];

const bets=await prisma.bet.findMany({
  where:{
    gameCode:{in:games},
    status:"PENDING"
  },
  orderBy:{createdAt:"desc"},
  take:30,
  select:{
    id:true,gameCode:true,periodId:true,status:true,
    stake:true,payout:true,createdAt:true,settledAt:true,
    period:{
      select:{
        id:true,roomKey:true,status:true,periodNo:true,
        startAt:true,lockAt:true,endAt:true,settledAt:true,
        resultData:true,resultNumber:true
      }
    }
  }
});

console.log(`PENDING EXTRA BETS: ${bets.length}`);

for(const b of bets){
  console.log(
    `${b.gameCode} | BET=${b.id} | PERIOD=${b.periodId} `+
    `| PSTATUS=${b.period?.status} | ROOM=${b.period?.roomKey} `+
    `| RESULT=${b.period?.resultNumber ?? "null"} `+
    `| PERIOD_SETTLED=${b.period?.settledAt ? "YES":"NO"}`
  );
}

await prisma.$disconnect();
