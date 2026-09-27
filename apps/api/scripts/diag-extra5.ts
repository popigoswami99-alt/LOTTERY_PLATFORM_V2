import { prisma } from "../src/db/prisma.js";
import { rulesForRoom } from "@lp/shared";

const rooms=["ROULETTE_1M","BLACKJACK_1M","TEEN_PATTI_1M","SLOTS_1M","FISHING_1M"];

for(const room of rooms){
  const rules=rulesForRoom(room);

  const periods=await prisma.gamePeriod.findMany({
    where:{roomKey:room},
    orderBy:{createdAt:"desc"},
    take:3,
    select:{
      id:true,roomKey:true,gameCode:true,status:true,periodNo:true,
      startAt:true,lockAt:true,endAt:true,settledAt:true
    }
  });

  const ids=periods.map(p=>p.id);

  const bets=ids.length ? await prisma.bet.findMany({
    where:{periodId:{in:ids}},
    orderBy:{createdAt:"desc"},
    take:5,
    select:{
      id:true,gameCode:true,periodId:true,status:true,
      stake:true,payout:true,createdAt:true,settledAt:true
    }
  }) : [];

  console.log(`\n${room} | RULES=${rules?.gameCode||"❌"}`);
  console.log("PERIODS:",periods.map(p=>`ID=${p.id}:${p.status}:end=${p.endAt?.toISOString()}`).join(" | ")||"NONE");
  console.log("BETS:",bets.map(b=>`ID=${b.id}:P${b.periodId}:${b.status}:settled=${b.settledAt?"YES":"NO"}`).join(" | ")||"NONE");
}

await prisma.$disconnect();
