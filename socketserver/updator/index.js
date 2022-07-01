const UserSchema = require("../../models/user");
const PoolSchema = require("../../models/pool");
const rewardRate = [40, 20, 10, 8, 6, 5, 4, 3, 2, 1];
const updateReward = () => {
    (async () => {
        var pool = await PoolSchema.findOne();
        if (!pool) {
            pool = new PoolSchema({
                balance: 0,
                lastestUpdate: 0,
            });
        }
        pool.latestUpdate = new Date().getTime();
        pool.save();
        poolcache();
    })();
    setInterval(() => {
        poolcache();
    }, [12 * 3600 * 1000]);

    const poolcache = async () => {
        let pool = await PoolSchema.findOne();
        let users = await UserSchema.find({}, null, { sort: { score: -1 } });
        let remainBalance = pool.balance;
        users.map((user, index) => {
            if (index < 10) {
                user.balance += (pool.balance * rewardRate[index]) / 100;
                remainBalance -= (pool.balance * rewardRate[index]) / 100;
            }
            user.score = 0;
            user.save();
        });
        // await users.save();
        pool.latestUpdate = new Date().getTime();
        global.latestTime = Math.floor(new Date().getTime() / 1000);
        pool.balance = remainBalance;
        global.poolbalance = remainBalance;
        await pool.save();
    };
};

module.exports = { updateReward };
