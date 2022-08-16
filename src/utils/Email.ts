require("dotenv").config()
const isDev = process.env.NODE_ENV === 'development';
import axios from 'axios'
import * as fs from 'fs'
import * as nodemailer from 'nodemailer'


import config from '../config.json'
import setlog from '../setlog';

/* const MAILAPI = process.env.MAIL_TESTAPI || '';

const SMTPHOST = process.env.SMTP || '';
const SMTPPORT = Number(process.env.SMTP_PORT);
const SMTPUSER = process.env.SMTP_USER || '';
const SMTPPASS = process.env.SMTP_PSSS || ''; */

const template = fs.readFileSync(__dirname + '/../../email/template.html').toString('utf8');

export const sendRawEmail = (to:string, subject:string, html:string):Promise<boolean> => {
	return new Promise(resolve=>{
		try {
			// if (isDev) {
			// 	console.log(to, html.replace(/<[^>]*>?/gm, ''));
			// 	// resolve(true)
			// 	axios.post(config.email.testApi, {jsonrpc: "2.0", method: "send-email", params: [to, subject, html], id: 1}, {timeout: 60000, headers: {'Content-Type': 'application/json'}}).then(response=>{
			// 		if (response!==null && response.data) {
			// 			resolve(!!response.data.result);
			// 		} else {
			// 			resolve(false);
			// 		}
			// 	});
			// } else {
				const smtpTransport = nodemailer.createTransport(config.email.smtp);
		
				smtpTransport.sendMail({
					from: config.email.smtp.auth.user,
					to,
					subject,
					html
				}, (error, info) => {
					if (error) {
						console.log("sendRawEmail", error);
						resolve(false);
					} else {
						resolve(true);
					}
				})
			// }
		} catch (error) {
			setlog('sendRawEmail', error);
			resolve(false);
		}
	})
}

const sendEmail = async (email:string, subject:string, text:string, params?:{[key:string]:string}): Promise<boolean> => {
    try {
		const x = text.split(/\r\n|\r|\n/g);
		const lines = [`<tr><td style="font-size:18px;padding:20px 0;">${x[0]}<hr style="border-bottom: 1px solid #e6e6e6;"></td>`];
		for (let k=1; k<x.length; k++) {
			if ( x[k]==='{{code}}' ) {
				lines.push( `<tr><td style="padding:5px 0;font-size: 20px;font-weight: bolder;color:#e9b434;">${x[k]}</td></tr>` );
			} else {
				lines.push( `<tr><td style="font-size:14px;color:#444;line-height:30px;">${x[k]}</td></tr>` );
			}
		}
		const html = template.replace("{{content}}", lines.join(''));
        return await sendRawEmail(email, subject, html.replace(/\n|\t/g,"").replace(/{\{([^}]*)\}\}/g, (f,a)=>params[a]));
    } catch (error) {
        setlog("sendEmail", error);
    }
    return false;
}

export default sendEmail