const UserSchema = require("../models/user");
const PoolSchema = require("../models/pool");

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

        var userId =
            Math.floor((new Date() * 9) / 10 ** 4) +
            Math.floor(Math.random() * 9 + 1);

        const newUser = new UserSchema({
            id: userId,
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
        try {
            const { username, amount } = props;
            var user = await UserSchema.findOne({
                username: username,
            });

            user.balance = Number(user.balance) + Number(amount);
            user.score = Number(user.score) + Number(user.score);
            if (Number(user.balance) < 0) {
                user.balance = 0;
            }
            const userData = await user.save();

            return userData;
        } catch (err) {
            console.log(err);
        }
    },
    updatePool: async (props) => {
        const { amount } = props;
        var pool = await PoolSchema.find();

        pool.balance = Number(pool.balance) + Number(amount);
        const poolData = await pool.save();

        return poolData;
    },
};

module.exports = { UserController };
