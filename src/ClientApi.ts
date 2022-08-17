// Project: umi-server-marketplace
// by: Leo Pawel 	<https://github.com/galaxy126>
require("dotenv").config()

import e, * as express from 'express'
import * as crypto from 'crypto'
import * as fs from 'fs'
import axios from 'axios'
import setlog from './setlog'
// import Model from './Model'
import * as websocket from 'websocket'
// import { parse as uuidParse } from 'uuid'
import config from './config.json'
import Socket from './utils/Socket'
import { getSession, setSession } from './utils/Redis'
import { /* md5, */ generateCode, now, validateEmail/* , validateUsername */ } from './utils/helper'
import { DMsg, DPool, DSendMoneyHistory, DSysMsg, DSysNotice, DUsers, DWithdraws, GAMERULE, GAMESTEP, getLastRoundId, getLastUID, getPool, getSysNotice, JUDGETYPE, SchemaMsg, SchemaRound, SchemaUser, setLastRoomId, setLastRoundId, setLastUID, setPool } from './Model'

/* import {Double} from 'mongodb' */
// var Double = require("mongodb").Double;

import AES from './utils/AES'
import WebCrypto from './utils/WebCrypto'
// import GameModel from './GameModel'
// import { stringify } from 'querystring'
// import { Session } from 'inspector'
// import { userInfo } from 'os'
// import { getCommentRange, getModeForResolutionAtIndex } from 'typescript'
import {GameRound} from './GameRound'
import { AnyBulkWriteOperation } from 'mongodb'
import sendEmail from './utils/Email'
// import { timeStamp } from 'console'
import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import admin_method_list from './AdminApi'

const locals = {
	'en-US': enUS,
	'zh-CN': zhCN,
}

const L = locals['zh-CN'];

const feeRate = 0.02;

export const clientRouter = express.Router()

export enum CLIENT_STATE {
	NONE,
	LOGIN,
	LOBBY,
	GAEM_SELECT,
	GAME,
}
interface ClientInfo {
	uid: 				number		// user id
	lobby: 				number		// lobby page number
	room: 				number      // room number
	state:              CLIENT_STATE	// state	
	gameRound:			any
}
export interface UserType {
	id:					number		// user.id
	isReady:            boolean
	alias:				string
	avatar:				string
	balance:			number
	cardFilped:			boolean
	cardList:			number[]	// current card holding status
	robBanker:			number		// 任何人可以抢庄，按照1，2，3，4倍数抢。选择倍数最高的玩家成为庄家, if zero, never 抢庄
	multiplier:			number		// affected by win bonus or loss, value in 1 ~ 4
	showManual:			boolean		// 亮牌模式， 若真, 搓牌模式，若否，亮牌模式
	judge:				number		// 牌型
	cardPower:			number
	balanceChange?:		number
	earns:				Array<[uid: number, value: number, multiple: number]>	// get from
	loss:				Array<[uid: number, value: number, multiple: number]>	// send to
	restCards:			number[]
	outBooking:			boolean
}

export interface RoomType {
	id:					number,
	roundId:			number
	rule:				GAMERULE
	antes:				number	// 底注 base price
	step:				GAMESTEP// game step
	bankerId:			number	// = player.id, if zero, no selected banker
	playerList: 		UserType[]
	spectatorList:		UserType[]
	updated:			number
	created:			number
	maxPlayer:			number
	gameRound:			any
	
}
let poolAmount:number = 0;
// let poolLeftTime: number = 60 * 60 * 12 // 12hour

setInterval(()=>{
	checkPoolTime()
}, 1000);

const checkPoolTime = async () =>{
	// poolLeftTime --;
	const timestamp = now() + 3600 * 8;

	const poolPeriod = 3600 * 12;
	const poolLeftTime = poolPeriod - timestamp % poolPeriod;
	if (poolLeftTime<=1) {
		await distributePool();
	}
	sendToClientsWithStat(CLIENT_STATE.GAME, "pool-data", {result:[poolAmount, poolLeftTime]});
}

const distributePool = async () => {
	try {
		const _poolAmount = poolAmount;
		if (_poolAmount) {
			const rows = await DPool.find({}).sort({earns: -1}).limit(10).toArray()
			await DPool.deleteMany({});
			await setPool(0);
			poolAmount = 0;
			let total = 0;
			for (let i of rows) {
				total += i.earns;
			}
			const users = [] as AnyBulkWriteOperation<SchemaUser>[];
			for (let i of rows) {
				const rewards = Math.round(poolAmount * i.earns * 10 / total) / 10;
				if (rewards > 0) {
					users.push({updateOne: {filter: {_id: i._id}, update: {$inc: {rewards}}}});
				}
			}
			if (users.length) {
				await DUsers.bulkWrite(users);
			}
		}
	} catch (error) {
		
	}
}

export const addPoolAmount = async (amount:number) => {
	poolAmount += amount;
	await setPool(poolAmount);
}

const rooms = {} as {[id: number]: RoomType}
let lastRoomId = 100001;

const clients = new Map<websocket.connection, ClientInfo>()

const addClient = (con: websocket.connection) => {
	clients.set(con, {uid: 0, lobby: 0, room: 0, state: CLIENT_STATE.LOGIN, gameRound: {}});
}

const updateClient = (con: websocket.connection, attrs: Partial<ClientInfo>) => {
	const v = clients.get(con);
	if (v) clients.set(con, {...v, ...attrs});
}

const removeClient = (con: websocket.connection) => {
	const v = clients.get(con);
	if(v && v.room != 0){
		const room = rooms[v.room]
		const player = findPlayerById(v.uid, v.room)[1] as UserType;
		const index = findPlayerById(v.uid, v.room)[0] as number;
		if(index !== -1){
			if(index < 6){
				if(room.step == GAMESTEP.None){
					room.playerList[index] = undefined
					decisionPlayType(v.room);
				}else{
					player.outBooking = true;
				}
			}else{
				delete room.spectatorList[index - 6];
				room.spectatorList = room.spectatorList.filter((v) =>{
					if(v != undefined) return true
				})
				updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
			}	
		}
	}
	//if (v) delete clientById[v.uid];
	clients.delete(con);
}

