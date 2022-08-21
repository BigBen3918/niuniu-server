import { GameRound } from './GameRound';
import { JUDGETYPE } from './Model';
// const round = new GameRound();

const getJudge = (cards:number[]) => {
    //cards = [0,1,2,3,4]
    if(cards.find(e=>e == -1)) return [JUDGETYPE.undefined, -1]
    const tmp = {} as {[n: number]: number}
    let sortedArray = [] as Array<{n: number, org: number}>;
    let sum = 0, dups = 0, cardPower = 0;
    {
        for(let i = 0; i < 5; i++) {
            cardPower += Math.floor((cards[i] + 1) / 10)
            sortedArray[i] = {n: (cards[i] % 9) + 1, org: cards[i]};
            sum += sortedArray[i].n;
        }
        sortedArray = sortedArray.sort((a, b)=>(a.n - b.n));

        for (let i of sortedArray) {
            if (tmp[i.n]===undefined) {
                tmp[i.n] = 1;
            } else {
                tmp[i.n]++;
            }
        }
        for (let k in tmp) {
            if (tmp[k] > dups) dups = tmp[k];
        }
    }

    { // 炸弹牛
        if (dups===4) return [JUDGETYPE.Bomb, cardPower];
    }
    { // 四十 or 十小
        if (sum >= 40) return [JUDGETYPE.Forty, cardPower];
        if (sum <= 10) return [JUDGETYPE.Ten, cardPower];
    }
    { // 葫芦牛, 金牌牛牛, 金牌牛
        if (dups===3) {
            const cs = [] as number[];
            const keys = Object.keys(tmp)
            keys.forEach(key => {
                if(tmp[Number(key)] !== 3){
                    cs.push(Number(key))
                }
            });
            
            
            if (cs.length===1) {
                return [JUDGETYPE.Gourd, cardPower];
            } else {
                switch ((cs[0] + cs[1]) % 10) {
                case 0: return [JUDGETYPE.GoldDouble, cardPower];
                case 1: return [JUDGETYPE.Gold_1, cardPower];
                case 2: return [JUDGETYPE.Gold_2, cardPower];
                case 3: return [JUDGETYPE.Gold_3, cardPower];
                case 4: return [JUDGETYPE.Gold_4, cardPower];
                case 5: return [JUDGETYPE.Gold_5, cardPower];
                case 6: return [JUDGETYPE.Gold_6, cardPower];
                case 7: return [JUDGETYPE.Gold_7, cardPower];
                case 8: return [JUDGETYPE.Gold_8, cardPower];
                case 9: return [JUDGETYPE.Gold_9, cardPower];
                }
            }
        }
    }
    { // 顺子
        let isSequence = true;
        let prev = 0;
        for (let i of sortedArray) {
            if (prev!==0 && prev + 1!==i.n) {
                isSequence = false;
                break;
            }
            prev = i.n;
        }
        if (isSequence) return [JUDGETYPE.Sequence, cardPower];
    }
    { // find cattle
        let rests = [] as Array<{n: number, org: number}>;
        for (let i of sortedArray) {
            let a = i;
            for (let i of sortedArray) {
                if (i.org===a.org) continue;
                let b = i;
                for (let i of sortedArray) {
                    if (i.org===a.org || i.org===b.org) continue;
                    let c = i;
                    if ((a.n + b.n + c.n) % 10===0) {
                        rests = sortedArray.filter(i=>i.org!==a.org && i.org!==b.org && i.org!==c.org);
                        break;
                    }
                }
                if (rests.length) break;
            }
            if (rests.length) break;
        }
        if (rests.length!==0) {
            let r = 0;
            switch ((rests[0].n + rests[1].n) % 10) {
            case 0: r = JUDGETYPE.Double; break;
            case 1: r = JUDGETYPE.Cattle_1; break;
            case 2: r = JUDGETYPE.Cattle_2; break;
            case 3: r = JUDGETYPE.Cattle_3; break;
            case 4: r = JUDGETYPE.Cattle_4; break;
            case 5: r = JUDGETYPE.Cattle_5; break;
            case 6: r = JUDGETYPE.Cattle_6; break;
            case 7: r = JUDGETYPE.Cattle_7; break;
            case 8: r = JUDGETYPE.Cattle_8; break;
            case 9: r = JUDGETYPE.Cattle_9; break;
            }
            return [r as JUDGETYPE, cardPower, rests[0].org, rests[1].org];
        }
    }
    return [JUDGETYPE.None, cardPower];
}

const testPair = (title: string, params: number[], expected: number) => {
    let result = getJudge(params);
    console.log(`${title} ${JSON.stringify(params)} 结果 ${result[0]} 期待 ${expected}`)
}

const testResult = () => {
    // testPair('牛牛', [1,2,3,4,5], 19);
    // testPair('金牌牛牛', [0,9,18,6,2], 20);
    testPair('顺子', [0,1,2,3,4], 21);
    testPair('顺子', [4,2,1,7,10], 18);
    testPair('十小', [0,9,18,1,2], 23);
    testPair('金牌牛牛', [0,9,18,6,2], 20);
    testPair('金牌牛九', [0,9,18,6,1], 18);
    testPair('牛九', [0,3,4,6,1], 17);
}

testResult();