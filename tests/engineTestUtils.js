import { findCardDefinition } from "../src/data/decks";
import { createCardInstance, createInitialGame } from "../src/engine/GameState";

const emptyPlayerDeck = {
  id: "test-player",
  name: "Test Player",
  side: "player",
  deckSize: 0,
  cards: [],
};

const emptyHordeDeck = {
  id: "test-horde",
  name: "Test Horde",
  side: "horde",
  deckSize: 0,
  cards: [],
};

let nextInstance = 1;

export function createTestGame(seed = "engine-test") {
  const game = createInitialGame(emptyPlayerDeck, emptyHordeDeck, seed, 0);
  game.player.life = 30;
  return game;
}

export function cardFromDeck(definitionId, side, zone = "battlefield") {
  const definition = findCardDefinition(definitionId);
  if (!definition) throw new Error(`Missing card definition: ${definitionId}`);
  return cardFromDefinition(definition, side, zone);
}

export function customCard(
  id,
  side,
  {
    zone = "battlefield",
    cardTypes = ["Creature"],
    subtypes = [],
    keywords = [],
    power = 1,
    toughness = 1,
    manaCost = "",
    effects = [],
    activatedAbilities = [],
    isToken = false,
  } = {},
) {
  return cardFromDefinition(
    {
      id,
      name: id,
      manaCost,
      manaValue: 0,
      colors: [],
      cardTypes,
      subtypes,
      keywords,
      power,
      toughness,
      effects,
      activatedAbilities,
      isToken,
    },
    side,
    zone,
  );
}

export function addCard(game, card, side = card.controller, zone = card.zone) {
  card.controller = side;
  card.owner = side;
  card.zone = zone;
  game[side][zone].push(card);
  return card;
}

export function addForests(game, amount) {
  return Array.from({ length: amount }, () => addCard(game, cardFromDeck("forest", "player")));
}

function cardFromDefinition(definition, side, zone) {
  const instance = createCardInstance(definition, side, `test-${definition.id}-${nextInstance++}`);
  instance.zone = zone;
  instance.summoningSickness = false;
  return instance;
}
