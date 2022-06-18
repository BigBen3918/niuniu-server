// Project: niuniu-server
// by: loganworld 	<https://github.com/loganworld>

const { v4 } = require("uuid");
const { getUserData } = require("../auth");
const { delay } = require("../../utils");

class Room {
    constructor(
        creator,
        cost = "0.5",
        setting = "test",
        name = "GBRoom",
        maxPlayer = 6
    ) {
        this.id = v4();
        this.creator = creator;
        this.cost = cost;
        this.setting = setting;
        this.name = name ? name : "GBRoom";
        this.maxPlayer = maxPlayer && maxPlayer <= 6 ? maxPlayer : 6;
        this.players = [];      // all players in room
        this.readyPlayer = 0;       // ready players of room's players
        this.gamingPlayer = 0;      // gaming players
        this.gameStatus = 0; // 0 is initial, 1 is ready, 2 is gaming, 3 is end
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
    emitPlayers(event, data, flag) {
        if (flag === 0) {
            this.players.map((player, index) => {
                let arr = [];
                arr.push(data[index * 5 + 1]);
                arr.push(data[index * 5 + 2]);
                arr.push(data[index * 5 + 3]);
                arr.push(data[index * 5 + 4]);

                console.log(arr);
                player.emit(event, { cards: arr, players: this.readyPlayer });
            });
        }
    }
    checkPrepare() {
        if (this.players.length > 1) {
            this.gameStatus = 1;
        } else {
            this.gameStatus = 0;
        }
    }
}

const roomManager = (socket, io) => {
    // create, delete Room
    const createNewRoom = async (data) => {
        const { cost, setting, name, maxPlayer } = data;
        var newRoom = new Room(socket, cost, setting, name, maxPlayer);
        global.rooms.push(newRoom);
        return newRoom;
    };
    const enterRoom = async (roomId) => {
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        if (roomIndex == -1) return;
        let room = global.rooms[roomIndex];
        if (!room) throw new Error("Invalid Room");
        await room.enterRoom(socket);
        global.users[socket.id].roomId = roomId;

        await socket.emit("entered room", {
            id: room.id,
            creator: getUserData(room.creator.id),
            cost: room.cost,
            setting: room.setting,
            name: room.name,
            maxPlayer: room.maxPlayer,
            players: room.players.map((player) => getUserData(player.id)),
        });

        room.checkPrepare();
    };
    const removeFromRooms = async () => {
        // find room that user entered
        let roomId = global.users[socket.id].roomId;
        if (!roomId) return;
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        if (roomIndex == -1) return;
        let room = global.rooms[roomIndex];

        // remove from room
        global.users[socket.id].roomId = null;
        room.leaveRoom(socket);
        room.readyPlayer -= 1;

        // delete room that no one in it
        if (room.players.length == 0) {
            global.rooms.splice(roomIndex, 1);
        }

        socket.emit("outed room");
        room.checkPrepare();
    };
    const validEnterRoom = async () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId != null)
            throw new Error(
                "you already entered to other room",
                global.users[socket.id].roomId
            );
    };

    // broad cast Rooms
    const broadcastRooms = async () => {
        var roomInfos = global.rooms.map((room) => {
            return {
                id: room.id,
                creator: getUserData(room.creator.id),
                cost: room.cost,
                setting: room.setting,
                name: room.name,
                maxPlayer: room.maxPlayer,
                players: room.players.map((player) => getUserData(player.id)),
            };
        });
        io.sockets.emit("rooms", { rooms: roomInfos });
    };

    // socket lisnters
    socket.on("create room", async (data) => {
        try {
            validEnterRoom();
            const { cost, setting, name, maxPlayer } = data;
            var newRoom = await createNewRoom({
                cost,
                setting,
                name,
                maxPlayer,
            });
            await enterRoom(newRoom.id);
            broadcastRooms();
        } catch (err) {
            console.log("create room error ======> ", err.message);
        }
    });
    socket.on("enter room", async (data) => {
        try {
            validEnterRoom();
            const { id } = data;
            enterRoom(id);
            broadcastRooms();
        } catch (err) {
            console.log("enter room ======> ", err.message);
        }
    });
    socket.on("out room", async () => {
        try {
            removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("out room ======> ", err.message);
        }
    });
    socket.on("disconnect", async () => {
        try {
            await removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("disconnect ======> ", err.message);
        }
    });
    socket.on("get rooms", async () => {
        try {
            broadcastRooms();
        } catch (err) {
            console.log("get rooms ======> ", err.message);
        }
    });
};

const gameManager = (socket, io) => {
    // functions
    const randomCard = async (len) => {
        var arr = [];
        for (let i = 0; i < len * 5; ) {
            let rand = Math.floor(Math.random() * 39 + 1);
            if (arr.indexOf(rand) === -1 && rand % 10 !== 0) {
                arr.push(rand);
                i++;
            }
        }
        return arr;
    };
    const getCRoom = async () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId == null)
            throw new Error("you didn't entered any room");
        let room = global.rooms.find(
            (room) => room.id == global.users[socket.id].roomId
        );
        return room;
    };
    const init_cards = async (room) => {
        let cards = await randomCard(room.readyPlayer);
        room.emitPlayers("start game", cards, 0);
    };

    // listeners
    socket.on("get ready", async () => {
        try {
            let room = await getCRoom();

            room.readyPlayer += 1;
            if (
                room.readyPlayer === room.players.length &&
                room.players.length > 1
            ) {
                init_cards(room);
            }
        } catch (err) {
            console.log("get ready ======> ", err.message);
        }
    });
    socket.on("room status", async () => {
        try {
            let room = await getCRoom();
            //send current status to user
        } catch (err) {
            console.log("room status ======> ", err.message);
        }
    });
    socket.on("ready on", async () => {
        try {
            let room = await getCRoom();

            room.gamingPlayer++;
            if (room.gamingPlayer === room.readyPlayer) {
                room.gameStatus = 2;
            }
        } catch (err) {
            console.log("ready on ======> ", err.message);
        }
    });
    socket.on("bet", (data) => {
        try {
            console.log(data);
            // let room = getCRoom();
        } catch (err) {
            console.log("bet ======> ", err.message);
        }
    });
};

module.exports = { roomManager, gameManager };
