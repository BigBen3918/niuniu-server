const sha256 = require("sha256");

const getHashPassword = async (req) => {
    const { param1, param2 } = req;

    return sha256.x2(param1 + param2);
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const errorCode = {
    30000: "server error",
    30001: "wrong username",
    30002: "wrong password",
    30003: "invalid name",
    30004: "invalid email",
    40001: "insufficient balance",
    40002: "invalid request"
}

const getErrorCode = (code) => errorCode[code] ? code : 30000;

module.exports = {
    getHashPassword,
    delay,
    getErrorCode
};