const readAvatar = (avatarId: number) => {
	const uri = __dirname+'/../avatars/' + (avatarId<1e6 ? 'default' : 'custom') + '/' + avatarId + '.png'
	const avatar = fs.readFileSync(uri).toString('base64');
	return avatar
}

clientRouter.post("/",async (req:express.Request, res:express.Response)=>{
	const { jsonrpc, method, params, id } = req.body as RpcRequestType
	let response = {} as {error?:number, result?:any}
	if (jsonrpc==='2.0' && Array.isArray(params)) {
		const func = method_list[method]
		if (func) {
			try {
				const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress)
				let token = req.headers["x-token"] || ''
				let session:SessionType|null = null
				if (token==='70383088c9a4bb8d5993cf8edf6fd5a1f416f77c467068f39c09ae619b6bddcd') {
					session = {
						uid: 0,
						created: 1644923661
					}
					response = await func(null, String(token), session, ip, params)
				} else {
					response.error = 32604
				}
			} catch (error:any) {
				setlog("rpc-error", error)
				response.error = 32000
			}
		} else {
			response.error = 32601
		}
	} else {
		response.error = 32600
	}
	res.json({jsonrpc: "2.0", id, ...response})
})


const initSocket = async (server: any)=>{
	Socket(server, Actions)
	setlog("initialized socket server.")
	poolAmount = await getPool();
}

export const Actions = {
	onRequest(ip:string, origin:string, wss:string, cookie:string) {
		try {
			if ((wss===config.apiKey || wss===config.adminKey) && cookie) {
				// const bytes = uuidParse(cookie)
				// if (bytes) return true
				if (config.debug) setlog(`client connected [${cookie}]`, '', true)
				return true
			}
		} catch (error) { }
		return false
	},
	onConnect(con:websocket.connection, ip:string, wss:string, cookie:string) {
		getSession(cookie).then(async session=>{
			try {
				if (session===null) {
					session = {created:now()}
					await setSession(cookie, session)
				}
				addClient(con);
				setlog(`added socket ${cookie} ${wss===config.adminKey ? ' (admin)' : ''}`, '', true)
			} catch (error) {
				setlog('socket-connect', error)
			}
		})
	},

	onDisconnect(con:websocket.connection, cookie:string) {
		setlog(`deleted socket ${cookie}`, '', true)
		removeClient(con)
	},

	onData(con:websocket.connection, msg:string, ip:string, wss:string, cookie:string) {
		try {
			let response = {} as {error?:number, result?:any}

			if (wss===config.adminKey) {
				const { id, method, params } = JSON.parse(msg) as {id: number, method: string, params: string[]}
				const func = admin_method_list[method]
				if (func) {
					try {
						getSession(cookie).then(async session=>{
							try {
								if (session===null) {
									session = {created:now()}
									await setSession(cookie, session)
								}
								updateClient(con, {uid: session.uid || 0})
								response = await func(con, cookie, session, ip, params)
								con.send(JSON.stringify({jsonrpc: "2.0", id, method, ...response}))
							} catch (error) {
								setlog('onData', error)
								con.send(JSON.stringify({method, error: 32000}))
							}
						})
						return
					} catch (error: any) {
						setlog('portal-' + method, error)
						if (error.code===11000) {
							response.error = 19999
						} else {
							response.error = 32000
						}
					}
				} else {
					response.error = 32601
				}
				con.send(JSON.stringify({method, ...response}))
			} else {
				const aes = new AES()
				const { method, args } = JSON.parse(aes.decrypt(msg)) as {method: string, args: string[]}
				const func = method_list[method]
				if (func) {
					try {
						getSession(cookie).then(async session=>{
							try {
								if (session===null) {
									session = {created:now()}
									await setSession(cookie, session)
								}
								updateClient(con, {uid: session.uid || 0})
								response = await func(con, cookie, session, ip, args)
								con.send(aes.encrypt(JSON.stringify({method, ...response})))
							} catch (error) {
								setlog('onData', error)
								con.send(aes.encrypt(JSON.stringify({method, error: 32000})))
							}
						})
						return
					} catch (error: any) {
						setlog('portal-' + method, error)
						if (error.code===11000) {
							response.error = 19999
						} else {
							response.error = 32000
						}
					}
				} else {
					response.error = 32601
				}
				con.send(aes.encrypt(JSON.stringify({method, ...response})))
			}
		} catch (error) {
			setlog('socket-data', error, false)
		}
	}
}

const verifyCaptcha = async (token:string) => {
	try {
		const src = new TextEncoder().encode(config.deamSecret.slice(0,16))
		const iv = Buffer.from(src.buffer, src.byteOffset, src.byteLength)
		let buf = config.deamKey.slice(9).split('').map((c) => {switch (c) { case '-': return '+'; case '_': return '/'; default: return c;}}).join('');
		const key = crypto.createSecretKey(Buffer.from(buf, 'base64'));
		const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
		const data = Buffer.concat([cipher.update(new TextEncoder().encode(token)), cipher.final()]).toString('base64');

		const response = await axios.post(config.deamUrl, {
			jsonrpc: "2.0", 
			id:Math.round(Math.random()*1e6), 
			method:'deam-verify', 
			params:[config.deamId, data]
		});
		if (response.data.error) return response.data.error
		if (response.data.result) return response.data.result
	} catch (error) {
		console.log(error)
	}
	return 10000
}

