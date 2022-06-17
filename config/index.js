require("dotenv").config();

module.exports = {
    mongoURI: "mongodb://localhost:27017/db_gobang",
    secretOrKey: process.env.TOKEN_SECRET,
};
