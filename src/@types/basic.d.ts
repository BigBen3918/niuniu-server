// by: Leo Pawel 	<https://github.com/galaxy126>

declare interface SessionType {
	lang?:			string
	uid?:			number
	verify?:		{
		email:		string
		code:		string
	}
	created: 		number
}

declare interface RpcRequestType {
	jsonrpc: 		"2.0"
	method: 		string
	params: 		string[]
	id: 			number
}

declare interface RpcResponseType {
	jsonrpc: 		"2.0"
	id: 			number
	result?: 		string[]
	error?: 		number
}

declare interface ServerResponse {
	result?: any
	error?: number
}