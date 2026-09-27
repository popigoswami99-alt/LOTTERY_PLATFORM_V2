
export type AdditionalGame = {
  code:string
  name:string
  category:string
  status:"PLANNED"|"READY_TO_ATTACH"
  virtualOnly:boolean
}

export const ADDITIONAL_GAMES:AdditionalGame[]=[
 {code:"TRX_WINGO",name:"TRX / Hash WinGo",category:"Lottery",status:"READY_TO_ATTACH",virtualOnly:true},
 {code:"ROULETTE",name:"Roulette",category:"Casino",status:"PLANNED",virtualOnly:true},
 {code:"BLACKJACK",name:"Blackjack",category:"Casino",status:"PLANNED",virtualOnly:true},
 {code:"TEEN_PATTI",name:"Teen Patti",category:"Casino",status:"PLANNED",virtualOnly:true},
 {code:"SLOTS",name:"Slots",category:"Slots",status:"PLANNED",virtualOnly:true},
 {code:"FISHING",name:"Fishing",category:"Arcade",status:"PLANNED",virtualOnly:true}
]
