import crypto from 'crypto' 

//secp256k1

const MESSAGE = "Hello";

const server_key = crypto.createECDH("secp256k1");
server_key.generateKeys();

const serverPublicKeyBase64 = server_key.getPublicKey().toString("base64");

const serverSharedPublicKey = server_key.computeSecret(serverPublicKeyBase64, "base64", "hex");

console.log("server_key: " + serverSharedPublicKey);

const IV = crypto.randomBytes(16);

const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(serverSharedPublicKey, "hex"), IV);

let encrypted_data = cipher.update(MESSAGE, "utf-8", "hex");
encrypted_data += cipher.final("hex");

const auth_tag = cipher.getAuthTag().toString("hex");

console.table({
    IV: IV.toString("hex"),
    encrypted_data: encrypted_data,
    auth_tag: auth_tag
})