export type CommandType = 
	"send-code" | 				// []
	"register" | 
	"login" | 
	"lobby_updateRoom" | 		// [roomId, rule, antes, userCount, ...avatarList, ...]
	// "lobby_addUser" | 			// [roomId, uid, avatar]
	// "lobby_exitUser" | 			// [roomId, uid]
	"game_getRoom" | 			// [roomId, uid, alias, avatar]
	"game_addUser" | 			// [roomId, uid, alias, avatar]
	"game_exitUser" | 			// []
	"game_updateUser" | 		// []
	"game_setRobBanker" |		// []
	"game_setMutiplier" |		// []
	"game_result" |		
	"enter-room-data"	|
	"start-round"		|
	"enter-lobby"	|	// []
	"error"			|
	"banker-select-time" |
	"set-robBanker"		|
	"result-robBanker"  |
	"set-multiplier"		|
	"card-result"			|
	"card-filp-start"		|
	"game-result"			|
	"end-round"				|
	"filp-one-card"			|
	"current-round-data"	|
	"pool-data"				|
	"update-user-info"		|
	"ready-round"
"none";

/*
if specified roomId, notify for only specific room, else, notify all.
*/
export const sendToClientsWithStat = (state:CLIENT_STATE, method: CommandType, args:{}) => {
	const aes = new AES()
	for(const [key, value] of clients.entries()){
		if(state == CLIENT_STATE.NONE){
			if(value.state !== CLIENT_STATE.LOGIN){
				key.send(aes.encrypt(JSON.stringify({method, ...args})))
			}
		}
		if(value.state == state){
			key.send(aes.encrypt(JSON.stringify({method, ...args})))
		}
	}
}
export const sendToClients = (ids: number[]|websocket.connection, method: CommandType, args: {}) => {
	const aes = new AES()
	if (Array.isArray(ids)) {
		// for(const [key, value] of clients.entries()){
		// 	if(value.state == CLIENT_STATE.LOBBY){
		// 		sendToClients(key, "enter-lobby", {result:getLobbyPageSummary(value.lobby)})
		// 	}
		// }
		for (let i of ids) {
			const con = clientById(i);
			if (con) {
				con.send(aes.encrypt(JSON.stringify({method, ...args})))
			}
		}
	} else {
		ids.send(aes.encrypt(JSON.stringify({method, ...args})))
	}
}

export const sendError = (con:websocket.connection|number[], error: Error) => {
	sendToClients(con, "error", { error:error })
}

