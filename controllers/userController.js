const UserSchema = require("../models/user");

const UserController = {
    createUser: async (props) => {
        const { username, phonenumber, password } = props;

        var user = await UserSchema.findOne({
            $or: [{ username: username }, { phonenumber: phonenumber }],
        });
        if (user) throw new Error("Account already exist. Please log In");

        const newUser = new UserSchema({
            username: username,
            phonenumber: phonenumber,
            password: password
        });

        let userData = await newUser.save();
        return userData;
    },
    findUser: async (props) => {
        const { param, flag } = props;
        var user;
        switch (flag) {
            case 1: //name check
                user = await UserSchema.findOne({
                    username: param,
                });
                break;
            case 2: //phone check
                user = await UserSchema.findOne({
                    phonenumber: param,
                });
            default:
                break;
        }
        return user;
    },

    updatebalance: async (props) => {
        const { username, amount } = props;
        var user = await UserSchema.findOne({
            username: username,
        });

        user.balance = Number(user.balance) + Number(amount);
        if (user.balance < 0) {
            let error = new Error("Insufficient balance");
            throw error;
        }
        const userData = await user.save();

        return userData;
    }
};

module.exports = { UserController };
