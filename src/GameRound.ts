/*function foo(model: {property1: number; property2: number}) {
    model.property1++;
    model.property2++;

    // Not needed but
    // considered good practice.
    return model;
}

const bar = { property1: 0, property2: 1 };
foo(bar);

console.log(bar.property1) // 1
console.log(bar.property2) // 2*/
// import { notDeepStrictEqual } from 'assert'
// import e from 'express'
// import { rename } from 'fs'
// import { ConnectionPoolMonitoringEvent } from 'mongodb'
// import { send } from 'process'
import { AnyBulkWriteOperation } from 'mongodb';
import { DPool, DUsers, GAMERULE, GAMESTEP, getLastUID, JUDGETYPE, SchemaPool, SchemaRound, SchemaUser, setLastUID } from './Model'
import { UserType, CLIENT_STATE, RoomType, sendToClients, CommandType, deleteRoom, RestartRound, findPlayerById, setPoolAmount, getPool, sendToClientsWithStat} from './SocketApi'
import { now } from './utils/helper';
const MAX_CARD = 5;


const GAME_TEXT_TIMERS = [
    "请选择抢庄倍数：{num}秒",
    "请等待其他玩家选择倍数：{num}秒",
    "请等待其他瓦加亮牌：{num}秒"
]



export class GameRound{
    room : RoomType
    cards : number[] = []
    secondTime : number = 0
    processDoneNumber : number = 0
    playerList : number[] = []
    interval : any = {}
    // bankerSelectTime, decideBanderTime, MultipleSelectTime, FilpCardTime
    //processTimeOut : number[] = [10, 2, 7, 10] 
    processTimeOut : number[] = [4, 1, 3, 6, 8]
    
    //Object.assign([], myArray);

    constructor(api: { room:RoomType }){
        this.room = api.room
        this.cards[0] = 0;
        for(let i = 0; i < 36; i++){
            this.cards[i] = i
        }
        this.shuffle()
        this.distributeCards4()
        this.startRound()
        this.room.step = GAMESTEP.BankerSelect;
        this.secondTime = this.processTimeOut[0];
        this.interval = setInterval(()=>{
            this.secondTime --;
            this.checkTime()
        }, 1000);

    }
    //room.ant = 100;
    
    shuffle(){
        let len = this.cards.length
        while (len > 1){
            len--
            var k =  Math.floor(Math.random() * len);
            var value = this.cards[k];
            this.cards[k] = this.cards[len];
            this.cards[len] = value;
        }
    }

    async startRound(){
        const us = [] as Array<{id: number, antes: number}>;

        for(let i = 0; i < 6; i ++){
            if (this.room.playerList[i] == undefined) {
                this.playerList.push(-1);
            } else {
                this.playerList.push(1);
                us.push({id: this.room.playerList[i].id, antes: this.room.antes});
            }
            // this.playerList.push(this.room.playerList[i] == undefined? -1 : 1)
        }
        for(const player of this.room.playerList){
            let sendData : number[] = []
            if(player == undefined) continue
            sendData = this.playerList.concat(player.cardList)//{result:getLobbyPageSummary(value.lobby)}
            sendToClients([player.id], "start-round", {result:sendData});
        }
        for(const spectator of this.room.spectatorList){
            let sendData : number[] = []
            sendData = this.playerList.concat([-1,-1,-1,-1,-1])
            sendToClients([spectator.id], "start-round", {result:this.playerList});
        }
        await this.writeStartRound(us)
    }

    async writeStartRound(us: Array<{id: number, antes: number}>) {
        const data = [] as AnyBulkWriteOperation<SchemaUser>[];
        let amount = 0
		for (let i of us) {
			data.push({updateOne: {filter: {_id: i.id}, update : {$dec: {balance: i.antes}}}});
            amount += i.antes;
		}
		//await DUsers.bulkWrite(data);
        setPoolAmount(getPool()[0] + amount * 9 / 100)
        // sendToClients([], "pool", {result:this.playerList});
    }
    
