import * as crypto from 'crypto'

const getBuffer = (src:Uint8Array) => Buffer.from(src.buffer, src.byteOffset, src.byteLength);
const Buf2B64 = (buf:Uint8Array) => Buffer.from(buf).toString('base64');
const B642Buf = (b64:string) => Buffer.from(b64,'base64');
const Bin2Pem = (buf:Uint8Array, label:string) => ("-----BEGIN RSA " + label + " KEY-----\r\n"+Buf2B64(buf).match(/(.{1,64})/g).join('\r\n')+"\r\n-----END RSA " + label + " KEY-----\r\n");
const Pem2Bin = (pem:string) => (B642Buf(pem.replace(/-{5}[^-]+-{5}|\r\n?|\n/g,'')));
const uint8ArrayToUint32 = (buf:Uint8Array) => (buf[1] << 16) | (buf[2] << 8) | buf[3]

interface WebCrypto {
	iv: 		Buffer
	secretkey: 	crypto.KeyObject
	privkey:	crypto.KeyObject
	pubkey:		crypto.KeyObject
}

class WebCrypto {
	static hash (message:string) {
		const buf = getBuffer(new TextEncoder().encode(message));
		return crypto.createHash('sha256').update(buf).digest().toString('hex');
	}
	static aesCreate(secret: string) {
		const self = new this();
		self.iv = getBuffer(new TextEncoder().encode(secret.slice(0,16)));
		self.secretkey = crypto.createSecretKey(crypto.randomBytes(256 >> 3));
		return self;
	}
	static aesCreateWithKey(key:string, secret:string) {
		const self = new this();
		self.iv = getBuffer(new TextEncoder().encode(secret.slice(0,16)));
		let buf = key.split('').map((c) => {switch (c) { case '-': return '+'; case '_': return '/'; default: return c;}}).join('');
		self.secretkey = crypto.createSecretKey(Buffer.from(buf, 'base64'));
		return self;
	}

	aesExport () {
		return this.secretkey.export().toString('base64').split('').map((c) => {switch (c) { case '+': return '-'; case '/': return '_'; case '=': return ''; default: return c;}}).join('');
	}

	encode (p:string) {
		const cipher = crypto.createCipheriv('aes-256-cbc', this.secretkey, this.iv);
		return Buffer.concat([cipher.update(new TextEncoder().encode(p)), cipher.final()]).toString('base64');
	}

	decode (e:string) {
		try {
			const decipher = crypto.createDecipheriv('aes-256-cbc', this.secretkey, this.iv);
			return new TextDecoder().decode(Buffer.concat([decipher.update(Buffer.from(e,'base64')), decipher.final()]));
		} catch (err) {
			return null;
		}
	}
	static rsaCreate() {
		// ,publicExponent:uint8ArrayToUint32(new Uint8Array([1, 0, 1]))
		const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {modulusLength:2048});
		const self = new this();
		self.privkey = privateKey;
		self.pubkey = publicKey;
		return self;
	}
	static rsaCreateWithPubKey(pem:string) {
		const self = new this();
		self.pubkey = crypto.createPublicKey({key: getBuffer(Pem2Bin(pem)),format: 'der',type: 'spki'});
		return self;
	}
	static rsaCreateWithPrivKey(pem:string) {
		const self = new this();
		self.privkey = crypto.createPrivateKey({key: getBuffer(Pem2Bin(pem)),format: 'der',type: 'pkcs8'});
		return self;
	}
	rsaExportPubkey () {
		return Bin2Pem(this.pubkey.export({format: 'der',type: 'spki'}), "PUBLIC")
	}
	rsaExportPrivkey () {
		return Bin2Pem(this.privkey.export({format: 'der',type: 'pkcs8'}),"PRIVATE")
	}
	sign (plain:string) {
		return Buf2B64(crypto.sign('sha256', getBuffer(new TextEncoder().encode(plain)), this.privkey));
	}
	verify(sig:string,plain:string) {
		try {
			return crypto.verify('sha256', getBuffer(new TextEncoder().encode(plain)), this.pubkey, B642Buf(sig));
		} catch (err) {
			return null;
		}
	}
}

export default WebCrypto;