const method_list = {
	// UI functions
	"send-code": async (con, cookie, session, ip, params)=>{
		const [ email ] = params as [email: string];
		if (!validateEmail(email)) return {error: 20001};
		const user = await DUsers.findOne({email});
		if (user!==null) return {error: 10000};

		// if (user.password!==WebCrypto.hash(password)) return {error: ERROR.LOGING_PASSWORD_INVALID}
		//if (user.active===false) return { error: ERROR.LOGING_NO_ACTIVE};
		const code = generateCode();
		const subject = L["email.register.subject"];
		const content = L["email.register.content"];
		const result = await sendEmail(email, subject, content, {code});
		if (result===true) {
			session.verify = {email, code};
			await setSession(cookie, session);
			sendToClients(con, "send-code", {result:[0]});
			console.log('send email code', code, email);
			return {result: true}
		} else {
			console.log('failed to send email code', email);
			return { error:10319 };
		}
		

		// return { result: true };
	},

	"register": async (con, cookie, session, ip, params)=>{
		const [ alias, email, code, password ] = params as [ alias:string, email:string, code:string, password:string ]
		if (session.verify===undefined) return {error: 0};
		if (!validateEmail(email)) return {error: 20001};
		if (password.length<6 || password.length>32) return {error: 20004};
		const verify = session.verify;
		if (email!==verify.email) return {error: 0};
		if (code!==verify.code) return {error: 20002};

		const rows = await DUsers.find({$or: [{email}, {alias}]}).toArray()
		if (rows.length!==0) {
			return {error: 10000}
			// return {error: 20035}
		}
		const timestamp = now()
		const _id = await getLastUID() + Math.round(Math.random() * 10)
		await setLastUID(_id)

		const avatar = Math.floor(Math.random() * 44) + 1;

		await DUsers.insertOne({
			_id,
			email,
			alias,
			password:			WebCrypto.hash(password),
			balance:			0,
			rewards:			0,
			avatar,
			parent:				0,
			lastLogged:			0,
			loginCount:			0,
			active:				true,
			updated:			timestamp,
			created:			timestamp,
		});

		await DPool.insertOne({
			_id,
			earns:              0,
			updated:			timestamp,
			created:			timestamp,
		});
		sendToClients(con, "register", {result:[0]});
		return { result: true }
	},

	"login": async (con, cookie, session, ip, params)=>{
		const [ email, password ] = params as [email: string, password: string];
		if (!validateEmail(email)) return {error: 20000};
		if (password.length<6 || password.length>32) return {error: 20004};
		const user = await DUsers.findOne({email});
		if (user===null) return {error: 20300};
		if (user.password!==WebCrypto.hash(password)) return {error: 20005}
		if (user.active===false) return { error: 20006};
		session.uid = user._id;
		sendUserInfo(user._id, true)
		//const avatar = readAvatar(user.avatar);
		await setSession(cookie, session);
		//const poolUser = await DPool.findOne({_id: user._id});
		//const exp = poolUser===null ? 0 : poolUser.earns;
		//const notice = await getSysNotice();

		//const result = [user.alias, user._id, user.balance, exp, avatar, notice]
		await DUsers.updateOne({_id: user._id}, {$set: {lastLogged: now(), loginCount: user.loginCount + 1}});

		
		updateClient(con, {uid: user._id, room:0, state: CLIENT_STATE.GAEM_SELECT});
		return { result:[0] };
	},
	
	"reset": async (con, cookie, session, ip, params)=>{
		const [ email ] = params as [email: string];
		if (!validateEmail(email)) return {error: 20001};
		const user = await DUsers.findOne({email});
		if (user===null) return {error: 10000};
		if (user.active===false) return { error: 20006};
		// session.uid = user._id;
		// await setSession(cookie, session);
		// // const result = {
		// // 	uid:			user._id,
		// // 	lastLogin: 		user.lastLogged
		// // }
		// const result = [user.alias, user._id, user.balance, user.exp, user.avatar]
		// await DUsers.updateOne({_id: user._id}, {$set: {lastLogged: now(), loginCount: user.loginCount + 1}});
		// updateClient(con, {uid: user._id, room:0, state: CLIENT_STATE.GAEM_SELECT});
		return { result: true };
	},

	"enter-lobby": async (con, cookie, session, ip, params)=>{
		updateClient(con, {state: CLIENT_STATE.LOBBY});
		let [page] = params as [page: number]
		page = parseInt(page.toString())
		const result = getLobbyPageSummary(page)
		if(result == undefined) return { result  : false}
		//sendToClients(, "lobby_updateRoom", {result:getLobbyRoomSummary(lastRoomId)});
		updateClient(con, {lobby: page, room: 0, state: CLIENT_STATE.LOBBY});
		return { result };
	},
	"exit-lobby": async (con, cookie, session, ip, params)=>{
		updateClient(con, {lobby: 0, room: 0});
		return { result: true };
	},

	"create-room": async (con, cookie, session, ip, params)=>{
		let [ rule, antes ] = params as [rule: number, antes: number]
		const uid = session.uid
		if (uid===undefined) return {error: 10000}
		if(parseFloat(antes.toString()) === NaN) return {error: 10001}
		rule = parseInt(rule.toString())
		antes = parseFloat(antes.toString())
		if (rule!==0 || antes<0.5 || antes>20 || antes == NaN) return {error: 20400}
		// Find a room you have already joined.
		const row = await DUsers.findOne({_id: uid});
		if (row) {
			const balance = Number(row.balance);
			if(balance < antes) return {error: 20401}
			const alias = row.alias;
			const avatar = readAvatar(row.avatar);
			
			lastRoomId = lastRoomId + Math.ceil(Math.random()*10);
			const test = Object.keys(rooms)
			const timestamp = now()
			rooms[lastRoomId] = {
				id: 				lastRoomId,
				roundId:			0,
				rule,
				antes,
				step:				GAMESTEP.None,// game step
				bankerId:			-1,	// = player.id, if zero, no selected banker
				playerList: 			[{
					id:				uid,
					isReady:		false,
					alias,
					avatar,
					cardFilped:		false,
					balance,			
					cardList:		[],
					robBanker:		-1,		// 任何人可以抢庄，按照1，2，3，4倍数抢。选择倍数最高的玩家成为庄家, if zero, never 抢庄
					multiplier:		-1,		// affected by win bonus or loss, value in 1 ~ 4
					showManual:		false,		// 亮牌模式， 若真, 搓牌模式，若否，亮牌模式
					judge:			JUDGETYPE.undefined,	// 牌型
					cardPower:		-1,
					earns:			[],
					loss:			[],
					restCards:      [],
					outBooking:		false,
				},undefined,undefined,undefined,undefined,undefined],
				spectatorList:      [],
				updated:			timestamp,
				created:			timestamp,
				maxPlayer:			32,
				gameRound:			{}
			}
			//const testClass = new GameRound({room:rooms[lastRoomId]})
			//rooms[lastRoomId].gameRound = testClass;
			updateClient(con, {room: lastRoomId, state: CLIENT_STATE.GAME});
			SendLobbyData()
			SendEnterRoomData(uid, lastRoomId, 0)
			return { result: true };
		}
		return { result: false };
	},

	"test-create-room": async (con, cookie, session, ip, params)=>{
		let [ uid, antes ] = params as [testUid: number, antes: number]
		const rule = 0
		antes = parseFloat(antes.toString())
		uid = parseInt(uid.toString())
		const row = await DUsers.findOne({_id: uid});
		if (row) {
			const alias = row.alias;
			const avatar = readAvatar(row.avatar);
			const balance = Number(row.balance)
			lastRoomId = lastRoomId + Math.ceil(Math.random()*10);
			const timestamp = now()
			rooms[lastRoomId] = {
				id:					lastRoomId,
				roundId:			0,
				rule,
				antes,
				step:				GAMESTEP.None,// game step
				bankerId:			-1,	// = player.id, if zero, no selected banker
				playerList: 			[{
					id:				uid,
					isReady: 		false,
					alias,
					balance,
					avatar,
					cardFilped:		false,
					cardList:		[],
					robBanker:		-1,		// 任何人可以抢庄，按照1，2，3，4倍数抢。选择倍数最高的玩家成为庄家, if zero, never 抢庄
					multiplier:		-1,		// affected by win bonus or loss, value in 1 ~ 4
					showManual:		false,		// 亮牌模式， 若真, 搓牌模式，若否，亮牌模式
					judge:			JUDGETYPE.undefined,	// 牌型
					cardPower:		-1,
					earns:			[],
					loss:			[],
					restCards:      [],
					outBooking:		false
				},undefined,undefined,undefined,undefined,undefined],
				spectatorList: 		[],
				updated:			timestamp,
				created:			timestamp,
				maxPlayer:			32,
				gameRound:			{}
			}
			//const testClass = new GameRoom({room:rooms[lastRoomId]})
			//updateClient(con, {room: lastRoomId});
			SendLobbyData()
			return { result: true };
		}
		return { result: false };
	},

	"join-room": async (con, cookie, session, ip, params)=>{
		let [ roomId ] = params as [roomId: number];
		const uid = session.uid;
		roomId = parseInt(roomId.toString())
		if (uid===undefined) return {error: 20100};
		if (rooms[roomId]===undefined) return;
		if (findPlayerById(uid, roomId)[1] != undefined) return {error: 10000};
		updateClient(con, {room: roomId, state: CLIENT_STATE.GAME});
		let g : Boolean
		g = await addPlayer(uid, roomId);
		await deleteRoom(-1)
		broadcastEnterRoomData(roomId)
		await deleteRoom(-1)
		SendLobbyData()
		if(g) {
			rooms[roomId].step = GAMESTEP.Ready;
			await startRound(roomId)
		}

	},

	"test-join-room": async (con, cookie, session, ip, params)=>{
		let [ uId, roomId ] = params as [uId : number , roomId: number];
		const uid = parseInt(uId.toString())
		roomId = parseInt(roomId.toString())
		
		if (uid===undefined) return {error: 20100};
		if (rooms[roomId]===undefined) return;
		//updateClient(con, {room: roomId, state: CLIENT_STATE.GAME_READY});
		let g : Boolean
		g = await addPlayer(uid, roomId);
		//for delay
		await deleteRoom(-1)
		broadcastEnterRoomData(roomId)
		await deleteRoom(-1)
		SendLobbyData()
		if(g) await startRound(roomId)
	},
	"ready-round": async (con, cookie, session, ip, params)=>{
		let [ roomId] = params as [roomId: number]
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		rooms[roomId].gameRound.onReadyRoundACK(uid)
		// const result = await GameModel.setRobBanker(roomId, uid, robBanker)
		// // notify room
		// sendToClients([], "game_setRobBanker", [String(uid)]);
		// return { result }
	},

	"set-robBanker": async (con, cookie, session, ip, params)=>{
		let [ roomId, robBanker ] = params as [roomId: number, robBanker: number]
		roomId = parseInt(roomId.toString())
		robBanker = parseInt(robBanker.toString())
		if (isNaN(robBanker) || robBanker<0 || robBanker>4) return {error: 20030};
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		rooms[roomId].gameRound.onSetRobBanker(uid, robBanker)
		
		// const result = await GameModel.setRobBanker(roomId, uid, robBanker)
		// // notify room
		// sendToClients([], "game_setRobBanker", [String(uid)]);
		// return { result }
	},

	"set-multiplier": async (con, cookie, session, ip, params)=>{
		let [ roomId, multiplier ] = params as [roomId: number, multiplier: number]
		roomId = parseInt(roomId.toString())
		multiplier = parseInt(multiplier.toString())
		if (isNaN(multiplier) || multiplier<1 || multiplier>4) return {error: 20030};
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		rooms[roomId].gameRound.onSetMultiplier(uid, multiplier)
		//const result = await GameModel.setMultiplier(roomId, uid, multiplier)
		// sendToClients([], "game_setMutiplier", [String(uid)]);
		// return { result }
	},

	"filp-card": async (con, cookie, session, ip, params)=>{
		let [ roomId ] = params as [roomId: number]
		roomId = parseInt(roomId.toString())
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		rooms[roomId].gameRound.onFipCard(uid)
	},

	"filp-one-card": async (con, cookie, session, ip, params)=>{
		let [ roomId ] = params as [roomId: number]
		roomId = parseInt(roomId.toString())
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		rooms[roomId].gameRound.onFilpOneCard(uid)
		//const result = await GameModel.setMultiplier(roomId, uid, multiplier)
		// sendToClients([], "game_setMutiplier", [String(uid)]);
		// return { result }
	},

	"leave-room": async (con, cookie, session, ip, params)=>{
		let [ roomId ] = params as [roomId: number]
		roomId = parseInt(roomId.toString())
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
	
		//rooms[roomId].playerList[uid] = undefined
		const index = findPlayerById(uid, roomId)[0] as number
		if(index > 5){
			delete rooms[roomId].spectatorList[index - 6];
			rooms[roomId].spectatorList = rooms[roomId].spectatorList.filter((v) =>{
				if(v != undefined) return true
			})
			updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
			await deleteRoom(-1)
			broadcastEnterRoomData(roomId)
		}else if(index <= 5 && index >= 0){
			if(rooms[roomId].step == GAMESTEP.Result || rooms[roomId].step == GAMESTEP.None){
				rooms[roomId].playerList[index] = undefined;
				updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
				return decisionPlayType(roomId);
			}else{
				return {error: 20101};
			}
	
		}
		
		
		//const result = await GameModel.setMultiplier(roomId, uid, multiplier)
		// sendToClients([], "game_setMutiplier", [String(uid)]);
		// return { result }
	},
	
	"get-exps": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const rows = await DPool.find({}).sort({earns: -1}).limit(10).toArray()
		const rowUsers = await DUsers.find({_id: {$in: rows.map(i=>i._id)}}).toArray();
		const result = [] as string[];
		const users = {} as {[id: number]: {alias: string, avatar: number}}
		for (let i of rowUsers) {
			users[i._id] = {alias: i.alias, avatar: i.avatar || i._id};
		}
		result.push(String(rows.length));
		for (let i of rows) {
			result.push(String(i._id))
			result.push(users[i._id].alias)
			result.push(readAvatar(users[i._id].avatar))
			result.push(String(i.earns));
		}
		return { result }
	},
	"send-coin": async (con, cookie, session, ip, params)=>{
		let [ userid, amount ] = params as [userid: string, amount: string];
		const uid = session.uid;
		const otherId = Number(userid);
		const quantity = Number(amount);
		if(quantity === 0) return {error: 20402};
		if (uid===undefined) return {error: 20100};

		const other = await DUsers.findOne({_id: otherId});
		if (other===null) return {error: 20300}
		const user = await DUsers.findOne({_id: uid});
		if (user.balance < quantity) return {error: 20401}; // 余额不够  no enough balance
		await DUsers.bulkWrite([
			{
				updateOne: {
					filter: {_id: otherId},
					update: {
						$inc: {balance: quantity}
					}
				}
			},
			{
				updateOne: {
					filter: {_id: uid},
					update: {
						$inc: {balance: -quantity}
					}
				}
			}
		]);
		await DSendMoneyHistory.insertOne({
			from_uid:				uid,
			to_uid:                 otherId,
			balance:               quantity,
			from_updated:			0,	// 读取时间
			to_updated:			0,	// 读取时间
			created:			now()	// 发送时间
		});
		await DSysMsg.insertOne({
			uid:				otherId,
			contents:			`您收到了 ${quantity}个金币从${user.alias}。`,
			updated:			0,	// 读取时间
			created:			now()	// 发送时间
		});
		// update all clients
		sendUserInfo(uid, false)
		return { result : [0] }
	},

	"get-moneylog": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const rows = await DSendMoneyHistory.find({$or:[{to_uid:uid, to_updated: 0},{from_uid:uid, from_updated: 0}]}).sort({created: 1}).toArray();
		//await DSendMoneyHistory.updateMany({to_uid:uid, to_updated: 0}, {$set: {to_updated: now()}});
		//await DSendMoneyHistory.updateMany({from_uid:uid, from_updated: 0}, {$set: {from_updated: now()}});
		const result = []
		result.push(rows.length)
		rows.forEach(row => {
			if(row.from_uid === uid){
				result.push(row.to_uid)
				result.push(0)
			}else if(row.to_uid === uid){
				result.push(row.from_uid)
				result.push(1)
			}
			result.push(row.balance)
			result.push(row.created)
		});
		return {result}
	},

	"get-sysmsg": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const rows = await DSysMsg.find({uid, updated: 0}).sort({created: 1}).toArray();
		const result = [];
		const count = rows.length;
		result.push(count);
		if (count > 0) {
			rows.forEach(row => {
				result.push(row.uid);
				result.push(row.contents);
				result.push(row.created);
			});
			const updated = now();
			await DSysMsg.updateMany({uid, updated: 0}, {$set: {updated}});
		}
		sendUserInfo(uid, false);
		return {result};
	},

	"send-msg": async (con, cookie, session, ip, params)=>{
		let [ contents ] = params as [message: string]
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		await DMsg.insertOne({
			uid:				uid,
			contents,
			isRev:				false, // received from support
			updated:			0,	// 读取时间
			created:			now()	// 发送时间
		})
		// updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
		// const result = await GameModel.setMultiplier(roomId, uid, multiplier)
		// sendToClients([], "game_setMutiplier", [String(uid)]);
		return { result: false };
	},

	"get-msg": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const rows = await DMsg.find({uid, updated: 0}).sort({created: 1}).toArray()
		await DMsg.updateMany({uid, updated: 0}, {$set: {updated: now()}});
		
		// updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});

		return { result: false };
	},
	"get-downloadlink": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		// const rows = await DMsg.find({uid, updated: 0}).sort({created: 1}).toArray()
		// await DMsg.updateMany({uid, updated: 0}, {$set: {updated: now()}});
		
		// updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
		const result = []
		result.push("https://niuniu.deamchain.com/niuniu_0.1.0.apk")
		return {result};
	},
	"get-backendlink": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		// const rows = await DMsg.find({uid, updated: 0}).sort({created: 1}).toArray()
		// await DMsg.updateMany({uid, updated: 0}, {$set: {updated: now()}});
		
		// updateClient(con, {state: CLIENT_STATE.LOBBY, room: 0});
		const result = []
		result.push("https://niuniu.deamchain.com/client/login")
		return {result};
	},
	"get-rewards": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const user = await DUsers.findOne({_id: uid});
		const rewards = String(Math.floor((user.rewards || 0) * 10) / 10);
		return {result: [rewards]};
	},
	"climb-rewards": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const user = await DUsers.findOne({_id: uid})
		if (user.rewards) {
			await DUsers.updateOne({
				_id: uid
			}, {
				$set: {
					rewards: 0
				},
				$inc: {
					balance: user.rewards
				}
			})
		}
		sendUserInfo(uid, false)
		return {result: true};
	},
	/* "get-payment": async (con, cookie, session, ip, params)=>{
		let [ type ] = params as [type: "bank"|"alipay"];
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const w = await DWithdraws.findOne({$query: {uid, type}, $orderby: {$created : -1}});
		if (w!==null) {
			return {result: [type, w.bank, w.account, w.owner]};
		}
		return {result: []};
	}, */
	"set-withdraw": async (con, cookie, session, ip, params)=>{
		const [ type, bank, account, owner, quantity ] = params as [type: "bank"|"alipay", bank: string, account: string, owner: string, quantity: string];
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const amount = Number(quantity);
		const user = await DUsers.findOne({_id: uid})
		const availableAmount = Math.floor(amount / 100) * 100;
		if (availableAmount!==amount) return {error: 20523};
		const fee = amount * feeRate;
		if (user.balance < amount + fee) return {error: 20401};
		await DUsers.updateOne({_id: uid}, {$inc: {balance: -(amount + fee)}});
		await DWithdraws.insertOne({
			uid,
			type,
			bank,
			account,
			owner,
			amount,
			fee,
			status:		false,
			updated:	0,
			created:	now()
		});
		sendUserInfo(uid, false);
		return {result: ["0"]};
	},
	"get-withdraw": async (con, cookie, session, ip, params)=>{
		const uid = session.uid;
		if (uid===undefined) return {error: 20100};
		const rows = await DWithdraws.find({uid}).sort({created: -1}).limit(20).toArray();
		//await DSendMoneyHistory.updateMany({to_uid:uid, to_updated: 0}, {$set: {to_updated: now()}});
		//await DSendMoneyHistory.updateMany({from_uid:uid, from_updated: 0}, {$set: {from_updated: now()}});
		const result = []
		result.push(rows.length)
		rows.forEach(row => {
			result.push(row.type)
			result.push(row.account)
			result.push(row.amount)
			/* result.push(row.status) */
			result.push(row.updated)
		});
		return {result}
	},
} as {
	[method:string]:(con: websocket.connection, cookie:string, session:SessionType, ip:string, params:Array<any>)=>Promise<ServerResponse>
}



