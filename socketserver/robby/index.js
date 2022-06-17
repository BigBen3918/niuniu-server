
const { getUserData } = require("../auth");

const robby = (socket, io) => {
    // add,remove member in robby
    const addToRobby = (socketId) => {
        let index = global.lobby.indexOf(socketId);
        if (index == -1) {
            global.lobby.push(socketId);
        }
    }
    const removeFromRobby = (socketId) => {
        let index = global.lobby.indexOf(socketId);
        if (index != -1) {
            global.lobby.splice(index, 1);
        }
    }

    // broad cast robby
    const broadcastRobby = () => {
        let users = global.lobby.map((socketId) => {
            return getUserData(socketId)
        })
        io.sockets.emit('lobby', { users });
    }
    // socket lisnters

    socket.on('enter lobby', () => {
        addToRobby(socket.id);
        broadcastRobby();
    })
    socket.on('out lobby', () => {
        removeFromRobby(socket.id);
        broadcastRobby();
    })
    socket.on('disconnect', () => {
        removeFromRobby(socket.id);
        broadcastRobby();
    });

    socket.on('get lobby', () => {
        broadcastRobby();
    })

}

module.exports = { robby };