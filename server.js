const express = require("express");
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require("mongoose");

// Connect to MongoDB
const mongourl = require("./config").mongoURI;
mongoose
    .connect(mongourl, {
        useUnifiedTopology: true,
        useNewUrlParser: true,
    })
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.log(err));

{/*
    // express server
    const bodyParser = require("body-parser");
    const router = express.Router();
    require("dotenv").config();
    const cors = require("cors");
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(
        cors({
            origin: "*",
            methods: ["POST", "GET"],
        })
    );

    {
        //rest api
        const routes = require("./api");
        routes(router);
        app.use("/api", router);
    }
*/}

{
    const io = new Server(server, {
        pingInterval: 30005,		//An interval how often a ping is sent
        pingTimeout: 5000,		//The time a client has to respont to a ping before it is desired dead
        upgradeTimeout: 3000,		//The time a client has to fullfill the upgrade
        allowUpgrades: true,		//Allows upgrading Long-Polling to websockets. This is strongly recommended for connecting for WebGL builds or other browserbased stuff and true is the default.
        cookie: false,			//We do not need a persistence cookie for the demo - If you are using a load balöance, you might need it.
        serveClient: true,		//This is not required for communication with our asset but we enable it for a web based testing tool. You can leave it enabled for example to connect your webbased service to the same server (this hosts a js file).
        allowEIO3: false,			//This is only for testing purpose. We do make sure, that we do not accidentially work with compat mode.
        cors: {
            origin: "*"				//Allow connection from any referrer (most likely this is what you will want for game clients - for WebGL the domain of your sebsite MIGHT also work)
        }
    });
    //socketIO server
    const { listen } = require("./socketserver");
    listen(io);
}
// app.use(express.static(__dirname + "/build"));
// app.get("/*", function (req, res) {
//     res.sendFile(__dirname + "/build/index.html", function (err) {
//         if (err) {
//             res.status(500).send(err);
//         }
//     });
// });

const port = process.env.SERVER_PORT || 5000;
server.listen(port, () => console.log(`Running on port ${port}`));
