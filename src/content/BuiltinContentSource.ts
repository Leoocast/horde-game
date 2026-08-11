import packageMetadata from "../../package.json";
import legionOfVarkaRaw from "../data/decks/host/legion_of_varka/legion_of_varka.json";
import legionOfVarkaImagesRaw from "../data/decks/host/legion_of_varka/legion_of_varka_images.json";
import uprisingOfTheGravelessRaw from "../data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json";
import uprisingOfTheGravelessImagesRaw from "../data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless_images.json";
import pactOfElarionRaw from "../data/decks/player/pact_of_elarion/pact_of_elarion.json";
import pactOfElarionImagesRaw from "../data/decks/player/pact_of_elarion/pact_of_elarion_images.json";
import courtOfTheCrimsonEclipseRaw from "../data/decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse.json";
import courtOfTheCrimsonEclipseImagesRaw from "../data/decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse_images.json";
import type {
  ContentDeckCandidate,
  ContentPackCandidate,
  ContentPackDescriptor,
  ContentSource,
  DeckImageManifest,
  DeckPresentation,
  NewDeckList,
} from "./contracts";

export const BUILTIN_PACK_DESCRIPTOR: ContentPackDescriptor = Object.freeze({
  packKey: "builtin.hostfall.core",
  packId: "hostfall.core",
  origin: "builtin",
  revision: packageMetadata.version,
});

export const DEFAULT_PLAYER_DECK_ID = "pact_of_elarion";
export const DEFAULT_HOST_DECK_ID = "uprising_of_the_graveless";

const BUILTIN_DECKS: readonly ContentDeckCandidate[] = Object.freeze([
  builtinDeck(pactOfElarionRaw as NewDeckList, pactOfElarionImagesRaw as DeckImageManifest, {
    keyCardId: "aelyra_heir_of_elarion",
    theme: "ramp",
    descriptionKey: "setup.descriptionRamp",
  }),
  builtinDeck(courtOfTheCrimsonEclipseRaw as NewDeckList, courtOfTheCrimsonEclipseImagesRaw as DeckImageManifest, {
    keyCardId: "mirevna_countess_of_the_crimson_eclipse",
    theme: "vampire",
    descriptionKey: "setup.descriptionVampires",
  }),
  builtinDeck(uprisingOfTheGravelessRaw as NewDeckList, uprisingOfTheGravelessImagesRaw as DeckImageManifest, {
    keyCardId: "nerezh_graveless_matriarch",
    theme: "zombie",
    descriptionKey: "setup.descriptionZombies",
    encounterTone: "undead",
  }),
  builtinDeck(legionOfVarkaRaw as unknown as NewDeckList, legionOfVarkaImagesRaw as DeckImageManifest, {
    keyCardId: "varka_infernal_matriarch",
    theme: "goblin",
    descriptionKey: "setup.descriptionGoblins",
    encounterTone: "goblins",
  }),
]);

const BUILTIN_PACK: ContentPackCandidate = Object.freeze({
  descriptor: BUILTIN_PACK_DESCRIPTOR,
  decks: BUILTIN_DECKS,
});

export class BuiltinContentSource implements ContentSource {
  readonly sourceId = "builtin";
  readonly origin = "builtin" as const;

  loadCandidates(): readonly ContentPackCandidate[] {
    return Object.freeze([BUILTIN_PACK]);
  }
}

function builtinDeck(
  raw: NewDeckList,
  images: DeckImageManifest,
  presentation: DeckPresentation,
): ContentDeckCandidate {
  return Object.freeze({
    label: `${raw.name} ${raw.deckSize}`,
    raw,
    images,
    presentation: Object.freeze(presentation),
  });
}