const SendLobbyData = () =>{
	const lobbyUser = {} as {con: websocket.connection, page: number}
	for(const [key, value] of clients.entries()){
		if(value.state == CLIENT_STATE.LOBBY){
			sendToClients(key, "enter-lobby", {result:getLobbyPageSummary(value.lobby)})
		}
	}
}

const sendUserInfo = async (uid:number, sendAvata:boolean) =>{
	const user = await DUsers.findOne({_id: uid});
	if (user===null) return {error: 20300};
	let avatar : string
	if(sendAvata)
		avatar = readAvatar(user.avatar);
	else
		avatar = "0"
	const rewards = user.rewards || 0;
	const poolUser = await DPool.findOne({_id: uid});
	const exp = poolUser===null ? 0 : poolUser.earns;
	const notice = await getSysNotice();
	const countMsg = await DSysMsg.count({uid, updated: 0});
	
	const supportUrl = "https://niuniu.deamchain.com/support/deposit/fdsfsfdsfdsfdsfdsfdsfsdfsdfs";
	const result = [user.alias, user._id, user.balance, exp, avatar, countMsg, rewards, notice, supportUrl]

	sendToClients([uid], "update-user-info", {result: result});
}

const clientById = (id : number) =>{
	for(const [key, value] of clients.entries())
		if(value.uid == id) return key
	return undefined
	
}