    SendCurrentRoundData(uid:number){
        let sendData : number[] = []
        const room = this.room;
        const players = room.playerList.filter((v)=>{
            if(v != undefined) return true
        })
        sendData.push(players.length)
        sendData.push(room.step)
        let bankerIndex = findPlayerById(this.room.bankerId, this.room.id)[0] as number
        if(bankerIndex == undefined) 
            bankerIndex = -1
        //banker id
        sendData.push(bankerIndex)
        for(let i = 0; i < 6; i++){
            if(room.playerList[i] == undefined){
                continue
            }
            //player position
            sendData.push(i)
            if(room.playerList[i].cardFilped)
                sendData = sendData.concat(room.playerList[i].cardList)
            else
                sendData = sendData.concat([-1,-1,-1,-1,-1])
            //multiple Number
            sendData.push(room.playerList[i].multiplier)
            sendData.push(this.room.playerList[i].judge)
            sendData.push(this.getCardMultipler(this.room.playerList[i].judge))
        }
        sendToClients([uid], "current-round-data", {result:sendData});

    }
    onSetRobBanker(uid:number, robBanker:number){
        this.findByUid(uid).robBanker = robBanker
        const sendData : number[] = []
        let processing : boolean = false
        for(const player of this.room.playerList){
            if(player == undefined){
                sendData.push(-1)
            } 
            else{
                sendData.push(player.robBanker)
                if(player.robBanker == -1)
                    processing = true;
            }
        }
        this.sendToPlayers("set-robBanker", {result:sendData})
        if(!processing){
            this.secondTime = this.processTimeOut[1]
            this.room.step = GAMESTEP.DecideRanker
        }
    }

    onSetMultiplier(uid:number, multiplier:number){
        this.findByUid(uid).multiplier = multiplier
        const sendData : number[] = []
        let processing : boolean = false
        for(const player of this.room.playerList){
            if(player == undefined){
                sendData.push(-1)
            } 
            else{
                if(player.id == this.room.bankerId)
                    player.multiplier = player.robBanker
                sendData.push(player.multiplier)
                if(player.multiplier == -1)
                    processing = true;
            }
        }
        this.sendToPlayers("set-multiplier", {result:sendData})
        if(!processing){
            this.secondTime = this.processTimeOut[3]
            this.room.step = GAMESTEP.ShowCard
            this.sendToPlayers("card-filp-start", {result:[0]})
            // for(const player of this.room.playerList){
            //     if(player == undefined) continue
            //        this.onFipCard(player.id, false)
            // }

            //this.decideRanker()
        }
    }

    onFilpOneCard(uid:number){
        if(this.findByUid(uid).cardList[4] != -1) return
        let sendData : number[] = []
        const card = this.cards.shift()
        this.findByUid(uid).cardList[4] = card
        sendData.push(card)
        
        sendToClients([uid], "filp-one-card", {result:sendData});
    }

    decideRanker(){
        const ids = [] as Array<{ids: number, robBanker: number}>;
        // let index:number = -1
		for (let i of this.room.playerList) {
            // index ++
			if (i == undefined) continue;
			ids.push({ids: i.id, robBanker: i.robBanker});
		}
		const list = ids.sort((a, b)=>(b.robBanker - a.robBanker))
        const maxBankerValue = list[0].robBanker;
        const bankers = ids.filter(obj => {
            return obj.robBanker === maxBankerValue
        });
        const bankerid = this.getRandomItem(bankers).ids

        this.room.bankerId = bankerid
        const sendData : number[] = []
        for(let i = 0; i < 6; i ++){
            if(this.room.playerList[i] == undefined){
                sendData.push(-1)
                continue
            }
            if(this.room.playerList[i].id == bankerid){
                if(this.room.playerList[i].robBanker == 0)
                    this.room.playerList[i].robBanker = 1
                this.room.playerList[i].multiplier = this.room.playerList[i].robBanker
                sendData.push(this.room.playerList[i].robBanker)
            } 
            else{
                sendData.push(-1)
            }
        }
        this.sendToPlayers("result-robBanker", {result:sendData})
        this.room.step = GAMESTEP.MultiplierSelect
        this.secondTime = this.processTimeOut[2]

    }

