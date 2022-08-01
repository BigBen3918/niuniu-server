// by: Leo Pawel 	<https://github.com/galaxy126>

import * as fs from 'fs';
import * as crypto from 'crypto';

const colors = require('colors')

export const setlog = function(title:string,msg?:any,noWrite?:boolean) {
	const date = new Date();
	const datetext:string = [date.getUTCFullYear(), ('0' + (date.getUTCMonth() + 1)).slice(-2), ('0' + date.getUTCDate()).slice(-2)].join('-')
	const timetext:string = [('0' + date.getUTCHours()).slice(-2), ('0' + date.getUTCMinutes()).slice(-2), ('0' + date.getUTCSeconds()).slice(-2)].join(':')
	let isError = false
	if (msg && msg.message && msg.stack) {
		if (msg.code==='NETWORK_ERROR' || msg.code==='EAI_AGAIN') {
			msg = 'could not detect network'
		} else {
			msg = msg.stack || msg.message
		}
		
		isError = true
	}
	if (msg) msg = msg.split(/\r\n|\r|\n/g).map((v:any)=>'\t' + String(v)).join('\r\n')
	if (!noWrite) fs.appendFileSync(__dirname + '/../../logs/' + datetext+'.log', `[${timetext}] ${title}\r\n${msg ? msg + '\r\n' : ''}`)
	if (msg && isError) msg = colors.red(msg)
	console.log(
		colors.gray('[' + timetext + ']'),
		colors.white(title),
		msg ? '\r\n' + msg : ''
	)
};
export const md5=(plain: string)=>(crypto.createHash('md5').update(plain).digest("hex"))

export const hmac256 = (message:string, secret:string) => crypto.createHmac('SHA256', secret).update(message).digest('hex');
export const generatePassword = () => (Math.random()*1e10).toString(36).slice(-12)
export const N = (v:number,p:number=6) => Math.round(v * 10 ** p) / 10 ** p
export const lower = (s: string) => s.toLowerCase()

export const now = () => Math.round(new Date().getTime()/1000)

export const validateEmail = (email:string):boolean =>email.match(/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)!==null;
export const validateUsername = (username:string):boolean => /^[a-zA-Z0-9]{6,20}$/.test(username);

export const generateCode = () => {
	let code = String(Math.round(Math.random() * 899976 + 10012))
	if (code.length < 6) code = '0'.repeat(6 - code.length) + code
	return code
}
export const generateID = () => Math.round(new Date().getTime() / 1000 + Math.random() * 5001221051)

export const toDayTime = (time: number) => time - (time % 86400)
