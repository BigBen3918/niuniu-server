import { GameRound } from '../src/GameRound';
const round = new GameRound();

describe('testing api', () => {
  test('bank', () => {
    const result = round.getJudge([1,2,3,4,5]);
    console.log(result)
    expect(result[0]).toBe(21);
  });
});