const getLobbyRoomSummary = (id : number) =>{
	if(rooms[id] === undefined) return undefined
	const sendRoomData = []
	sendRoomData.push(id.toString())
	sendRoomData.push(rooms[id].rule.toString())
	sendRoomData.push(rooms[id].antes.toString())
	sendRoomData.push("1")
	for(let i = 0; i < 6; i++){
		if(rooms[id].playerList[i] == undefined)
			sendRoomData.push("0")
		else
			sendRoomData.push(rooms[id].playerList[i].avatar)
	}
	return sendRoomData

} 

const decisionPlayType = async (roomId: number) => {
	let playerCount = 0
	const room = rooms[roomId]

	const moveToSpectator = (player : UserType ) => {
		const a = room.playerList.indexOf(player) 
		room.playerList[a] = getPlayer()
		room.spectatorList.push(player)
	}

	const getPlayer = () => {
		let newPlayer : UserType
		for(const spectator of room.spectatorList){
			if(spectator.balance > room.antes){
				room.spectatorList.splice(room.spectatorList.indexOf(spectator), 1)
				newPlayer =  spectator
				playerCount ++
			}
		}
		return newPlayer
	}
		
	if (room.step == GAMESTEP.None) {
		for(let i = 0; i < 6; i++){
			const player = room.playerList[i];
			if(player == undefined){
				room.playerList[i] = getPlayer();
			}else{
				const row = await DUsers.findOne({ _id : player.id })
				if(row){
					if(Number(row.balance) < room.antes){
						moveToSpectator(player);
						console.log(room)
					}else{
						playerCount ++
					}
				}
			}
		}
	} else {
		return
	}

	if( playerCount == 0 ){
		await deleteRoom(roomId)

	} 
	
	if(room.step == GAMESTEP.None && playerCount > 1){
		return true;
	}
	await deleteRoom(-1)
	SendLobbyData()
	return false
	
}

