const UserSchema = require("../models/user");
const images = [
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar3_mqaulu.png",
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar0_iuglex.png",
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar1_h3uepr.png",
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar2_uxhtq2.png",
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar4_md51jg.png",
    "https://res.cloudinary.com/galaxy-digital/image/upload/v1655949708/Avatar5_dneanm.png",
];

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
            password: password,
            image: images[Math.floor(Math.random() * 6)],
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
        if (Number(user.balance) < 0) {
            user.balance = 0;
        }
        const userData = await user.save();

        return userData;
    },
};

module.exports = { UserController };
