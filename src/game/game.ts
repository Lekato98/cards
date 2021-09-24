import { Card, CardAbility } from './card';
import { CardHand } from './card-hand';
import { CardStack } from './card-stack';
import { Deck } from './deck';
import { Player } from './player';
import { BurnedPicked } from './state/burned-picked';
import { Burn } from './state/burn';
import { EndRound } from './state/end-round';
import { ExchangeHandWithOther } from './state/exchange-hand-with-other';
import { PickBurn } from './state/pick-burn';
import { PilePicked } from './state/pile-picked';
import { RoundStart } from './state/round-start';
import { ShowOneHandCard } from './state/show-one-hand-card';
import { ShowOneOtherHandCard } from './state/show-one-other-hand-card';
import { State, UserActionPayload } from './state/state';

export class InvalidAction extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'InvalidAction';
        this.message = message ?? 'Action is not allowed in current state';
    }
}

export enum Action {
    CREATE_GAME, // user id
    START_GAME, // user id
    PREPARE_ROUND, // internal
    START_ROUND,// internal
    JOIN_AS_PLAYER, // user id
    JOIN_AS_SPECTATOR, // user id
    DISTRIBUTE_CARD, // inner action
    SELECT_FIRST_TURN, // inner action
    PICK_CARD_FROM_PILE, // user id
    PICK_CARD_FROM_BURNED, // user id
    BURN_ONE_HAND_CARD,
    BURN_CARD, // user id, card id
    THROW_CARD, // user id, card id
    USE_ABILITY,
    EXCHANGE_PICK_WITH_HAND, // user id, card id
    EXCHANGE_HAND_WITH_OTHER, // user id, card id, other user id, other card id
    SHOW_ONE_HAND_CARD, // user id, card id
    SHOW_ONE_OTHER_HAND_CARD, // user id, other user id, other card id
    NEXT_TURN, // inner action
    PASS, // user id
    RESTART, // user id
    LEAVE, // user id
    NO_ACTION, // nothing
}

export enum JoinType {
    PLAYER,
    SPECTATOR,
}

export class Game {
    public players: Array<Player>;
    public deck: Deck;
    public burnedCards: CardStack;
    public pileOfCards: CardStack;
    public passedBy: Player;
    public turn: number;
    public state: State;
    public maxNumberOfPlayers: number;
    public isGameStarted: boolean;
    public pickedCard: Card;
    public leader: number;
    // all actions that's will be called directly from code
    public readonly INTERNAL_BASED_ACTION = [
        Action.START_GAME,
        Action.START_ROUND,
        Action.DISTRIBUTE_CARD,
        Action.SELECT_FIRST_TURN,
        Action.NEXT_TURN,
    ];
    // all actions that's need to check isValidUser
    public readonly USER_BASED_ACTION = [
        Action.JOIN_AS_PLAYER,
        Action.JOIN_AS_SPECTATOR,
        Action.LEAVE,
    ];
    private readonly userPlayer: Map<number, Player>;
    private userSpectator: Map<number, Player>;
    private readonly jointType: Map<number, JoinType>;
    private readonly MIN_NUMBER_OF_PLAYERS: number = 3;
    private readonly MAX_NUMBER_OF_PLAYERS: number = 8;
    public readonly DEFAULT_NUMBER_OF_CARDS_PER_HAND: number = 4;
    // all actions that's need to check isLeader
    private readonly LEADER_BASED_ACTIONS = [Action.START_GAME, Action.RESTART];
    // all actions that's need to check isUserTurn
    private readonly USER_TURN_BASED_ACTION = [
        Action.BURN_CARD,
        Action.EXCHANGE_PICK_WITH_HAND,
        Action.PASS,
        Action.USE_ABILITY,
        Action.THROW_CARD,
        Action.PICK_CARD_FROM_BURNED,
        Action.PICK_CARD_FROM_PILE,
    ];

