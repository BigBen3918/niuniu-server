const { getHashPassword, getErrorCode } = require("../utils");
const { UserController } = require("../controllers/userController");

const { socketAuth } = require("./auth");
const { robby } = require("./robby");
const { roomManager, gameManager } = require("./rooms");
const listen = (io) => {
    global.users = {};
    global.lobby = [];
    global.rooms = [];

    io.on("connection", async (socket) => {
        console.log('socket connected: ' + socket.id);
        socketAuth(socket);
        robby(socket, io);
        roomManager(socket, io);
        gameManager(socket, io);
    })
}
module.exports = { listen }