import assert from "node:assert/strict";
import { test } from "node:test";

import gameArt from "../src/data/cardStudioGameArt.generated.json";
import runtimeLayout from "../src/data/cardRuntimeLayout.generated.json";
import {
  BUILTIN_PACK_DESCRIPTOR,
  DEFAULT_HOST_DECK_ID,
  DEFAULT_PLAYER_DECK_ID,
} from "../src/content/BuiltinContentSource";
import {
  builtinAssetRef,
  builtinAudioAssetRef,
  createDesktopAssetResolver,
  createWebAssetResolver,
} from "../src/content/AssetResolver";
import { contentCatalog, resolveBuiltinAssetUrl } from "../src/content/bootstrap";
import { qualifiedCardKey, qualifiedDeckKey } from "../src/content/identity";
import { validateExternalContentPolicy } from "../src/content/externalContentPolicy";
import {
  DECK_REGISTRY,
  DEFAULT_HOST_DECK_KEY,
  DEFAULT_PLAYER_DECK_KEY,
  getHostDeck,
  getPlayerDeck,
} from "../src/data/decks";
import { useCardDetails, usesFullArtCardImage } from "../src/utils/cardImages";

test("builtin content bootstraps as one immutable pack with the original order and 61 identities", () => {
  assert.deepEqual(contentCatalog.activeSources, [{ sourceId: "builtin", origin: "builtin" }]);
  assert.deepEqual(contentCatalog.packs, [BUILTIN_PACK_DESCRIPTOR]);
  assert.equal(contentCatalog.revision, "builtin.hostfall.core@0.0.2-beta.0");
  assert.equal(contentCatalog.decks.length, 4);
  assert.equal(contentCatalog.definitions.length, 61);
  assert.deepEqual(
    contentCatalog.decks.map(({ deck }) => deck.id),
    [
      "pact_of_elarion",
      "court_of_the_crimson_eclipse",
      "uprising_of_the_graveless",
      "legion_of_varka",
    ],
  );
  assert.equal(DECK_REGISTRY, contentCatalog.decks);
  assert.ok(Object.isFrozen(contentCatalog));
  assert.ok(Object.isFrozen(contentCatalog.decks));
  assert.ok(Object.isFrozen(contentCatalog.decks[0]));
  assert.ok(Object.isFrozen(contentCatalog.decks[0].raw));
  assert.ok(Object.isFrozen(contentCatalog.decks[0].images));
  assert.ok(Object.isFrozen(contentCatalog.definitions[0].definition));
});

test("builtin defaults and qualified aliases resolve explicitly without silent cross-side fallbacks", () => {
  assert.equal(DEFAULT_PLAYER_DECK_ID, "pact_of_elarion");
  assert.equal(DEFAULT_HOST_DECK_ID, "uprising_of_the_graveless");
  assert.equal(DEFAULT_PLAYER_DECK_KEY, "hostfall.core/pact_of_elarion");
  assert.equal(DEFAULT_HOST_DECK_KEY, "hostfall.core/uprising_of_the_graveless");
  assert.equal(getPlayerDeck(DEFAULT_PLAYER_DECK_ID), getPlayerDeck(DEFAULT_PLAYER_DECK_KEY));
  assert.equal(getHostDeck(DEFAULT_HOST_DECK_ID), getHostDeck(DEFAULT_HOST_DECK_KEY));
  assert.throws(() => getPlayerDeck("missing_deck"), /not registered/u);
  assert.throws(() => getHostDeck(DEFAULT_PLAYER_DECK_ID), /belongs to side/u);
});

test("qualified deck/card identity is available while builtin legacy aliases remain equivalent", () => {
  for (const entry of contentCatalog.decks) {
    const deckKey = qualifiedDeckKey(entry.packId, entry.deck.id);
    assert.equal(deckKey, entry.qualifiedDeckKey);
    assert.equal(contentCatalog.findDeck(deckKey), entry);
    assert.equal(contentCatalog.findDeck(entry.deck.id), entry);

    const seenCardIds = new Set();
    for (const card of [...entry.deck.cards, ...(entry.deck.tokens ?? [])]) {
      // Varka's Minion is intentionally authored both as a deck card and token under one identity.
      if (seenCardIds.has(card.id)) continue;
      seenCardIds.add(card.id);
      const cardKey = qualifiedCardKey(entry.packId, entry.deck.id, card.id);
      assert.equal(contentCatalog.findDefinition(cardKey), card);
      assert.equal(contentCatalog.findDefinition(card.id), card);
      const metadata = contentCatalog.findDefinitionRecord(cardKey);
      assert.deepEqual(
        [metadata.packKey, metadata.packId, metadata.origin, metadata.revision],
        ["builtin.hostfall.core", "hostfall.core", "builtin", "0.0.2-beta.0"],
      );
    }
  }
});

