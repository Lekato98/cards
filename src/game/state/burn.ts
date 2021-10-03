import { Action, Game, InvalidAction } from '../game';
import { State, UserActionPayload } from './state';
import { GameAction } from '../game-action';

export class Burn implements State {
    private static instance: Burn;

    private constructor() {
    }

    public static getInstance(): Burn {
        if (!this.instance) {
            this.instance = new Burn();
        }

        return this.instance;
    }

    public action(context: GameAction, action: Action, payload?: UserActionPayload): void {
        switch (action) {
            case Action.BURN_CARD:
                return context.burnAction();

            default:
                throw new InvalidAction;
        }
    }
}