// const startRound = async (roomId:number) => {
// 	const room = rooms[roomId];
// 	room.roundId = await getLastRoundId() + 1;
// 	await setLastRoundId(room.roundId);
// 	const gameRound = new GameRound({room: room})
// 	room.gameRound = gameRound
// }
export const startRound = async (roomId:number) => {
	const room = rooms[roomId]
	room.step = GAMESTEP.None
	room.bankerId = -1
	
	room.updated = now()
	delete room.gameRound
	for(let i =0; i < 6; i++){
		if(room.playerList[i] == undefined) continue
		room.playerList[i].cardFilped = false
		room.playerList[i].cardList = []
		room.playerList[i].robBanker = -1
		room.playerList[i].multiplier = -1
		room.playerList[i].judge = JUDGETYPE.undefined
		room.playerList[i].cardPower = -1
		room.playerList[i].earns = []
		room.playerList[i].loss = []
		room.playerList[i].restCards = []
	}
	const playable = await decisionPlayType(roomId);
	await deleteRoom(-1)
	broadcastEnterRoomData(roomId)
	if(playable){
		await deleteRoom(-1)
		SendLobbyData()
		await deleteRoom(-1)
		const room = rooms[roomId];
		room.roundId = await getLastRoundId() + 1;
		await setLastRoundId(room.roundId);
		const gameRound = new GameRound();
		gameRound.initialize({room: room});
		room.gameRound = gameRound;
		//await startRound(roomId)
	}
}
const broadcastEnterRoomData = (roomId:number) =>{
	let position: number
	position = 0
	for(const player of rooms[roomId].playerList){
		if(player != undefined)
			SendEnterRoomData(player.id, roomId, position)
		position ++
	}
	for(const spectator of rooms[roomId].spectatorList){
		SendEnterRoomData(spectator.id, roomId, position)
		position ++
	}
}