    distributeCards4(){
        for(const player of this.room.playerList){
            if(player == undefined) continue
            for(let i = 0; i < 5; i++){
                if(i < 4)
                    player.cardList.push(this.cards.shift())
                else
                    player.cardList.push(-1)
            }
        }
    }

    async onFipCard(uid:number){
        let sendData : number[] = []
        let processing : boolean = false
        if( this.findByUid(uid).cardList[4] == -1)
            this.findByUid(uid).cardList[4] = (this.cards.shift())
        const result = await this.getJudge(this.findByUid(uid).cardList)
        deleteRoom(-1)
        this.findByUid(uid).cardFilped = true 
        this.findByUid(uid).judge = result[0]
        this.findByUid(uid).cardPower = result[1]
        this.findByUid(uid).restCards = [result[2], result[3]]
        for(let i = 0; i < 6; i++){
            if(this.room.playerList[i] == undefined){
                sendData.push(JUDGETYPE.undefined)
                sendData.push(-1)
                //focuse cards
                sendData.push(-1)
                sendData.push(-1)
                //cards
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                continue;
            }
            if(this.room.playerList[i].cardFilped == false){
                sendData.push(JUDGETYPE.undefined)
                sendData.push(-1)
                //focuse cards
                sendData.push(-1)
                sendData.push(-1)
                //cards
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                sendData.push(-1)
                if(!this.room.playerList[i].cardFilped)
                    processing = true
            }else{
                sendData.push(this.room.playerList[i].judge)
                sendData.push(this.getCardMultipler(this.room.playerList[i].judge))
                
                if(this.room.playerList[i].restCards[0] != undefined) 
                    sendData.push(this.room.playerList[i].restCards[0])
                else
                    sendData.push(-1)

                if(this.room.playerList[i].restCards[1] != undefined) 
                    sendData.push(this.room.playerList[i].restCards[1])
                else
                    sendData.push(-1)

                sendData = sendData.concat(this.room.playerList[i].cardList)
                if(!this.room.playerList[i].cardFilped)
                    processing = true
            }
            
        }
        this.sendToPlayers("card-result", {result:sendData})
        if(!processing){
            this.secondTime = this.processTimeOut[4];
            this.room.step = GAMESTEP.Result
            const sendData : number[] = []
                const gameResult = this.getResult()
                deleteRoom(-1)
                sendData.push(gameResult[0].length)
                sendData.push(gameResult[1].length)
                for(let i = 0; i < gameResult[0].length; i++){
                    const index = this.room.playerList.findIndex(item=>{
                        if(item == undefined) return false
                        if(item.id == gameResult[0][i][0]) return true
                    })
                    sendData.push(index)
                    sendData.push(gameResult[0][i][2])
                }
                for(let i = 0; i < gameResult[1].length; i++){
                    const index = this.room.playerList.findIndex(item=>{
                        if(item == undefined) return false
                        if(item.id == gameResult[1][i][0]) return true
                    })
                    sendData.push(index)
                    sendData.push(gameResult[1][i][2])
                }
                this.sendToPlayers("game-result", {result:sendData})
        }
    }

