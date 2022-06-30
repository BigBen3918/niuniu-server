const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const PoolSchema = new Schema({
    balance: {
        type: Number,
        required: false,
    },
});

module.exports = Pool = mongoose.model("pools", PoolSchema);
