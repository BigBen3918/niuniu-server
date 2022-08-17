
import { DPool, DRounds, DUsers, GAMERULE, GAMESTEP, getLastUID, JUDGETYPE, SchemaPool, SchemaRound, SchemaUser, setLastUID } from './Model'
import { UserType, CLIENT_STATE, RoomType, sendToClients, CommandType, deleteRoom, startRound, findPlayerById, addPoolAmount, sendToClientsWithStat} from './ClientApi'
import { now } from './utils/helper';
const MAX_CARD = 5;


const GAME_TEXT_TIMERS = [
	"请选择抢庄倍数：{num}秒",
	"请等待其他玩家选择倍数：{num}秒",
	"请等待其他玩家亮牌：{num}秒"
]



export class GameRound{
	room : RoomType
	cards : number[] = []
	secondTime : number = 0
	processDoneNumber : number = 0
	playerList : number[] = []
	interval : any = {}
	processTimeOut : number[] = [13, 2, 7, 6, 8]
	initialize(api: { room:RoomType }){
		this.room = api.room
		this.room.step = GAMESTEP.Ready;
		for(let i = 0; i < 36; i++){
			this.cards[i] = i
		}
		this.shuffle()
		this.distributeCards4()
		for (const player of this.room.playerList){
			// let sendData : number[] = []
			if(player == undefined) continue
			sendToClients([player.id], "ready-round", {result:[0]});
		}
		for (const spectator of this.room.spectatorList){
			sendToClients([spectator.id], "ready-round", {result: [0]});
		}
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
		const us = [] as number[];

		for(let i = 0; i < 6; i ++){
			if (this.room.playerList[i] === undefined) {
				this.playerList.push(-1);
			} else {
				this.playerList.push(1);
				us.push(this.room.playerList[i].id);
			}
		}
		for (const player of this.room.playerList){
			if(player == undefined) continue
			player.balance -= this.room.antes;2
			let sendData = this.playerList.concat(player.cardList)
			sendToClients([player.id], "start-round", {result:sendData});
		}
		for (const spectator of this.room.spectatorList){
			//sendToClients([spectator.id], "start-round", {result: this.playerList});
		}
		this.room.step = GAMESTEP.BankerSelect;
		this.secondTime = this.processTimeOut[0];
		await this.writeStartRound(us, this.room.antes)
	}