    async getJudge(cards:number[]){
        if(cards.find(e=>e == -1))
            return [JUDGETYPE.undefined, -1]
        const tmp = {} as {[n: number]: number}
        let sortedArray : number[] = []
        for(let i = 0; i < 5; i++){
            sortedArray[i] = (cards[i]+1)%9
            if(sortedArray[i] == 0) sortedArray[i] = 9
        }
	    sortedArray = sortedArray.sort((a, b)=>(a - b))
        
		let dups = 0, cardPower = 0;
		{
			for (let i of sortedArray) {
				cardPower += Math.floor((i - 1) / 10)
				if (tmp[i]===undefined) {
					tmp[i] = 1;
				} else {
					tmp[i]
				}
			}
			for (let k in tmp) {
				if (tmp[k] > dups) dups = tmp[k];
			}
		}
		{ // 炸弹牛
			if (dups===4) return [JUDGETYPE.Bomb, cardPower];
		}
		{ // 四十 or 十小
			let sum = 0;
			for (let i of sortedArray) {
				sum += i;
			}
			if (sum >= 40) return [JUDGETYPE.Forty, cardPower];
			if (sum <= 10) return [JUDGETYPE.Ten, cardPower];
		}
		{ // 葫芦牛, 金牌牛牛, 金牌牛
			if (dups===3) {
				const cs = [] as number[];
				for (let k in tmp) cs.push(Number(k));
				if (cs.length===2) {
					return [JUDGETYPE.Gourd, cardPower];
				} else if (cs[1] + cs[2]===10) {
					return [JUDGETYPE.GoldDouble, cardPower];
				}
				return [JUDGETYPE.Gold, cardPower, 6];
			}
		}
		{ // 顺子
			let isSequence = true;
			let prev = 0;
			for (let i of sortedArray) {
				if (prev===0) {
					prev = i;
				} else if (prev + 1!==i) {
					isSequence = false;
					break;
				}
			}
			if (isSequence) return [JUDGETYPE.Sequence, cardPower];
		}
		{ // find cattle
            const getCardNumber = (card : number) => {
                card = (card+1)%9
                if(card == 0) card = 9
                return card
            }
            const buffer  = Object.assign([], cards);//cards
            for(let i = 0; i < 5; i++){
                const num1 = buffer[i]
                const buffer1 = buffer.slice(i+1, 5)
                for(let k = 0; k < 4; k ++){
                    const num2 = buffer1[k]
                    const buffer2 = buffer1.slice(k+1, 4)
                    for(let m = 0; m < 3; m++){
                        const num3 = buffer2[m]
                        const buffer3 = buffer2.slice(m+1, 3)
                        buffer3.slice(m,1)
                        if((getCardNumber(num1) + getCardNumber(num2) + getCardNumber(num3)) % 10 == 0){
                            // const rest = buffer.filter((a)=>{
                            //     return a !== num1 && a !== num2 && a != num3
                            // })
                            let helper = [] as number[]
                            helper = helper.concat([num1, num2, num3])
                            for(let i = 0; i < 5; i++){
                                for(let k = 0; k < 3; k++){
                                    if(buffer[i] == helper[k]){
                                        delete helper[k]
                                        delete buffer[i]
                                    }
                                }
                            }
                            const rest = buffer.filter((v)=>{
                                if(v != undefined) return true;
                            })
                            if((getCardNumber(rest[0]) + getCardNumber(rest[1])) % 10 == 0) 
                                 return [JUDGETYPE.Double, cardPower, rest[0], rest[1]]
                            return [((getCardNumber(rest[0]) + getCardNumber(rest[1])) % 10) as JUDGETYPE, cardPower, rest[0], rest[1]];
                        }
                    }
                }
                
            }
			/*let cattle = false;
			let a = 0, b = 0, c = 0, d = 0, e = 0;
			for (a = 0; a < MAX_CARD; a++) {
				for (b = 0; b < MAX_CARD; b++) {
					for (let c = 0; c < MAX_CARD; c++) {
						if (a!==b && b!==c && (sortedArray[a] + sortedArray[b] + sortedArray[c]) % 10===0) {
							cattle = true;
							break;
						}
					}
					if (cattle) break;
				}
				if (cattle) break;
			}
			if (cattle) {
				for (let k = 0; k < MAX_CARD; k++) {
					if (k!==a && k!==b && k!==c) {
						if (d===0) {
							d = k;
						} else if (k!==d) {
							e = k;
						}
					}
				}
				if (d + e===10) return [JUDGETYPE.Double, cardPower];
				return [((d + e) % 10) as JUDGETYPE, cardPower];
			}*/
		}
		return [JUDGETYPE.None, cardPower];
	}

