// by: Leo Pawel 	<https://github.com/galaxy126>

import * as http from 'http'
import express from 'express'
import cors from 'cors'
import os from 'os'
import formData from 'express-form-data'

import setlog from './setlog'
import Model from './Model'
import config from './config.json'
import clientApi, { clientRouter } from './ClientApi'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
process.env.NODE_NO_WARNINGS = "1"

process.on("uncaughtException", (err:Error) => setlog('exception',err))
process.on("unhandledRejection", (err:Error) => setlog('rejection',err))

Model.open().then(async ()=>{
	try {
		// const aes = new AES()
		// console.log("encrypted message : " + aes.encrypt("123456789"))
		// exit(0)

		const app = express()
		const server = http.createServer(app)
        clientApi(server);
		app.use(cors({
			origin: function(origin, callback){
				return callback(null, true)
			}
		}))

		if (config.debug) {
			app.use(express.json())
			app.use(express.urlencoded())
			const options = {
				uploadDir: os.tmpdir(),
				autoClean: true
			}
			app.use(formData.parse(options));
			app.use('/rpc', clientRouter)
		}
		let time = +new Date()
		await new Promise(resolve=>server.listen({ port: config.httpPort, host:'0.0.0.0' }, ()=>resolve(true)))
		setlog(`Started HTTP service on port ${config.httpPort}. ${+new Date()-time}ms`)
		return app
	} catch (error) {
		setlog("init", error)
		process.exit(1)
	}
})