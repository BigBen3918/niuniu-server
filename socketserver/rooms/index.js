// Project: niuniu-server
// by: loganworld 	<https://github.com/loganworld>

const { v4 } = require("uuid");
const { getUserData } = require("../auth");
const { delay } = require("../../utils");
const { NiuNiu } = require("../niuniu");
const { UserController } = require("../../controllers/userController");

// test
// {
//     //ten small
//     var tempCards = [0, 1, 3, 13, 23];
//     var score = NiuNiu.getScore(tempCards);
//     console.log(score);
//     //FullHouse
//     tempCards = [14, 11, 1, 4, 24];
//     score = NiuNiu.getScore(tempCards);
//     console.log(score);
//     //GoldBull
//     tempCards = [14, 11, 5, 4, 24];
//     score = NiuNiu.getScore(tempCards);
//     console.log(score);
//     //Straight
//     tempCards = [4, 1, 2, 15, 23];
//     score = NiuNiu.getScore(tempCards);
//     console.log(score);
//     //Cattle3
//     tempCards = [4, 1, 2, 13, 23];
//     score = NiuNiu.getScore(tempCards);
//     console.log(score);

//     //generateRandomCard
//     let randomCards = NiuNiu.getRandomCards(5);
//     console.log("randomCards", randomCards);
// }

class Room {
    constructor(
        creator,
        cost,
        setting = "test",
        name = "GBRoom",
        maxPlayer = 6
    ) {
        // setting
        this.id = v4();
        this.creator = creator;
        this.cost = cost;
        this.setting = setting;
        this.name = name ? name : "GBRoom";
        this.maxPlayer = maxPlayer && maxPlayer <= 6 ? maxPlayer : 6;

        this.players = []; // all players in room
        this.gameStatus = 0; // 0 is initial, 1 is ready, 2-4 is gaming, 5 is end
        this.roleCount = 0;
        // this.gameInterval = setInterval(this.mainloop, [5]);
    }

    // join and leave actions
    enterRoom(userSocket) {
        if (this.players.length > this.maxPlayer) {
            throw new Error("game is fullfilled");
        }
        if (
            this.players.findIndex(
                (player) => player.socket.id == userSocket.id
            ) != -1
        ) {
            throw new Error("already entered");
        }
        let playerInitData = {
            socket: userSocket,
            isReady: false,
            cards: [],
            role: "ready",
            balance: 0,
            roundScore: {
                type: "",
                score: 0,
                multiple: 0,
                cards: [],
                activityCards: [],
            },
            id: this.players.length,
            grab: -1,
            doubles: -1,
        };
        this.players.push(playerInitData);
        console.log("enterRoom", userSocket.id);
    }
    isReady(userSocket) {
        let userIndex = this.players.findIndex(
            (player) => player.socket.id == userSocket.id
        );
        if (userIndex == -1) {
            throw new Error("invalid request");
        }
        this.players[userIndex].isReady = true;
        //if game is not started
        if (this.gameStatus == 0) {
            this.startRound();
        }
    }
    leaveRoom(userSocket) {
        let playerIndex = this.getPlayerIndex(userSocket);
        this.players.splice(playerIndex, 1);
        this.roleCount++;
    }

    // game role
    grabBank(userSocket, multiple) {
        if (this.gameStatus != 1) throw new Error("invalid role");
        let playerIndex = this.getPlayerIndex(userSocket);
        let player = this.players[playerIndex];
        if (player.grab !== -1) {
            return;
        }
        player.grab = multiple;
        this.broadcastToPlayers("grabBank", {
            player: getUserData(player.socket.id),
            multiple: multiple,
        });
        this.nextRoll();
    }
    doubles(userSocket, multiple) {
        if (this.gameStatus != 2) throw new Error("invalid role");
        let playerIndex = this.getPlayerIndex(userSocket);
        let player = this.players[playerIndex];
        player.doubles = multiple;
        this.broadcastToPlayers("doubles", {
            player: getUserData(player.socket.id),
            multiple: multiple,
        });
        this.nextRoll();
    }
    nextRoll() {
        if (this.gameStatus == 1) {
            this.roleCount++;
            console.log("nextRoll : endGrab", this.roleCount);
            if (this.roleCount >= this.getReadyPlayers().length) {
                // end grab
                this.endGrab();
            }
        } else if (this.gameStatus === 2) {
            this.roleCount++;

            // if role is ended, round end
            if (this.roleCount >= this.getReadyPlayers().length) {
                //end doubles
                this.endRound();
            }
        }
    }

