const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const UserBasicSchema = new Schema({
    date: {
        type: Date,
        default: Date.now,
    },
    balance: {
        type: Number,
        default: 1000,
    },
    score: {
        type: Number,
        default: 0
    }
});

const UserURISchema = new Schema({
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    phonenumber: {
        type: String,
        required: true,
    },
    email: {
        type: String,
    },
    image: {
        type: String
    }
});

const UserSchema = new Schema();
UserSchema.add(UserBasicSchema).add(UserURISchema);

module.exports = User = mongoose.model("users", UserSchema);