    constructor(maxNumberOfPlayers: number, state: State) {
        if (!this.isValidMaxNumberOfPlayers(maxNumberOfPlayers)) {
            throw new Error('Invalid maximum number of players');
        }

        this.maxNumberOfPlayers = maxNumberOfPlayers;
        this.deck = new Deck();
        this.burnedCards = new CardStack();
        this.pileOfCards = new CardStack();
        this.userPlayer = new Map<number, Player>();
        this.jointType = new Map<number, JoinType>();
        this.state = state;
        this.isGameStarted = false;
        this.pickedCard = null;
        this.leader = null;
        this.passedBy = null;

        this.initializePlayers();
    }

    public initializePlayers(): void {
        this.players = new Array<Player>(this.maxNumberOfPlayers);
        for (let i = 0; i < this.maxNumberOfPlayers; ++i) {
            this.players[i] = new Player();
        }
    }

    public get numberOfPlayers(): number {
        return this.userPlayer.size;
    }

    public setLeader(userId: number) {
        this.leader = userId;
    }

    public setState(state: State): void {
        this.state = state;

        if (this.state instanceof RoundStart) {
            this.action(Action.START_ROUND);
        }
    }

    public validateUsingActionBased(action: Action, userId?: number): boolean {
        const isIn = (_action: Action) => _action === action;
        if (this.LEADER_BASED_ACTIONS.some(isIn)) {
            return this.isLeaderUser(userId);
        } else if (this.USER_BASED_ACTION.some(isIn)) {
            return userId !== null && userId !== undefined;
        } else if (this.USER_TURN_BASED_ACTION.some(isIn)) {
            return this.isUserTurn(userId);
        } else {
            // todo check if needed
            return (userId === null || userId === undefined) && this.INTERNAL_BASED_ACTION.some(isIn);
        }
    }

    public action(action: Action, payload?: UserActionPayload) {
        if (!this.validateUsingActionBased(action, payload?.userId)) {
            throw InvalidAction;
        }

        // global available actions
        switch (action) {
            case Action.JOIN_AS_PLAYER: // same state
                return this.joinAsPlayerAction(payload.userId, payload.playerId);
            case Action.JOIN_AS_SPECTATOR: // same state
            case Action.LEAVE:
            // this.doSomething();

            default:
                this.state.action(this, action, payload);
        }
    }

    public nextTurn() {
        this.turn = (this.turn + 1) % this.players.length;
    }

    public startGameAction() {
        // @todo check if can start game, check num of players, or add bots etc ..
        if (this.isGameStarted) {
            throw new InvalidAction('Game already started');
        }

        this.isGameStarted = true;
        this.deck.shuffle();
        this.selectFirstTurnAction();
        this.setState(new RoundStart);
    }

    // public prepareRoundAction() {
    //     this.selectFirstTurnAction();
    //     this.setState(new RoundStart);
    // }

    public startRoundAction() {
        this.distributeCardsAction();
        this.showTwoHandCardsAction();
        this.setState(new PickBurn);
    }

    // @todo maybe rename (remove action from name)
    public distributeCardsAction() {
        console.log('Distribute Cards');
        this.players.forEach((_player: Player) => {
            for (let i = 1; i <= this.DEFAULT_NUMBER_OF_CARDS_PER_HAND; ++i) {
                _player.addCardToHand(this.deck.pop());
            }
        });

        while (!this.deck.isEmpty()) {
            this.pileOfCards.put(this.deck.pop());
        }
    }

    // @todo maybe rename (remove action from name)
    public showTwoHandCardsAction() {
        console.log('Show Cards');
        this.players.forEach((_player: Player) => _player.emitTwoCards());
    }

    // @todo maybe rename (remove action from name)
    public selectFirstTurnAction() {
        // @todo move logic to helper class
        this.turn = Math.floor(Math.random() * this.players.length);
    }

    public pickCardFromPileAction() {
        this.pickedCard = this.pileOfCards.pick();
        this.setState(new PilePicked);
    }

    public pickCardFromBurnedAction() {
        this.pickedCard = this.burnedCards.pick();
        this.setState(new BurnedPicked);
    }

    public burnOneHandCardAction(userId: number, cardId: string) {
        if (this.burnedCards.isEmpty()) {
            throw new InvalidAction('Burned cards stack is empty');
        }

        const player = this.userPlayer.get(userId);
        const card = player.getCard(cardId);
        const topBurnedCard = this.burnedCards.top;
        if (card.equalsRank(topBurnedCard)) {
            player.handCards.remove(card);
            this.burnedCards.put(card);
        } else {
            player.handCards.add(this.burnedCards.pick());
        }

        this.setState(new EndRound);
    }

