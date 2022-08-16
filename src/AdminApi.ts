import * as websocket from 'websocket'
import { DUsers } from "./Model";
import { now, validateEmail } from "./utils/helper";
import { setSession } from "./utils/Redis";
import WebCrypto from "./utils/WebCrypto";
import config from './config.json'
import * as crypto from 'crypto'
import axios from 'axios'

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
		return { result: user._id };
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

} as {
	[method:string]:(con: websocket.connection, cookie:string, session:SessionType, ip:string, params:Array<any>)=>Promise<ServerResponse>
}

export default admin_method_list