const { UserController } = require("../../controllers/userController");
const { getHashPassword, getErrorCode } = require("../../utils");

const socketAuth = (socket) => {
    socket.on("disconnect", () => {
        if (!global.users[socket.id]) delete global.users[socket.id];
        console.log("socket disconnected ======> " + socket.id);
    });
    socket.on("login", async (req) => {
        try {
            const { username, password } = req;
            console.log("login", username, password, req);
            const userData = await UserController.findUser({
                param: username,
                flag: 1,
            });
            if (!userData) {
                throw new Error(30001);
            }
            const hashedPassword = await getHashPassword({
                param1: username,
                param2: password,
            });
            if (userData.password !== hashedPassword) throw new Error(30002);
            global.users[socket.id] = userData;

            socket.emit("loginSuccess", {
                username: userData.username,
                phonenumber: userData.phonenumber,
            });
        } catch (err) {
            console.log("loginError ======> ", err.message);
            socket.emit("loginError ======> ", getErrorCode(err.message));
        }
    });
    socket.on("signup", async (req) => {
        try {
            const { username, phonenumber, password } = req;

            let userData = await UserController.findUser({
                param: username,
                flag: 2,
            });
            if (userData) throw new Error(30005);

            userData = await UserController.findUser({
                param: phonenumber,
                flag: 1,
            });
            if (userData) throw new Error(30004);

            const hashedPassword = await getHashPassword({
                param1: username,
                param2: password,
            });

            const registryResult = await UserController.createUser({
                username: username,
                password: hashedPassword,
                phonenumber: phonenumber,
            });

            if (registryResult) socket.emit("signupSuccess");
            else throw new Error("reqbase");
        } catch (err) {
            console.log(err.message);
            socket.emit("signUpError ======> ", getErrorCode(err.message));
        }
    });
};
const userMiddleware = async (socketId) => {
    if (!global.users[socketId]) {
        return null;
    }
    const Result = await UserController.findUser({
        param: global.users[socketId].username,
        flag: 1,
    });
    global.users[socketId] = Result;
};

const updateBalance = async (socketid) => {
    if (!global.users[socketid]) {
        return null;
    }
    const Result = await UserController.findUser({
        param: global.users[socketid].username,
        flag: 1,
    });
    global.users[socketid].balance = Result.balance;
};

const getUserData = (socketId) => {
    if (!global.users[socketId]) {
        return null;
    }
    let user = global.users[socketId];
    return {
        username: user.username,
        balance: user.balance,
        id: user._id,
        image: user.image,
        phonenumber: user.phonenumber,
    };
};
module.exports = { socketAuth, userMiddleware, getUserData, updateBalance };