	async writeStartRound(us: number[], antes: number) {
		await DUsers.bulkWrite(us.map(i=>({
			updateOne: {
				filter: {_id: i}, 
				update : {$inc: {balance: -antes}}
			}
		})));
		let amount = antes * us.length;
		await addPoolAmount(amount * 0.09);

		await DRounds.insertOne({
			_id: 				this.room.roundId,
			antes:				this.room.antes,	// 底注
			bankerId:			this.room.bankerId,	// 抢庄
			userList:			[],
			owner:				amount * 0.7,	// 分给老板 直接分
			admin:				amount * 0.042,	// 管理员 4.2% 分给管理 直接分
			agent:				amount * 0.168,	// 底注的16.8%分给代理，直接分
			pool:				amount * 0.09,	// 底注的9% 进入奖池
			updated:			0,
			created:			now()	// 游戏结束时间
		})
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

	async onReadyRoundACK(uid:number){
		if(this.room.step != GAMESTEP.Ready && this.room.playerList) return;
		this.findByUid(uid).isReady = true;
		const players = this.room.playerList
		let allReady = false
		for(let i = 1; i < 6; i++){
			if(players[i] == undefined) continue
			if(!players[i].isReady && !players[i].outBooking){
				continue
			}
			allReady = true
		}
		if(allReady)
			await this.startRound();
	}

	onSetRobBanker(uid:number, robBanker:number){
		this.findByUid(uid).robBanker = robBanker
		const sendData : number[] = []
		let processing : boolean = false
		for(const player of this.room.playerList){
			if(player == undefined){
				sendData.push(-1)
			} else {
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
			} else {
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
			this.sendToPlayers("card-filp-start", {result:[0]});
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
		const result : number[] = []
		for(let i = 0; i < 6; i ++){
			if(this.room.playerList[i] == undefined){
				result.push(-1)
				continue
			}
			if(this.room.playerList[i].id == bankerid){
				if(this.room.playerList[i].robBanker == 0)
					this.room.playerList[i].robBanker = 1
				this.room.playerList[i].multiplier = this.room.playerList[i].robBanker
				result.push(this.room.playerList[i].robBanker)
			} else {
				result.push(-1)
			}
		}
		this.sendToPlayers("result-robBanker", {result})
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
		if( this.findByUid(uid).cardList[4] == -1) this.findByUid(uid).cardList[4] = (this.cards.shift())
		const result = await this.getJudge(this.findByUid(uid).cardList)
		deleteRoom(-1)
		this.findByUid(uid).cardFilped = true 
		this.findByUid(uid).judge = result[0]
		this.findByUid(uid).cardPower = result[1]
		this.findByUid(uid).restCards = [result[2], result[3]]
		for (let i = 0; i < 6; i++){
			if (this.room.playerList[i] == undefined){
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
			if (this.room.playerList[i].cardFilped == false){
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
			} else {
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
			if(this.room.step == GAMESTEP.Result) return
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
		//cards = [0,9,3,30,18]
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
					tmp[i]++;
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
				const keys = Object.keys(tmp)
				keys.forEach(key => {
					if(tmp[Number(key)] !== 3){
						cs.push(Number(key))
					}
				});
				
				
				if (cs.length===1) {
					return [JUDGETYPE.Gourd, cardPower];
				} else {
					switch ((cs[0] + cs[1]) % 10) {
					case 0: return [JUDGETYPE.GoldDouble, cardPower];
					case 1: return [JUDGETYPE.Gold_1, cardPower];
					case 2: return [JUDGETYPE.Gold_2, cardPower];
					case 3: return [JUDGETYPE.Gold_3, cardPower];
					case 4: return [JUDGETYPE.Gold_4, cardPower];
					case 5: return [JUDGETYPE.Gold_5, cardPower];
					case 6: return [JUDGETYPE.Gold_6, cardPower];
					case 7: return [JUDGETYPE.Gold_7, cardPower];
					case 8: return [JUDGETYPE.Gold_8, cardPower];
					case 9: return [JUDGETYPE.Gold_9, cardPower];
					}
				}
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
		const spectator = this.room.spectatorList
		const antes = this.room.antes
		for(let i = 0; i < 6; i ++){
			if(players[i] === undefined) continue
			if(players[i].id === this.room.bankerId) continue
			if(banker.judge > players[i].judge || (banker.judge === players[i].judge && banker.cardPower > players[i].cardPower)){
				const multiple = banker.multiplier * this.getCardMultipler(banker.judge)
				const earnValue = antes * multiple
				banker.earns.push([players[i].id, earnValue, multiple]);
				players[i].balance -= earnValue;
				banker.balance += earnValue;
				players[i].balanceChange = -earnValue;
				banker.balanceChange = earnValue;
			}else{
				const multiple = players[i].multiplier * this.getCardMultipler(players[i].judge)
				const lossValue = antes * multiple
				banker.loss.push([players[i].id, lossValue, multiple])
				players[i].balance += lossValue;
				banker.balance -= lossValue;
				players[i].balanceChange = lossValue;
				banker.balanceChange = -lossValue;
			}
			
		}
		this.writeResult();
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
		const room = this.room;
		const timestamp = now();

		const players = this.room.playerList.filter(i=>i!==undefined).map(i=>({
			id: 			i.id,
			robBanker:		i.robBanker,
			multiplier:		i.multiplier,
			judge:			i.judge,
			earns:			i.balanceChange
		}));

		await DUsers.bulkWrite(players.map(i=>({
			updateOne: {
				filter: {_id: i.id}, 
				update : {$inc: {balance: i.earns}},
			}
		})));

		await DPool.bulkWrite(players.filter(i=>i.earns>0).map(i=>({
			updateOne: {
				filter: {_id: i.id},
				update : {
					$set: {
						updated:	timestamp,
					},
					$inc: {
						earns:      i.earns,
					},
					$setOnInsert: {
						created:	timestamp
					}
				},
				upsert: true
			}
		})));
		// const totalAntes = room.antes
		await DRounds.updateOne({
			_id: room.roundId,
		}, {
			$set: {
				antes:				room.antes,	// 底注
				bankerId:			room.bankerId,	// 抢庄
				userList:			players,
				// owner:				number	// 分给老板 直接分
				// admin:				number	// 管理员 4.2% 分给管理 直接分
				// agent:				number	// 底注的16.8%分给代理，直接分
				// pool:				number	// 底注的9% 进入奖池
				updated:			timestamp	// 游戏结束时间
				// created:			number	// 游戏开始时间
			}
		})
	}

	checkTime(){
		if(this.room.step == GAMESTEP.BankerSelect){
			if(this.secondTime >= 0){
				for(let i = 0; i < 6; i++){
					if(this.room.playerList[i] != undefined){
						if(this.room.playerList[i].outBooking) continue
						sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[0].replace('{num}', String(this.secondTime))]});
					}
						
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
					if(this.room.playerList[i] != undefined){
						if(this.room.playerList[i].outBooking) continue
						sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[1].replace('{num}', String(this.secondTime))]});
					}
						
				}
				for(let i = 0; i < this.room.spectatorList.length; i++){
					if(this.room.spectatorList[i] != undefined){
						sendToClients([this.room.spectatorList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[1].replace('{num}', String(this.secondTime))]});
					}
						
				}
			}
			if(this.secondTime < 0){
				for(let i = 0; i < 6; i++){
					if(this.room.playerList[i] != undefined && this.room.playerList[i].multiplier == -1){
						if(this.room.playerList[i].outBooking) continue
						this.onSetMultiplier(this.room.playerList[i].id, 1)
					}
						
				}
			}
		}

		if(this.room.step == GAMESTEP.ShowCard){
			if(this.secondTime >= 0){
				for(let i = 0; i < 6; i++){
					if(this.room.playerList[i] != undefined){
						if(this.room.playerList[i].outBooking) continue
						sendToClients([this.room.playerList[i].id], "banker-select-time", {result:[GAME_TEXT_TIMERS[2].replace('{num}', String(this.secondTime))]});
					}
						
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
				const players = this.room.playerList
				for(let i = 0; i < 6; i ++){
					if(players[i] == undefined) continue
					if(players[i].outBooking == true) 
						this.room.playerList[i] = undefined;
				}
			}

			if(this.secondTime < -2){
				startRound(this.room.id);
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
			if(player.outBooking) continue
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
		/* if(judge == 0) return 1;
		if(judge > 0 && judge < 7) return 1; */
		if(judge == JUDGETYPE.Cattle_7 || judge == JUDGETYPE.Cattle_8) return 2;
		if(judge == JUDGETYPE.Cattle_9) return 3;
		if(judge == JUDGETYPE.Double || (judge >= JUDGETYPE.Gold_1 && judge <= JUDGETYPE.Gold_9)) return 4;
		if(judge == JUDGETYPE.GoldDouble || judge == JUDGETYPE.Sequence) return 5;
		if(judge == JUDGETYPE.Gourd) return 6;
		if(judge == JUDGETYPE.Forty || judge == JUDGETYPE.Ten) return 7
		if(judge == JUDGETYPE.Bomb) return 8;
		return 1;
	}
}