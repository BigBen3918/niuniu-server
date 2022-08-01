import crypto from 'crypto'

const encryptionType = 'aes-256-cbc';
const encryptionEncoding = 'base64';
const bufferEncryption = 'utf-8';

class AES {
    AesKey;
    AesIV;

    constructor() {
        this.AesKey = 'Full Stack IT Service 198703Game';
        this.AesIV = 'MatGoGameProject';
    }

    encrypt(val: string) {
        const key = Buffer.from(this.AesKey, bufferEncryption);
        const iv = Buffer.from(this.AesIV, bufferEncryption);
        const cipher = crypto.createCipheriv(encryptionType, key, iv);
        var encrypted = cipher.update(val, bufferEncryption, encryptionEncoding);
        encrypted += cipher.final(encryptionEncoding);
        return encrypted;
    }

    decrypt(base64String: string) {
        const buff = Buffer.from(base64String, encryptionEncoding);
        const key = Buffer.from(this.AesKey, bufferEncryption);
        const iv = Buffer.from(this.AesIV, bufferEncryption);
        const decipher = crypto.createDecipheriv(encryptionType, key, iv);
        var deciphered = new TextDecoder().decode(Buffer.concat([decipher.update(buff), decipher.final()]));
        return deciphered;
    }
}

export default AES 