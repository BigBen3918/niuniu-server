import * as mongodb from 'mongodb'
import config from './config.json'
import setlog from './setlog'
const client = new mongodb.MongoClient('mongodb://localhost:27017')
const db = client.db(config.database)


export enum JUDGETYPE {
	undefined = -1,
	None,		// 无牛			牌型：五张牌中，任意3张牌的点数之和都不为10的整数倍
	Cattle_1,	// 牛1 			有牛牌型：5张牌中有3张牌的点数之和为10的整数倍，另外2张牌的点数之和mod（10）等于几，即为牛几
	Cattle_2,	// 牛2
	Cattle_3,	// 牛3
	Cattle_4,	// 牛4
	Cattle_5,	// 牛5
	Cattle_6,	// 牛6
	Cattle_7,	// 牛7
	Cattle_8,
	Cattle_9,	// 牛8
	Double,		// 牛牛  		牌型：5张牌中有3张牌的点数之和为10的整数倍，并且，另外2张牌的点数之和为10的整数倍
	Gold,		// 金牌牛		5张牌中有3张一样
	GoldDouble,	// 金牌牛牛		5张牌中有3张一样，且两张之和为10
	
	Sequence,	// 顺子			5张牌中的数字 为顺子（2，3，4，5，6）
	Gourd,		// 葫芦牛		5张牌的牌型为 AABBB （3张一样的牌加2张一样的牌）
	Ten,		// 十小			无花中5张牌的点数相加之和小于等于10
	Forty,		// 四十			无花中5张牌的点数相加之和大于或者等于40
	Bomb,		// 炸弹牛		5张牌中4张点数一样（ABBBB）
}

export enum GAMESTEP {
	Created,
	Ready,				// 分派		// 分派牌张
	BankerSelect,
	DecideRanker,		// 选择抢庄倍数
	MultiplierSelect,	// 选择倍数
	ShowCard,			// 亮牌
	Result,				// 结果
}

export enum GAMERULE {
	None,
}

export interface SchemaConfig {
	_id:				number
	uid?:				number
	roomId?:			number
	roundId?:			number
}


export interface SchemaAdmin {
	_id:				number
	email:				string
	username:			string
	password:			string
	balance:			number
	lastLogged:			number
	updated:			number
	created:			number
}

export interface SchemaAgent {
	_id:				number
	email:				string
	username:			string
	password:			string
	balance:			number
	ratio:				number
	parents:			Array<{id: number, ratio: number}>
	lastLogged:			number
	updated:			number
	created:			number
}

export interface SchemaUser {
	_id:				number
	email:				string
	alias:				string
	password:			string
	balance:			number
	/* exp:				number */
	avatar:				number
	parent:				number
	lastRoom:			number
	lastLogged:			number
	loginCount:			number
	active:				boolean
	updated:			number
	created:			number
}

export interface GameUser {
	serverId:			number	// reserve
	id:					number		// user.id
	
	isPlayer:			boolean
	cardList:			number[]	// current card holding status
	robBanker:			number		// 任何人可以抢庄，按照1，2，3，4倍数抢。选择倍数最高的玩家成为庄家, if zero, never 抢庄
	multiplier:			number		// affected by win bonus or loss, value in 1 ~ 4
	showManual:			boolean		// 亮牌模式， 若真, 搓牌模式，若否，亮牌模式
	judge:				number		// 牌型
	cardPower:			number
	earns:				Array<[uid: number, value: number]>	// get from
	loss:				Array<[uid: number, value: number]>	// send to
}

// current room status
export interface SchemaRoom {
	_id:				number
	roundId:			number
	rule:				GAMERULE
	antes:				number	// 底注 base price
	step:				GAMESTEP// game step
	bankerId:			number	// = player.id, if zero, no selected banker
	userList: 			GameUser[]
	updated:			number
	created:			number
}

// game round history
export interface SchemaRound {
	_id:				number
	antes:				number	// 底注
	bankerId:			number	// 抢庄
	userList:			Array<{
		id: 			number	// 用户ID
		robBanker:		number	// 抢庄数字
		multiplier:		number	// 倍数
		judge:			JUDGETYPE	// 牌型
		earns:			number	// if win, is plus, else minus
	}>
	owner:				number	// 分给老板 直接分
	admin:				number	// 管理员 4.2% 分给管理 直接分
	agent:				number	// 底注的16.8%分给代理，直接分
	pool:				number	// 底注的9% 进入奖池
	updated:			number	// 游戏结束时间
	created:			number	// 游戏开始时间
}

