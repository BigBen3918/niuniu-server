const { socketAuth } = require("./auth");
const { robby } = require("./robby");
const { roomManager, gameManager } = require("./rooms");
const { updateReward } = require("./updator")
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
    updateReward();
}
module.exports = { listen }