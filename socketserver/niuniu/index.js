

const NiuNiu = {
    scores: {
        //niuniu
        "NoBull": 0,   //the sum of the points of any three cards is not an integer multiple of 10
        "Cattle1": 1,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle2": 2,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle   
        "Cattle3": 3,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle4": 4,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle5": 5,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle6": 6,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle7": 7,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle8": 8,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "Cattle9": 9,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards mod (10) is equal to a few, that is, the number of cattle
        "NiuNiu": 10,  //The sum of the points of 3 of the 5 cards is an integer multiple of 10, and the sum of the points of the other 2 cards is an integer multiple of 10.
        "GoldBull": 11,
        "GoldBullion": 12,
        "Straight": 13,
        "FullHouse": 14,
        "TenSmall": 15,
        "Forty": 16,
        "BombBull": 17
        ,
    },
    multiples: {
        //niuniu
        "NoBull": 0,
        "Cattle1": 1,
        "Cattle2": 1,
        "Cattle3": 1,
        "Cattle4": 1,
        "Cattle5": 1,
        "Cattle6": 1,
        "Cattle7": 2,
        "Cattle8": 2,
        "Cattle9": 3,
        "NiuNiu": 4,
        "GoldBull": 4,
        "GoldBullion": 4,
        "Straight": 5,
        "FullHouse": 6,
        "TenSmall": 7,
        "Forty": 7,
        "BombBull": 8,
    },
    getType: (sortedCards = []) => {
        /**
         * counts : list of counts for each number in card ; [1,4],[2,3],[1,1,3]
         * numSum : sum of card's numbers ; 27 = 3+5+6+6+7
         * numSortedCards ; [3,5,6,6,7]
         */
        let counts = [];
        let numSum = 0;
        let numSortedCards = [];
        numSortedCards = sortedCards.map(card => Number(card) % 10);
        numSortedCards = numSortedCards.sort();
        numSortedCards.forEach((i) => {
            counts[i] = (counts[i] || 0) + 1;
            numSum += i
        });
        counts = counts.filter((c) => {
            if (c) return c
        });
        counts = counts.sort();

        // activity card 
        let activityCards = [];
        //define card type
        {
            // BombBull check
            if (counts[counts.length - 1] == 4) {
                activityCards = numSortedCards.filter((card, index) => card == numSortedCards[index - 1] || card == numSortedCards[index + 1]);
                return { type: "BombBull", activityCards };
            };
            //Forty and tenSmall
            if (numSum >= 40) {
                return { type: "Forty", activityCards: [...sortedCards] };
            }
            if (numSum <= 10) {
                return { type: "TenSmall", activityCards: [...sortedCards] };
            }
            //FullHouse
            if (counts[1] == 3 && counts[0] == 2) {
                return { type: "FullHouse", activityCards: [...sortedCards] };
            }
            if (numSortedCards[0] == numSortedCards[1] - 1 && numSortedCards[1] == numSortedCards[2] - 1 && numSortedCards[2] == numSortedCards[3] - 1 && numSortedCards[3] == numSortedCards[4] - 1) {
                return { type: "Straight", activityCards: [...sortedCards] };
            }
            if (counts[2] == 3) {
                // notics : only count type is [1,1,3]
                // rest card that are not same each other
                let restCards = numSortedCards.filter((card, index) => card != numSortedCards[index - 1] && card != numSortedCards[index + 1]);
                activityCards = numSortedCards.filter((card, index) => card == numSortedCards[index - 1] || card == numSortedCards[index + 1]);
                if ((restCards[0] + restCards[1]) % 10 == 0) {
                    return { type: "GoldBullion", activityCards: [...sortedCards] };
                }
                else {
                    return { type: "GoldBull", activityCards: activityCards };
                }
            }
            // find bull
            let hasBull = false;
            let hasBullBull = false;
            let restCards = [];
            for (let i = 0; i < 5; i++)
                for (let j = i + 1; j < 5; j++)
                    for (let k = j + 1; k < 5; k++) {
                        if ((sortedCards[i] + sortedCards[j] + sortedCards[k]) % 10 == 0) {
                            hasBull = true;
                            restCards = sortedCards.filter((card, index) => index != i && index != j && index != k);
                            activityCards = [sortedCards[i], sortedCards[j], sortedCards[k]];
                            if ((restCards[0] + restCards[1]) % 10 == 0) {
                                activityCards = [...sortedCards];
                                hasBullBull = true;
                            }
                        };
                    }
            if (hasBullBull) {
                return { type: "NiuNiu", activityCards: activityCards };
            }
            if (hasBull) {
                return { type: "Cattle" + (restCards[0] + restCards[1]) % 10, activityCards: activityCards };
            }
            return { type: "NoBull", activityCards: [] };
        }
    },
    getScore: (cards = []) => {
        if (cards.length != 5) throw new Error("invalid cards");
        let sortedCard = cards.sort((card1, card2) => Number(card1) % 10 - Number(card2 % 10));
        let { type, activityCards } = NiuNiu.getType(sortedCard);
        return {
            type: type,
            score: NiuNiu.scores[type] * 100 + sortedCard[4] % 10 * 10 + Math.floor(sortedCard[4] / 10),
            multiple: NiuNiu.multiples[type],
            cards: cards,
            activityCards: activityCards
        }
    },
    getRandomCards: (playerCount) => {
        let cardType = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39];
        let randomCards = [];
        for (let i = 0; i < playerCount; i++) {
            let playerCards = [];
            for (let j = 0; j < 5; j++) {
                let randId = Math.floor(Math.random() * cardType.length);
                let cardNumber = cardType[randId];
                playerCards[j] = cardNumber;
                cardType.splice(randId, 1);
            }
            randomCards[i] = [...playerCards];
        }
        return randomCards;
    }
}

module.exports = { NiuNiu };