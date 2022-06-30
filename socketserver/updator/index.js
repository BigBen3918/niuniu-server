const UserSchema = require("../../models/user");
const PoolSchema = require("../../models/pool");
const rewardRate = [
    40, 20, 10, 8, 6, 5, 4, 3, 2, 1
]
const updateReward = () => {
    (async () => {
        let pool = await PoolSchema.findOne();
        pool.latestUpdate = new Date.now();
        pool.save();
    })();
    setInterval(async () => {
        let pool = await PoolSchema.findOne();
        let users = await UserSchema.find({}, null, { sort: { "score": -1 } });
        let remainBalance = pool.balance;
        users.map((user, index) => {
            if (index < 10) {
                user.balance += pool.balance * rewardRate[i] / 100;
                remainBalance -= pool.balance * rewardRate[i] / 100
            }
            user.score = 0;
        });
        await users.save();
        pool.latestUpdate = new Date.now();
        pool.balance = remainBalance;
        await pool.save();
    }, [12 * 3600 * 1000]);
}

module.exports = { updateReward }