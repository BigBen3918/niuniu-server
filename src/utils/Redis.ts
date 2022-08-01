import setlog from '../setlog'

const Redis = require('ioredis');
const redis = new Redis({
    host: 'localhost',
    port: 6379
});

redis.on('error', (err:any) => {
	console.error("This demo requires Redis, a simple message broker. To install redis on Mac OS X, use `brew install redis`");
	console.error("After installing, run `redis-server` in another terminal and restart this demo.");
	console.error(err);
});
 
redis.on('connect', ()=>{
	setlog("connected to Redis server")
});
   
export const getSession = async (key:string):Promise<SessionType|null>=>{
	try {
		const buf = await redis.get(key)
		if (buf) return JSON.parse(buf) as SessionType
	} catch (error) {
		console.error("getSession", error)
	}
	return null
}

export const setSession = async (key:string, value:SessionType)=>{
	return await redis.set(key, JSON.stringify(value))
}

export const removeSession = async (key:string)=>{
	return await redis.del(key)
}

export const getAllSessionKeys = async ()=>{
	return await redis.keys("*")
}