test("web and desktop asset adapters resolve logical builtin refs without filesystem paths", () => {
  const ref = builtinAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, "/cards/pact_of_elarion/aelyra_heir_of_elarion.png");
  const web = createWebAssetResolver([BUILTIN_PACK_DESCRIPTOR.packKey]);
  const desktop = createDesktopAssetResolver([BUILTIN_PACK_DESCRIPTOR.packKey]);

  assert.deepEqual(ref, {
    packKey: "builtin.hostfall.core",
    path: "cards/pact_of_elarion/aelyra_heir_of_elarion.png",
  });
  assert.equal(web.resolve(ref), "/cards/pact_of_elarion/aelyra_heir_of_elarion.png");
  assert.equal(resolveBuiltinAssetUrl("/cards/pact_of_elarion/aelyra_heir_of_elarion.png"), web.resolve(ref));
  assert.equal(
    desktop.resolve(ref),
    "hostfall://content/builtin.hostfall.core/cards/pact_of_elarion/aelyra_heir_of_elarion.png",
  );
  assert.doesNotMatch(desktop.resolve(ref), /(?:file:|[a-z]:\\|\\\\)/iu);

  for (const invalid of [
    "/cards/../secret.png",
    "/cards/%2e%2e/secret.png",
    "/cards/deck\\secret.png",
    "/cards//secret.png",
    "https://example.test/card.png",
    "C:\\cards\\secret.png",
  ]) {
    assert.throws(() => builtinAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, invalid));
  }
  assert.throws(() => web.resolve({ packKey: "local.unregistered", path: "cards/test.png" }), /not registered/u);

  const audioRef = builtinAudioAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, "/audio/music/main menu.mp3");
  assert.equal(web.resolve(audioRef), "/audio/music/main menu.mp3");
  assert.equal(
    desktop.resolve(audioRef),
    "hostfall://content/builtin.hostfall.core/audio/music/main%20menu.mp3",
  );
  assert.throws(() => builtinAudioAssetRef(BUILTIN_PACK_DESCRIPTOR.packKey, "/cards/not-audio.png"));
});

test("Card Studio runtime projections still resolve to the authored web URLs", () => {
  for (const entry of DECK_REGISTRY) {
    for (const [cardId, image] of Object.entries(entry.images.cards)) {
      const details = useCardDetails(cardId);
      assert.equal(details.imageUrl, image.imageUrl, `${entry.deck.id}/${cardId} full card URL changed`);
      const authoredArt = gameArt.cards[cardId]?.artUrl;
      assert.ok(authoredArt, `${entry.deck.id}/${cardId} has no Card Studio game-art projection`);
      assert.equal(details.battlefieldArtUrl, authoredArt, `${entry.deck.id}/${cardId} field art URL changed`);
    }
  }

  for (const deck of Object.values(runtimeLayout.decks)) {
    for (const cardId of Object.keys(deck.cards)) {
      assert.equal(usesFullArtCardImage(cardId), true, `${cardId} lost its Card Studio runtime layout`);
    }
  }
});

test("external content policy accepts a declarative raster-only candidate and assigns its origin", () => {
  const result = validateExternalContentPolicy(validExternalCandidate(), "workshop");
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
  assert.deepEqual(result.descriptor, {
    packKey: "workshop.community.sample",
    packId: "community.sample",
    origin: "workshop",
    revision: "1",
  });
  assert.equal("origin" in result.candidate.manifest, false);
});

test("external content policy rejects handlers, markers, remote URLs, traversal and executable assets", () => {
  const adversarial = [
    mutateCandidate((candidate) => { candidate.origin = "builtin"; }),
    mutateCandidate((candidate) => { candidate.decks[0].raw.cards[0].abilities = [{ kind: "STATIC", customHandler: "native" }]; }),
    mutateCandidate((candidate) => { candidate.decks[0].raw.cards[0].engineSupport = "custom"; }),
    mutateCandidate((candidate) => { candidate.decks[0].raw.cards[0].runtimeMarker = "engine-only"; }),
    mutateCandidate((candidate) => {
      candidate.assets[0] = "https://example.test/evil.png";
      candidate.decks[0].images.cards.sample_echo.imageUrl = candidate.assets[0];
    }),
    mutateCandidate((candidate) => {
      candidate.assets[0] = "cards/../evil.png";
      candidate.decks[0].images.cards.sample_echo.imageUrl = candidate.assets[0];
    }),
    mutateCandidate((candidate) => {
      candidate.assets[0] = "cards/evil.js";
      candidate.decks[0].images.cards.sample_echo.imageUrl = candidate.assets[0];
    }),
    mutateCandidate((candidate) => {
      candidate.decks[0].raw.cards[0].abilities = [{
        kind: "SPELL",
        effects: [{ type: "RUN_NATIVE_CODE" }],
      }];
    }),
  ];

  for (const candidate of adversarial) {
    const result = validateExternalContentPolicy(candidate, "local");
    assert.equal(result.ok, false, JSON.stringify(candidate));
    assert.ok(result.issues.length > 0);
  }
});

function validExternalCandidate() {
  return {
    manifest: {
      schemaVersion: "1.0.0",
      packId: "community.sample",
      revision: "1",
    },
    decks: [{
      label: "Sample 1",
      raw: {
        schemaVersion: "1.0.0",
        id: "sample_deck",
        name: "Sample Deck",
        side: "player",
        cards: [{
          id: "sample_echo",
          name: "Sample Echo",
          flavorText: { en: "Sample.", es: "Ejemplo." },
          showFlavorText: true,
          kinds: ["ECHO"],
        }],
      },
      images: {
        provider: "local",
        cards: {
          sample_echo: {
            source: "local",
            imageUrl: "cards/sample/sample_echo.png",
          },
        },
      },
      presentation: {
        keyCardId: "sample_echo",
        theme: "ramp",
        descriptionKey: "setup.descriptionRamp",
      },
    }],
    assets: ["cards/sample/sample_echo.png"],
  };
}

function mutateCandidate(mutate) {
  const candidate = structuredClone(validExternalCandidate());
  mutate(candidate);
  return candidate;
}