    public useAbilityAction(): void {
        const cardAbility = this.pickedCard.getAbility();
        this.pickedCard.markAsUsed();
        switch (cardAbility) {
            case CardAbility.EXCHANGE_HAND_WITH_OTHER:
                return this.setState(new ExchangeHandWithOther);

            case CardAbility.SHOW_ONE_HAND_CARD:
                return this.setState(new ShowOneHandCard);

            case CardAbility.SHOW_ONE_OTHER_HAND_CARD:
                return this.setState(new ShowOneOtherHandCard);

            case CardAbility.NO_ABILITY:
                return this.setState(new Burn);

            default:
                throw new InvalidAction('Unknown ability');
        }
    }

    public exchangePickWithHandAction(userId: number, cardId: string) {
        const player = this.userPlayer.get(userId);
        let card = player.getCard(cardId);
        let pickedCard = this.pickedCard;
        [pickedCard, card] = [card, pickedCard];
        this.setState(new Burn);
    }

    public exchangeHandWithOther(userId: number, cardId: string, otherPlayerId: number, otherCardId: string) {
        if (this.isValidPlayer(otherPlayerId)) {
            const player = this.userPlayer.get(userId);
            const otherPlayer = this.players[otherPlayerId];
            if (player === otherPlayer) {
                throw new InvalidAction('Changing card with your self is not allowed');
            }

            let playerCard = player.getCard(cardId);
            let otherPlayerCard = otherPlayer.getCard(otherCardId);

            [playerCard, otherPlayerCard] = [otherPlayerCard, playerCard];
            this.setState(new Burn);
        } else {
            throw new InvalidAction('Pick valid card your turn.');
        }
    }

    public showOneHandCardAction(userId: number, cardId: string) {
        const card = this.userPlayer.get(userId).getCard(cardId);
        // emit with card suit, rank
        this.setState(new Burn);
    }

    public showOneOtherHandCardAction(userId: number, otherPlayerId: number, otherCardId: string) {
        if (this.isValidPlayer(otherPlayerId)) {
            const card = this.players[otherPlayerId].getCard(otherCardId);
            // emit with card suit, rank
            this.setState(new Burn);
        } else {
            throw new InvalidAction('Pick valid card');
        }
    }

    public passAction() {
        this.passedBy = this.players[this.turn];
    }

    public endGameAction() {

    }

    // user/turn action, game action, leader action
    public restartAction() {
        // @todo function reset
    }

    public joinAsPlayerAction(userId: number, playerId: number): void {
        if (this.isJoinedAsPlayer(userId)) {
            throw new InvalidAction('Player already joined');
        }

        if (!this.isValidPlayer(playerId)) {
            throw new InvalidAction('Invalid position or already taken');
        }

        if (this.isFull()) {
            throw new InvalidAction('The game is already full join another game');
        }

        if (!this.numberOfPlayers) {
            this.setLeader(userId);
        }

        this.userPlayer.set(userId, this.players[playerId]);
    }

    public joinAsSpectatorAction(): void {

    }

    public leaveAction(): void {

    }

    public isJoinedAsPlayer(userId: number): boolean {
        return this.userPlayer.has(userId);
    }

    // @todo
    public endOfTurn(): void {
        this.pickedCard = null;
    }

    public isUserTurn(userId: number): boolean {
        return this.players[this.turn].isOwner(userId);
    }

    public isValidMaxNumberOfPlayers(numberOfPlayers: number): boolean {
        return this.MIN_NUMBER_OF_PLAYERS <= numberOfPlayers && numberOfPlayers <= this.MAX_NUMBER_OF_PLAYERS;
    }

    public isLeaderUser(userId: number): boolean {
        return this.leader === userId;
    }

    public isValidPlayer(playerId: number): boolean {
        return 0 <= playerId && playerId < this.players.length;
    }

    public isFull(): boolean {
        return this.numberOfPlayers === this.maxNumberOfPlayers;
    }
}