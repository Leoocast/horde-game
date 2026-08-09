import { resolveBuiltinAudioUrl } from "../content/bootstrap";
import runtimeAudioAssets from "./runtimeAudioAssets.json";

export type MusicVariant = "battle" | "climax";
export type MusicCategory = "battle" | "menu" | "result";

type MusicCollection = {
  label: string;
  category: MusicCategory;
  battle: string;
  climax: string;
  loop?: boolean;
};

export const musicCollections = {
  zombiesBattle1: makeBattleCollection(
    "Zombies — Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.zombiesBattle1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.zombiesBattle1.climax),
  ),
  goblinsBattle1: makeBattleCollection(
    "Goblins — Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.goblinsBattle1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.goblinsBattle1.climax),
  ),
  clownsBattle1: makeBattleCollection(
    "Clowns — Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.clownsBattle1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.clownsBattle1.climax),
  ),
  fairyBattle1: makeBattleCollection(
    "Fairy — Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.fairyBattle1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.fairyBattle1.climax),
  ),
  piratesBattle1: makeBattleCollection(
    "Pirates — Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle1.climax),
  ),
  piratesBattle2: makeBattleCollection(
    "Pirates — Battle #2",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle2.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle2.climax),
  ),
  piratesBattle3: makeBattleCollection(
    "Pirates — Battle #3",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle3.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.piratesBattle3.climax),
  ),
  otherBattle2: makeBattleCollection(
    "Other — Battle #2",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle2.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle2.climax),
  ),
  otherBattle3: makeBattleCollection(
    "Other — Battle #3",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle3.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle3.climax),
  ),
  otherBattle4: makeBattleCollection(
    "Other — Battle #4",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle4.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattle4.climax),
  ),
  otherBattleGoty1: makeBattleCollection(
    "Other — GOTY Battle #1",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattleGoty1.battle),
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.otherBattleGoty1.climax),
  ),
  mainMenuMoonlitJourney: makeSingleTrack(
    "Moonlit Journey",
    "menu",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.mainMenuMoonlitJourney.battle),
  ),
  mainMenuWhispersBeyond: makeSingleTrack(
    "Whispers Beyond",
    "menu",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.mainMenuWhispersBeyond.battle),
  ),
  mainMenuFalconreach: makeSingleTrack(
    "Falconreach",
    "menu",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.mainMenuFalconreach.battle),
  ),
  mainMenuAmbient7: makeSingleTrack(
    "Ambient 7",
    "menu",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.mainMenuAmbient7.battle),
  ),
  winTheme: makeSingleTrack(
    "Victory",
    "result",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.winTheme.battle),
    false,
  ),
  lossTheme: makeSingleTrack(
    "Defeat",
    "result",
    resolveBuiltinAudioUrl(runtimeAudioAssets.music.lossTheme.battle),
    false,
  ),
} as const satisfies Record<string, MusicCollection>;

export type MusicCollectionId = keyof typeof musicCollections;

export const musicCollectionIds = Object.keys(musicCollections) as MusicCollectionId[];

export const battleThemeIds = collectionIdsFor("battle");
export const menuThemeIds = collectionIdsFor("menu");

function makeBattleCollection(label: string, battle: string, climax: string): MusicCollection {
  return {
    label,
    category: "battle",
    battle,
    climax,
  };
}

function makeSingleTrack(label: string, category: Exclude<MusicCategory, "battle">, url: string, loop = true): MusicCollection {
  return { label, category, battle: url, climax: url, loop };
}

function collectionIdsFor(category: MusicCategory): MusicCollectionId[] {
  return musicCollectionIds.filter((id) => musicCollections[id].category === category);
}
