// by: Leo Pawel 	<https://github.com/galaxy126>
import {Long, Decimal128} from 'mongodb'

export const btrim = (n:string) => {
	try {
		if (n=="0x") return "0"
		const b = BigInt(n).toString(16)
		return b=="0" ? b : '0x' + b
	} catch (error) {}
	return '0'
}

export const badd = (a: number|string|Long|Decimal128, b: number|string|Long|Decimal128) => {
	let n1 = a instanceof Long ? a.toBigInt() : BigInt(String(a))
	let n2 = b instanceof Long ? b.toBigInt() : BigInt(String(b))
	const r = n1 + n2
	return r==0n ? '0' : '0x' + r.toString(16)
}

export const bsub = (a: number|string|Long|Decimal128, b: number|string|Long|Decimal128) => {
	let n1 = a instanceof Long ? a.toBigInt() : BigInt(String(a))
	let n2 = b instanceof Long ? b.toBigInt() : BigInt(String(b))
	const r = n1 - n2
	return r==0n ? '0' : '0x' + r.toString(16)
}

export const bmul = (a: number|string|Long|Decimal128, b: number|string|Long|Decimal128) => {
	let n1 = a instanceof Long ? a.toBigInt() : BigInt(String(a))
	let n2 = b instanceof Long ? b.toBigInt() : BigInt(String(b))
	const r = n1 * n2
	return r==0n ? '0' : '0x' + r.toString(16)
}

export const bdiv = (a: number|string|Long|Decimal128, b: number|string|Long|Decimal128) => {
	let n1 = a instanceof Long ? a.toBigInt() : BigInt(String(a))
	let n2 = b instanceof Long ? b.toBigInt() : BigInt(String(b))
	const r = n1 / n2
	return r==0n ? '0' : '0x' + r.toString(16)
}
