// Project: niuniu-server
// by: loganworld 	<https://github.com/loganworld>

const { v4 } = require("uuid")
const { getUserData } = require("../auth");

class Room {
    constructor(creator, cost = "0.5", setting = "test", name = "GBRoom", maxPlayer = 6) {
        this.id = v4();
        this.creator = creator;
        this.cost = cost;
        this.setting = setting;
        this.name = name ? name : "GBRoom";
        this.maxPlayer = maxPlayer && maxPlayer <= 6 ? maxPlayer : 6;
        this.players = [];
    }

    enterRoom(user) {
        if (this.players.findIndex((player) => player.id == user.id) != -1) {
            throw new Error("already enterd");
        }
        this.players.push(user);
        console.log("enterRoom", user.id);
    }
    leaveRoom(user) {
        let index = this.players.findIndex((player) => player.id == user.id);
        if (index != -1) {
            this.players.splice(index, 1);
        }
    }
    getPlayers() {
        return this.players;
    }
}

const roomManager = (socket, io) => {
    // create, delete Room
    const createNewRoom = (data) => {
        const { cost, setting, name, maxPlayer } = data;
        var newRoom = new Room(socket, cost, setting, name, maxPlayer);
        global.rooms.push(newRoom);
        return newRoom;
    }

    const removeFromRooms = () => {
        //find room that user entered
        let roomId = global.users[socket.id].roomId;
        if (!roomId) return;
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        if (roomIndex == -1) return;
        let room = global.rooms[roomIndex];

        //remove from room
        room.leaveRoom(socket);

        //delete room that no one in it
        if (room.players.length == 0) {
            global.rooms.splice(roomIndex, 1);
        }
    }

    const enterRoom = (roomId) => {
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        let room = global.rooms[roomIndex];
        if (!room) throw new Error("Invalid Room");
        room.enterRoom(socket);
        global.users[socket.id].roomId = roomId;

        socket.emit("entered room", {
            id: room.id,
            creator: getUserData(room.creator.id),
            cost: room.cost,
            setting: room.setting,
            name: room.name,
            maxPlayer: room.maxPlayer,
            players: room.players.map((player) => getUserData(player.id))
        });
    }

    const validEnterRoom = () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId != null) throw new Error("you already entered to other room", global.users[socket.id].roomId);
    }

    // broad cast Rooms
    const broadcastRooms = () => {
        var roomInfos = global.rooms.map((room) => {
            return {
                id: room.id,
                creator: getUserData(room.creator.id),
                cost: room.cost,
                setting: room.setting,
                name: room.name,
                maxPlayer: room.maxPlayer,
                players: room.players.map((player) => getUserData(player.id))
            }
        })
        io.sockets.emit('rooms', { rooms: roomInfos });
    }

    // socket lisnters

    socket.on('create room', (data) => {
        try {
            validEnterRoom();
            const { cost, setting, name, maxPlayer } = data;
            var newRoom = createNewRoom({ cost, setting, name, maxPlayer });
            enterRoom(newRoom.id);
            broadcastRooms();
        } catch (err) {
            console.log("create room error", err.message);
        }
    })
    socket.on('enter room', (data) => {
        try {
            validEnterRoom();
            const { roomId } = data;
            enterRoom(roomId);
            broadcastRooms();
        } catch (err) {
            console.log("enter room", err.message);
        }
    })
    socket.on('out room', () => {
        try {
            removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("out room", err.message);
        }
    })
    socket.on('disconnect', () => {
        try {
            removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("disconnect", err.message);
        }
    });
    socket.on('get rooms', () => {
        try {
            broadcastRooms();
        } catch (err) {
            console.log("disconnect", err.message);
        }
    })

    //room
}

const gameManager = (socket, io) => {
    const getCRoom = () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId == null) throw new Error("you didn't entered any room");
        let room = global.rooms.find((room) => room.id == global.users[socket.id].roomId);
        return room;
    }

    socket.on("room status", () => {
        let room = getCRoom();
        //send current status to user
    })

    socket.on("bet", () => {
        let room = getCRoom();
        //bet actions
    })
}

module.exports = { roomManager, gameManager };