    // main loop
    startRound() {
        if (this.gameStatus != 0) return;
        let readyPlayers = this.getReadyPlayers();
        if (readyPlayers.length >= 2) {
            // start Round;
            let randomCards = NiuNiu.getRandomCards(readyPlayers.length);
            this.players.forEach((player, index) => {
                player.onRound = true;
                player.cards = [...randomCards[index]];
                player.grab = -1;
                player.doubles = -1;
            });
            this.roleCount = 0;
            this.gameStatus = 1;
            this.broadcastToPlayers("round start");
        }
    }
    endGrab() {
        if (this.roleCount != this.players.length || this.gameStatus != 1)
            throw new Error("invalid endGrab");

        let bump = this.players.map((player) => player.grab);
        let highestGrab = Math.max(...bump);
        let candidators = this.players.filter(
            (player) => player.grab == highestGrab
        );
        let banker =
            candidators[Math.floor(Math.random() * candidators.length)];
        this.players.map((player) => {
            if (player.socket.id == banker.socket.id) player.role = "banker";
            else player.role = "idler";
        });
        this.gameStatus = 2;
        this.roleCount = 1;
        this.broadcastToPlayers("endGrab");
    }
    endRound() {
        if (this.roleCount != this.players.length || this.gameStatus != 2)
            throw new Error("invalid endRound");
        this.gameStatus = 5;
        let banker = this.getBanker();
        let idlers = this.getIdlers();

        let bankerScore = NiuNiu.getScore(banker.cards);
        banker.roundScore = bankerScore;
        idlers.map((idler) => {
            let idlerScore = NiuNiu.getScore(idler.cards);
            idler.roundScore = idlerScore;
            if (idlerScore.score > bankerScore.score) {
                // idler win
                var realMoney =
                    this.cost *
                    idlerScore.multiple *
                    banker.grab *
                    idler.doubles;
                UserController.updatebalance({
                    username: global.users[idler.socket.id].username,
                    amount: realMoney,
                });
                UserController.updatebalance({
                    username: global.users[banker.socket.id].username,
                    amount: -realMoney,
                });
            } else {
                // bankerWin
                var realMoney =
                    this.cost *
                    bankerScore.multiple *
                    banker.grab *
                    idler.doubles;
                UserController.updatebalance({
                    username: global.users[banker.socket.id].username,
                    amount: realMoney,
                });
                UserController.updatebalance({
                    username: global.users[idler.socket.id].username,
                    amount: -realMoney,
                });
            }
        });
        this.broadcastToPlayers("endRound");
        setTimeout(() => {
            this.roleCount = 0;
            this.gameStatus = 0;
            this.players.map((player) => {
                player.grab = -1;
                player.doubles = -1;
            });
            this.startRound();
        }, 10000);
    }

    //emit
    broadcastToPlayers(event, data = {}) {
        this.players.map((player) => {
            player.socket.emit(event, data);
        });
    }

    // get status
    getPlayerIndex(userSocket) {
        return this.players.findIndex(
            (player) => player.socket.id == userSocket.id
        );
    }
    getPlayer(userSocket) {
        return this.players.find((player) => player.socket.id == userSocket.id);
    }
    getPlayers() {
        return this.players;
    }
    getReadyPlayers() {
        return this.players.filter((player) => player.isReady);
    }
    getOnPlayers() {
        return this.players.filter((player) => player.onRound);
    }
    getBanker() {
        return this.players.find((player) => player.role == "banker");
    }
    getIdlers() {
        return this.players.filter((player) => player.role == "idler");
    }
    getRoomStatus(userSocket) {
        return {
            id: this.id,
            creator: getUserData(this.creator.id),
            cost: this.cost,
            setting: this.setting,
            name: this.name,
            maxPlayer: this.maxPlayer,
            players: this.players.map((player) =>
                getUserData(player.socket.id)
            ),
            gameStatus: this.gameStatus,
            roleCount: this.roleCount,
            playerStatus: this.players.map((player) => {
                if (this.gameStatus == 5) {
                    return {
                        ...getUserData(player.socket.id),
                        role: player.role,
                        grab: player.grab,
                        doubles: player.doubles,
                        cards: player.cards,
                        roundScore: player.roundScore,
                    };
                } else {
                    // only can see his 4 card
                    let cards = [];
                    if (player.socket.id == userSocket.id)
                        cards = player.cards.slice(0, 4);
                    return {
                        ...getUserData(player.socket.id),
                        role: player.role,
                        grab: player.grab,
                        doubles: player.doubles,
                        cards: cards,
                        roundScore: player.roundScore,
                    };
                }
            }),
        };
    }

