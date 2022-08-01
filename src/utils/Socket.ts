import * as websocket from 'websocket'
import { setlog } from './helper';


const WebSocketServer = websocket.server;
const maxFrameSize = 2 * 1024 * 1024;
/* const timeout = 5000; */
// const config = {
// 	path: '/',
// 	origin: [
// 		"http://local-ibitgo.com:3000",
// 		"http://admin.local-ibitgo.com:3000",
// 		"http://admin.local-ibitgo.com:3001",
// 		/* 'file://' */
// 	],
// 	allowIps: [] as string[],
// }
interface SocketAction {
	onRequest(ip:string, origin:string, wss:string, cookie:string): boolean, 
	onConnect(con:websocket.connection, ip:string, wss:string, cookie:string): void, 
	onDisconnect(con:websocket.connection, cookie:string): void, 
	onData(con:websocket.connection, msg:string, ip:string, wss:string, cookie:string): void
}


const initSocket = (
	httpServer: any, 
	actions: SocketAction
) => {
	const wsServer = new WebSocketServer({ httpServer, maxReceivedFrameSize:maxFrameSize, maxReceivedMessageSize:maxFrameSize, autoAcceptConnections: false });
	wsServer.on('request', (req) => {
		try {
			let ip = req.remoteAddress
			let p = ip.lastIndexOf(':')
			if (p!==-1) ip= ip.slice(p+1)
			/* const cookies = req.cookies */
			const origin = req.origin
			/* const key = req.key */
			const [orgWss, cookie] = req.resource.slice(1).split(':')
			let wss = orgWss
			p = wss.indexOf('/')
			if (p!==-1) wss = wss.slice(p + 1)
			const connectable = actions.onRequest(ip, origin, wss, cookie)
			if (connectable) {
				const con = req.accept(null, origin)
				con.on('message', (buf) => {
					if (buf.type==='utf8') {
						actions.onData(con, buf.utf8Data, ip, wss, cookie)
					} else {
						console.log('websocket: unknown type')
					}
				})
				con.on('close', () => actions.onDisconnect(con, cookie))
				con.on('error', () => actions.onDisconnect(con, cookie))
				actions.onConnect(con, ip, wss, cookie)
			} else {
				req.reject(404, "unknown location or secret key")
			}
		} catch (error) {
			setlog('Socket-request', error)
		}
	})
}

export default initSocket