// 当前奖池
export interface SchemaPool {
	_id:				number	// user.id
	earns:				number	// 玩家积分只计算赢了的金额
	updated:			number	// 游戏结束时间
	created:			number	// 游戏开始时间
}

// 奖池分派历史 - 分派给12小时内积分最高的前10名玩家 分派比例为
export interface SchemaPoolLogs {
	_id:				number	// 分派时间
	userList:			Array<{
		id: 			number	// 用户ID
		rewards:		number
	}>
}

export interface SchemaSysMsg {
	uid:				number
	contents:			string
	updated:			number	// 读取时间
	created:			number	// 发送时间
}

export interface SchemaMsg {
	uid:				number
	contents:			string
	isRev:				boolean // received from support
	updated:			number	// 读取时间
	created:			number	// 发送时间
}

export const DConfig = 		db.collection<SchemaConfig>('config')
export const DAdmin = 		db.collection<SchemaUser>('admins')
export const DUsers = 		db.collection<SchemaUser>('users')
export const DRooms = 		db.collection<SchemaRoom>('rooms')
export const DRounds = 		db.collection<SchemaRound>('rounds')
export const DPool = 		db.collection<SchemaPool>('pool')
export const DPoolLogs = 	db.collection<SchemaPoolLogs>('poollogs')
export const DSysMsg =		db.collection<SchemaSysMsg>('sysmsgs')
export const DMsg =			db.collection<SchemaMsg>('msgs')

const open = async () => {
	try {
		await client.connect()
		setlog('connected to MongoDB')
		// DConfig.createIndex({chain: 1}, {unique: true})

		
		// DConfig.createIndex({id: 1}, {unique: true, name: 'cnf_id'})

		// DAdmin.createIndex({id: 1}, {unique: true, name: 'adm_id'})
		DAdmin.createIndex({email: 1}, {unique: true, name: 'adm_email'})
		// DAdmin.createIndex({username: 1}, {unique: true, name: 'adm_name'})

		// DUsers.createIndex({id: 1}, {unique: true, name: 'usr_id'})
		DUsers.createIndex({email: 1}, {unique: true, name: 'usr_email'})
		
		// DRooms.createIndex({id: 1}, {unique: true, name: 'rom_id'})
		
		// DRounds.createIndex({id: 1}, {unique: true, name: 'rnd_id'})
		
		// DPool.createIndex({uid: 1}, {unique: true, name: 'pol_id'})
		
		DPoolLogs.createIndex({uid: 1}, {unique: false, name: 'plog_id'})
	} catch (error) {
		setlog('Connection to MongoDB failed', error)
		process.exit()
	}
}

const close = async () => {
	try {
		await client.close()
	} catch (error) {
		process.exit()
	}
}

export const getLastUID = async (): Promise<number> => {
	const row = await DConfig.findOne({id: 1})
	if (row===null) return 100001
	return row.uid || 100001
}

export const setLastUID = async (uid: number): Promise<boolean> => {
	const res = await DConfig.updateOne({id: 1}, {$set: {uid}}, {upsert: true})
	return res.modifiedCount + res.upsertedCount > 0
}

export const getLastRoomId = async (): Promise<number> => {
	const row = await DConfig.findOne({id: 1})
	if (row===null) return 100001
	return row.roomId || 100001
}

export const setLastRoomId = async (roomId: number): Promise<boolean> => {
	const res = await DConfig.updateOne({id: 1}, {$set: {roomId}}, {upsert: true})
	return res.modifiedCount + res.upsertedCount > 0
}

export const getLastRoundId = async (): Promise<number> => {
	const row = await DConfig.findOne({id: 1})
	if (row===null) return 100001
	return row.roundId || 100001
}

export const setLastRoundId = async (roundId: number): Promise<boolean> => {
	const res = await DConfig.updateOne({id: 1}, {$set: {roundId}}, {upsert: true})
	return res.modifiedCount + res.upsertedCount > 0
}

export default {open, close}