    // destructor
    destroy() {
        if (this.gameInterval) clearInterval(this.gameInterval);
    }
}

const roomManager = (socket, io) => {
    // create, delete Room
    const createNewRoom = (data) => {
        const { cost, setting, name, maxPlayer } = data;
        var newRoom = new Room(socket, cost, setting, name, maxPlayer);
        global.rooms.push(newRoom);
        return newRoom;
    };
    const enterRoom = (roomId) => {
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        if (roomIndex == -1) return;
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
            players: room.players.map((player) =>
                getUserData(player.socket.id)
            ),
            playerStatus: room.players.map((player) =>
                getUserData(player.socket.id)
            ),
        });
        broadcastRooms();
    };
    const removeFromRooms = () => {
        // find room that user entered
        let roomId = global.users[socket.id].roomId;
        if (!roomId) return;
        let roomIndex = global.rooms.findIndex((room) => room.id == roomId);
        if (roomIndex == -1) return;
        let room = global.rooms[roomIndex];

        // remove from room
        global.users[socket.id].roomId = null;
        room.leaveRoom(socket);

        // delete room that no one in it
        if (room.players.length == 0) {
            room.destroy();
            global.rooms.splice(roomIndex, 1);
        }
        socket.emit("outed room");
    };
    const validEnterRoom = () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId != null)
            throw new Error(
                "you already entered to other room",
                global.users[socket.id].roomId
            );
    };

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
                players: room.players.map((player) =>
                    getUserData(player.socket.id)
                ),
                playerStatus: room.players.map((player) =>
                    getUserData(player.socket.id)
                ),
            };
        });
        io.sockets.emit("rooms", { rooms: roomInfos });
    };

    // socket lisnters
    socket.on("create room", (data) => {
        try {
            validEnterRoom();
            const { cost, setting, name, maxPlayer } = data;
            var newRoom = createNewRoom({
                cost,
                setting,
                name,
                maxPlayer,
            });
            enterRoom(newRoom.id);
            broadcastRooms();
        } catch (err) {
            console.log("create room error ======> ", err.message);
        }
    });
    socket.on("enter room", (data) => {
        try {
            validEnterRoom();
            const { id } = data;
            enterRoom(id);
            broadcastRooms();
        } catch (err) {
            console.log("enter room ======> ", err.message);
        }
    });
    socket.on("out room", () => {
        try {
            removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("out room ======> ", err.message);
        }
    });
    socket.on("disconnect", () => {
        try {
            removeFromRooms();
            broadcastRooms();
        } catch (err) {
            console.log("disconnect ======> ", err.message);
        }
    });
    socket.on("get rooms", () => {
        try {
            broadcastRooms();
        } catch (err) {
            console.log("get rooms ======> ", err.message);
        }
    });
};

const gameManager = (socket, io) => {
    const getCRoom = () => {
        if (!global.users[socket.id]) throw new Error("auth error");
        if (global.users[socket.id].roomId == null)
            throw new Error("you didn't entered any room");
        let room = global.rooms.find(
            (room) => room.id == global.users[socket.id].roomId
        );
        return room;
    };

    // listeners
    socket.on("is ready", () => {
        try {
            let room = getCRoom();
            room.isReady(socket);
        } catch (err) {
            console.log("get ready ======> ", err.message);
        }
    });
    socket.on("room status", () => {
        try {
            // send current status to user
            let room = getCRoom();
            let status = room.getRoomStatus(socket);
            socket.emit("room status", status);
        } catch (err) {
            console.log("room status ======> ", err.message);
        }
    });
    socket.on("grab bank", (data) => {
        try {
            const { multiple } = data;
            if ([0, 1, 2, 3, 4].indexOf(multiple) == -1) {
                throw new Error("invalid grab");
            }
            let room = getCRoom();
            room.grabBank(socket, multiple);
        } catch (err) {
            console.log("grab bank ======> ", err);
        }
    });
    socket.on("doubles", (data) => {
        try {
            const { multiple } = data;
            if ([1, 2, 3, 4].indexOf(multiple) == -1) {
                throw error("invalid grab");
            }
            let room = getCRoom();
            room.doubles(socket, multiple);
        } catch (err) {
            console.log("ready on ======> ", err.message);
        }
    });
};

module.exports = { roomManager, gameManager };
