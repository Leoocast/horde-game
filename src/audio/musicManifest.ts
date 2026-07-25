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
    new URL("../../assets/music/battle/Zombies/battle_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Zombies/climax_1.mp3", import.meta.url).href,
  ),
  goblinsBattle1: makeBattleCollection(
    "Goblins — Battle #1",
    new URL("../../assets/music/battle/Goblins/battle_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Goblins/climax_1.mp3", import.meta.url).href,
  ),
  clownsBattle1: makeBattleCollection(
    "Clowns — Battle #1",
    new URL("../../assets/music/battle/Clowns/Battle.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Clowns/Climax.mp3", import.meta.url).href,
  ),
  fairyBattle1: makeBattleCollection(
    "Fairy — Battle #1",
    new URL("../../assets/music/battle/Fairy/Battle_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Fairy/Climax_1.mp3", import.meta.url).href,
  ),
  piratesBattle1: makeBattleCollection(
    "Pirates — Battle #1",
    new URL("../../assets/music/battle/Pirates/Battle_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Pirates/Climax_1.mp3", import.meta.url).href,
  ),
  piratesBattle2: makeBattleCollection(
    "Pirates — Battle #2",
    new URL("../../assets/music/battle/Pirates/Battle_2.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Pirates/Climax_2.mp3", import.meta.url).href,
  ),
  piratesBattle3: makeBattleCollection(
    "Pirates — Battle #3",
    new URL("../../assets/music/battle/Pirates/Battle_3.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Pirates/Climax_3.mp3", import.meta.url).href,
  ),
  otherBattle1: makeBattleCollection(
    "Other — Battle #1",
    new URL("../../assets/music/battle/Other/Battle_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Other/Climax_1.mp3", import.meta.url).href,
  ),
  otherBattle2: makeBattleCollection(
    "Other — Battle #2",
    new URL("../../assets/music/battle/Other/Battle_2.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Other/Climax_2.mp3", import.meta.url).href,
  ),
  otherBattle3: makeBattleCollection(
    "Other — Battle #3",
    new URL("../../assets/music/battle/Other/Battle_3.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Other/Climax_3.mp3", import.meta.url).href,
  ),
  otherBattle4: makeBattleCollection(
    "Other — Battle #4",
    new URL("../../assets/music/battle/Other/Battle_4.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Other/Climax_4.mp3", import.meta.url).href,
  ),
  otherBattleGoty1: makeBattleCollection(
    "Other — GOTY Battle #1",
    new URL("../../assets/music/battle/Other/Battle_Goty_1.mp3", import.meta.url).href,
    new URL("../../assets/music/battle/Other/Climax_Goty_1.mp3", import.meta.url).href,
  ),
  mainMenuMoonlitJourney: makeSingleTrack(
    "Moonlit Journey",
    "menu",
    new URL("../../assets/music/main_menu/10. Moonlit Journey (Loop).mp3", import.meta.url).href,
  ),
  mainMenuWhispersBeyond: makeSingleTrack(
    "Whispers Beyond",
    "menu",
    new URL("../../assets/music/main_menu/3. Whispers Beyond (Loop).mp3", import.meta.url).href,
  ),
  mainMenuFalconreach: makeSingleTrack(
    "Falconreach",
    "menu",
    new URL("../../assets/music/main_menu/9. Falconreach.mp3", import.meta.url).href,
  ),
  mainMenuAmbient7: makeSingleTrack(
    "Ambient 7",
    "menu",
    new URL("../../assets/music/main_menu/Ambient 7 Loop.mp3", import.meta.url).href,
  ),
  winTheme: makeSingleTrack(
    "Victory",
    "result",
    new URL("../../assets/music/sfx/Victory.mp3", import.meta.url).href,
    false,
  ),
  lossTheme: makeSingleTrack(
    "Defeat",
    "result",
    new URL("../../assets/music/sfx/Lose.mp3", import.meta.url).href,
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