    getResult(){
		const banker = this.findByUid(this.room.bankerId);
        const players = this.room.playerList
        const antes = this.room.antes
        for(let i = 0; i < 6; i ++){
            if(players[i] == undefined) continue
            if(players[i].id == this.room.bankerId) continue
            if(banker.judge > players[i].judge){
                const multiple = banker.multiplier * this.getCardMultipler(banker.judge)
                const earnValue = antes * multiple
                banker.earns.push([players[i].id, earnValue, multiple]);
            }else if(banker.judge == players[i].judge){
                banker.loss.push([players[i].id, antes, 1])
            }else{
                const multiple = players[i].multiplier * this.getCardMultipler(players[i].judge)
                const lossValue = antes * multiple
                banker.loss.push([players[i].id, lossValue, multiple])
            }
            
        }
        for(let i = 0; i < 6; i ++){
            if(players[i] == undefined) continue
            if(players[i].outBooking == true) 
                this.room.playerList[i] = undefined;
        }
        

        return [banker.earns, banker.loss]
        // let banker = 0;
		// for (let k=0; k < 6; k++) {
		// 	const i = this.room.playerList[k];
		// 	if (i == undefined) continue;
		// 	// const [judge, power] = this.getJudge(i.cardList)
		// 	// this.room.playerList[k].judge = judge;
		// 	// this.room.playerList[k].cardPower = power;
		// 	if (this.room.bankerId===i.id) banker = k;
		// }
		// const i = this.room.playerList[banker];
		// for (let m of this.room.playerList) {
		// 	if (m == undefined) continue;
		// 	if (m.id!==this.room.bankerId) {
		// 		if (m.judge > i.judge || m.judge===i.judge && m.cardPower > i.cardPower) {
		// 			const value = i.robBanker * m.multiplier * this.room.antes;
		// 			i.loss.push([m.id, value]);
		// 			m.earns.push([i.id, value]);
		// 		} else if (m.judge < i.judge || m.judge===i.judge && m.cardPower < i.cardPower) {
		// 			const value = i.robBanker * m.multiplier * this.room.antes;
		// 			i.earns.push([m.id, value]);
		// 			m.loss.push([i.id, value]);
		// 		}
		// 	}
		// }
		

		//await DRooms.updateOne({_id: roomId}, {$set: {userList: room.userList}});
		//return room;
    }

    async writeResult() {
        const users = [] as AnyBulkWriteOperation<SchemaUser>[];
		const poolUsers = [] as AnyBulkWriteOperation<SchemaPool>[];
		const timestamp = now()
		for (let i of this.room.playerList) {
			let earns = 0, loss = 0;
			for (let m of i.earns) earns += m[1];
			for (let m of i.loss) loss += m[1];
			users.push({
				updateOne: {
					filter: {_id: i.id}, 
					update : {$inc: {balance: earns}},
				}
			});
			if (earns - loss > 0) {
				poolUsers.push({
					updateOne: {
						filter: {_id: i.id},
						update : {
							$inc: {
								_id:		i.id,
								earns:		earns - loss,
								updated:	timestamp,
								created:	timestamp
							}
						},
						upsert: true
					}
				});
			}
		}
		await DUsers.bulkWrite(users);
		if (poolUsers.length) await DPool.bulkWrite(poolUsers);
    }

