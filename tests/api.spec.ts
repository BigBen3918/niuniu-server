import { GameRound } from '../src/GameRound';
const round = new GameRound();

describe('testing api', () => {
  test('bank', () => {
    const result = round.getJudge([0,9,18,26,8]);
    console.log(result)
    // expect(result).toBe([15, 0]);
  });
});