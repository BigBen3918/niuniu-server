import * as websocket from 'websocket'
import { DAgents, DUsers, getLastUID } from "./Model";
import { now, validateEmail } from "./utils/helper";
import { setSession } from "./utils/Redis";
import WebCrypto from "./utils/WebCrypto";
import config from './config.json'
import * as crypto from 'crypto'
import axios from 'axios'
import { getRooms } from './ClientApi';

const verifyCaptcha = async (token:string) => {
	try {
		const src = new TextEncoder().encode(config.deamSecret.slice(0,16))
		const iv = Buffer.from(src.buffer, src.byteOffset, src.byteLength)
		let buf = config.deamKey.slice(9).split('').map((c) => {switch (c) {case '-': return '+'; case '_': return '/'; default: return c;}}).join('');
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

const admin_method_list = {
	"login": async (con, cookie, session, ip, params)=>{
		const [ email, password ] = params as [email: string, password: string];
		if (!validateEmail(email)) return {error: 1002};
		if (password.length<6 || password.length>32) return {error: 1009};
		const user = await DUsers.findOne({email});
		if (user===null) return {error: 1004};
		if (user.password!==WebCrypto.hash(password)) return {error: 1006}
		session.uid = user._id;
		await setSession(cookie, session);
		await DUsers.updateOne({_id: user._id}, {$set: {lastLogged: now(), loginCount: user.loginCount + 1}});
		return { result: {uid: user._id, avatar: user.avatar, alias: user.alias} };
	},
	
	"reset": async (con, cookie, session, ip, params)=>{
		// const [ email ] = params as [email: string];
		// if (!validateEmail(email)) return {error: ERROR.LOGIN_EMAIL_INVALID};
		// const user = await DUsers.findOne({email});
		// if (user===null) return {error: ERROR.LOGING_USER_INVALID};
		// if (user.active===false) return { error: ERROR.LOGING_NO_ACTIVE};
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

	// user management
	"user-getAll": async (con, cookie, session, ip, params)=>{
		const uid = session.uid || 0;
		if (uid<1 || uid > 10) return {error: 30001};
		
		let [page, pageSize] = params as [page: number, pageSize: number];

		const total = await DUsers.count({});
		if (pageSize < 10) {
			pageSize = 10;
		} else if (pageSize > 100) {
			pageSize = 100;
		}
		let pageTotal = Math.ceil(total / pageSize);
		if (page < 1) {
			page = 1;
		} else if (page > pageTotal) {
			page = pageTotal;
		}
		let start = (page - 1) * pageSize;
		let end = start + pageSize;
		if (end > total) end = total;

		const rows = await DUsers.find({_id: {$gt: 10}}).sort({created: -1}).skip(start).limit(pageSize).toArray();

		const data = [] as Array<{id: number, email: string, alias: string, balance: number, rewards: number, avatar: number, active: boolean, created: number}>
		for (let i of rows) {
			data.push({
				id: i._id,
				email: i.email,
				alias: i.alias,
				balance: i.balance,
				rewards: i.rewards,
				avatar: i.avatar,
				active: i.active,
				created: i.created,
			});
		}
		return { result: {
			data, 
			meta: {
				page,
				pageSize,
				pageTotal,
				total,
			}
		}};
	},
	"user-get": async (con, cookie, session, ip, params)=>{
		const uid = session.uid || 0;
		if (uid<1 || uid > 10) return {error: 30001};

		const [id] = params as [id: number];
		const i = await DUsers.findOne({_id: id});
		if (i) {
			return {
				result: {
					id: i._id,
					email: i.email,
					alias: i.alias,
					balance: i.balance,
					rewards: i.rewards,
					avatar: i.avatar,
					active: i.active,
					created: i.created,
				}
			}
		}
		return {error: 30000};
	},
	// "user-update": async (con, cookie, session, ip, params)=>{
	// 	const uid = session.uid || 0;
	// 	if (uid<1 || uid > 10) return {error: 30001};
	// 	const [id, email, alias] = params as [id: number, email: string, alias];
	// 	const i = await DUsers.findOne({_id: id});
	// 	if (i) {
	// 		return {
	// 			result: {
	// 				id: i._id,
	// 				email: i.email,
	// 				alias: i.alias,
	// 				balance: i.balance,
	// 				rewards: i.rewards,
	// 				avatar: i.avatar,
	// 				active: i.active,
	// 				created: i.created,
	// 			}
	// 		}
	// 	}
	// 	return {error: 30000};
	// 	return { result: true };
	// },
	// "user-password": async (con, cookie, session, ip, params)=>{
	// 	return { result: true };
	// },
	// "user-delete": async (con, cookie, session, ip, params)=>{
	// 	return { result: true };
	// },
	// agent management

	"agent-getAll": async (con, cookie, session, ip, params)=>{
		const uid = session.uid || 0;
		if (uid===0) return {error: 30000};
		const result = [] as Array<{id: number, email: string, avatar: number, ratio: number, created: number}>;
		const rows = await DAgents.find({pid: uid}).limit(100).toArray();
		if (rows.length) {
			const users = await DUsers.find({_id: {$in: rows.map(i=>i._id)}}, {projection: {email: 1}}).toArray();
			const us = {} as {[id: number]: {email: string, avatar: number}}
			for (let i of users) {
				us[i._id] = {
					email: i.email,
					avatar: i.avatar
				}
			}
			for (let i of rows) {
				if (us[i._id]!==undefined) {
					result.push({
						id: i._id,
						avatar: us[i._id].avatar,
						email: us[i._id].email,
						ratio: i.ratio,
						created: i.created
					})
				}
			}
		}
		return { result };
	},
	"agent-update": async (con, cookie, session, ip, params)=>{
		const uid = session.uid || 0;
		if (uid===0) return {error: 30000};
		const [id, ratio] = params as [id: Number, ratio: number];

		const rows = await DAgents.find({pid: uid}).limit(100).toArray();
		
		// Split total should never exceed 70% 
		let total = ratio;
		for (let i of rows) {
			if (i._id!==id) {
				total += i.ratio;
			}
		}
		if (total > 0.7) return {error: 30002};
		// add or 

		return { result: true };
	},
	"agent-delete": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	// deposit management
	"deposit-getAll": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"deposit-get": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"deposit-update": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"deposit-delete": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	// withdraw management
	"withdraw-getAll": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"withdraw-get": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"withdraw-update": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	"withdraw-delete": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	// reward pool management
	"pool-getAll": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	// pool log management
	"pool-getLog": async (con, cookie, session, ip, params)=>{
		return { result: true };
	},
	// room management
	"room-getAll": async (con, cookie, session, ip, params)=>{
		const rooms = getRooms();
		return { result: true };
	},
} as {
	[method:string]:(con: websocket.connection, cookie:string, session:SessionType, ip:string, params:Array<any>)=>Promise<ServerResponse>
}

export default admin_method_list