    checkTime(){
        if(this.room.step == GAMESTEP.BankerSelect){
            if(this.secondTime >= 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined)
                        sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[0].replace('{num}', String(this.secondTime))]});
                }
                for(let i = 0; i < this.room.spectatorList.length; i++){
                    if(this.room.spectatorList[i] != undefined)
                        sendToClients([this.room.spectatorList[i].id], "banker-select-time", {result: [GAME_TEXT_TIMERS[0].replace('{num}', String(this.secondTime))]});
                }
            }
            if(this.secondTime < 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined && this.room.playerList[i].robBanker == -1)
                        this.onSetRobBanker(this.room.playerList[i].id, 0)
                }
            }
        }

        if(this.room.step == GAMESTEP.DecideRanker){
            if(this.secondTime <= 0)
                this.decideRanker()
        }

        if(this.room.step == GAMESTEP.MultiplierSelect){
            if(this.secondTime >= 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined)
                        sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[1].replace('{num}', String(this.secondTime))]});
                }
                for(let i = 0; i < this.room.spectatorList.length; i++){
                    if(this.room.spectatorList[i] != undefined)
                        sendToClients([this.room.spectatorList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[1].replace('{num}', String(this.secondTime))]});
                }
            }
            if(this.secondTime < 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined && this.room.playerList[i].multiplier == -1)
                        this.onSetMultiplier(this.room.playerList[i].id, 1)
                }
            }
        }

        if(this.room.step == GAMESTEP.ShowCard){
            if(this.secondTime >= 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined)
                        sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[2].replace('{num}', String(this.secondTime))]});
                }
                for(const spectator of this.room.spectatorList){
                    sendToClients([spectator.id], "banker-select-time", {result:[GAME_TEXT_TIMERS[2].replace('{num}', String(this.secondTime))]});
                }
            }
            if(this.secondTime < 0){
                for(let i = 0; i < 6; i++){
                    if(this.room.playerList[i] != undefined && this.room.playerList[i].judge == JUDGETYPE.undefined && this.room.playerList[i].cardPower == -1)
                        this.onFipCard(this.room.playerList[i].id)
                }
            }
        }

        if(this.room.step == GAMESTEP.Result){
            if(this.secondTime == 0){
                this.sendToPlayers("end-round", {result:[0]})
            }

            if(this.secondTime < -2){
                RestartRound(this.room.id);
                clearInterval(this.interval)
                this.interval = undefined
            }
        }

    
    }

    findByUid(uid:number){
        let player : UserType
        for(let i = 0; i < 6; i++){
            if(this.room.playerList[i] == undefined) continue
            if (this.room.playerList[i].id == uid){
                player = this.room.playerList[i]
                break
            }
        }
        return player
    }

    sendToPlayers(protocol:CommandType, data:any){
        for(const player of this.room.playerList){
            if(player == undefined) continue
            sendToClients([player.id], protocol, data);
        }
        for(const spectator of this.room.spectatorList){
            sendToClients([spectator.id], protocol, data);
        }
    }

    getRandomItem(arr:Array<{ids: number, robBanker: number}>){
        const randomIndex = Math.floor(Math.random() * arr.length);
        const item = arr[randomIndex];
        return item;
    }

    getCardMultipler(judgeType:JUDGETYPE){
        const judge = judgeType as number
        if(judge == 0) return 0;
        if(judge > 0 && judge < 8) return 1;
        if(judge == JUDGETYPE.Cattle_8) return 2;
        if(judge == JUDGETYPE.Cattle_9) return 3;
        if(judge == JUDGETYPE.Double) return 4;
        if(judge == JUDGETYPE.Gold) return 4;
        if(judge == JUDGETYPE.GoldDouble) return 5;
        if(judge == JUDGETYPE.Gourd || judge == JUDGETYPE.Sequence) return 6;
        if(judge == JUDGETYPE.Forty || judge == JUDGETYPE.Ten) return 7
        if(judge == JUDGETYPE.Bomb) return 8;
        return -1
    }
}