const SendEnterRoomData = (id:number, roomId:number, position:number) => {
	const room = rooms[roomId]
	const enterRoomData = []
	//room id
	enterRoomData.push(room.id)
	//antes
	enterRoomData.push(room.antes)
	//player site position, (it == 7) spectator else player
	enterRoomData.push(position)
	//spectator count
	enterRoomData.push(room.spectatorList.length)
	//players info
	for(let i = 0; i < 6; i++){
		if(room.playerList[i] == undefined){
			enterRoomData.push(0)
			enterRoomData.push(0)
			enterRoomData.push(0)
			continue
		}
		enterRoomData.push(room.playerList[i].alias)
		enterRoomData.push(room.playerList[i].avatar)
		enterRoomData.push(room.playerList[i].balance)
	}
	//testCode!!(need delete)
	// for(let i = 0; i < 6; i++){
	// 	if(room.playerList[i] == undefined){
	// 		enterRoomData.push(0)
	// 		enterRoomData.push(0)
	// 		enterRoomData.push(0)
	// 		continue
	// 	}
	// 	enterRoomData.push(room.playerList[i].alias)
	// 	//for(let i = 0; i < 30; i++){
	// 		enterRoomData.push(room.playerList[i].avatar)
	// 	//}
		
	// 	enterRoomData.push(room.playerList[i].balance)
	// }
	sendToClients([id], "enter-room-data", {result:enterRoomData})
}

// const createRoom = (rule:number, antes:number) => {
// 	lastRoomId = lastRoomId + Math.ceil(Math.random()*10);
// 	const timestamp = now()
// 	let roomId = lastRoomId
// 	rooms[lastRoomId] = {
// 		id: 				roomId,
// 		roundId:			0,
// 		rule,
// 		antes,
// 		step:				GAMESTEP.Created,// game step
// 		bankerId:			0,	// = player.id, if zero, no selected banker
// 		playerList: 		[undefined, undefined, undefined, undefined, undefined, undefined],
// 		spectatorList:		[],
// 		updated:			timestamp,
// 		created:			timestamp,
// 		maxPlayer:          30,
// 		gameRound:			{}
// 	}
// 	// setTimeout(function(){
// 	// 	decisionPlayType(roomId)
// 	// }, 2)
// }

const addPlayer = async ( uid : number, roomId : number ) => {
	const room = rooms[roomId]
	const row = await DUsers.findOne({_id: uid});
	if(row){
		const alias = row.alias
		const avatar = readAvatar(row.avatar)
		const balance = Number(row.balance)
		room.spectatorList.push({
			id:				uid,
			alias,
			isReady: 		false,
			avatar,
			cardFilped:		false,
			balance,
			cardList:		[],
			robBanker:		-1,		// 任何人可以抢庄，按照1，2，3，4倍数抢。选择倍数最高的玩家成为庄家, if zero, never 抢庄
			multiplier:		-1,		// affected by win bonus or loss, value in 1 ~ 4
			showManual:		false,		// 亮牌模式， 若真, 搓牌模式，若否，亮牌模式
			judge:			JUDGETYPE.undefined,	// 牌型
			cardPower:		-1,
			earns:			[],
			loss:			[],
			restCards:      [],
			outBooking:		false
		});
		if(room.step == GAMESTEP.None){
			return decisionPlayType(roomId)
		}else{
			room.gameRound.SendCurrentRoundData(uid);
		}
		return false
	}
	return false

}

export const deleteRoom = async ( id:number ) => {
	//await deleteRoom = asysc() => {Promise<void>(delete rooms[id])}
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 200);
		delete rooms[id]
	})
}


// const deletPlayer = ( uid:number, roomId:number) => {
// 	const room = rooms[roomId]
// 	for(const player of room.playerList){
// 		if(room.step == GAMESTEP.Created || GAMESTEP.Ready || player.id == uid){
// 			room.playerList.splice(room.playerList.indexOf(player), 1)
// 			decisionPlayType(roomId);
// 			return true
// 		}
// 	}
// 	for(const spectator of room.spectatorList){
// 		if(room.step == GAMESTEP.Created || GAMESTEP.Ready || spectator.id == uid){
// 			room.spectatorList.splice(room.spectatorList.indexOf(spectator), 1)
// 			return true
// 		}
// 	}
// 	return false
// }

const getLobbyPageSummary = (page : number) =>{
	//6 rooms per page(from  0 page)
	// if(Object.keys(rooms).length <= page * 6){
	// 	return ["0"]
	// }
	let pageRoomData = []
	//count of lobby room
	const lobbyRoomCount = Math.floor((Object.keys(rooms).length - 1) / 6 + 1)
	pageRoomData.push(lobbyRoomCount.toString())
	//conut of room
	let roomCount : number
	if(page == lobbyRoomCount - 1){
		roomCount = Object.keys(rooms).length % 6
		if(roomCount == undefined)
			roomCount = 0;
		if(Math.floor(Object.keys(rooms).length/6) == page + 1 && roomCount == 0)
			roomCount = 6;
	}
	else if(page < lobbyRoomCount - 1){
		roomCount = 6
	}else{
		roomCount = 0;
	}
		
	
	pageRoomData.push(roomCount.toString())
	for(let i = page * 6; i < page * 6 + roomCount; i ++){
		pageRoomData = pageRoomData.concat(getLobbyRoomSummary(parseInt(Object.keys(rooms)[i])))
		//const test = getLobbyRoomSummary(parseInt(Object.keys(rooms)[i]));
	}
	return pageRoomData
}

export const findPlayerById = (uid:number, roomId:number) => {
	const room = rooms[roomId]
	let position: number
	position = -1
	const result = []
	for(const player of room.playerList) {
		position ++
		if(player === undefined) continue
		if(player.id == uid){
			result.push(position)
			result.push(player)
		}
		
	}
	for(const spectator of room.spectatorList){
		position++
		if(spectator?.id == uid){
			result.push(position)
			result.push(spectator)
		}
	}
	result.push(-1)
	result.push(undefined)
	return result
}

export default initSocket
