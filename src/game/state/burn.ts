import { Action, Game, InvalidAction } from '../game';
import { State, UserActionPayload } from './state';

export class Burn implements State {
    action(context: Game, action: Action, payload?: UserActionPayload): void {
        switch (action) {
            case Action.BURN_CARD:
                return context.burnAction();

            default:
                throw new InvalidAction;
        }
    }
}
