export type MusicVariant = "battle" | "climax";

type MusicCollection = {
  label: string;
  battle: string;
  climax: string;
};

export const musicCollections = {
  battleTheme1: makeCollection(1),
  battleTheme2: makeCollection(2),
  battleTheme3: makeCollection(3),
  battleTheme4: makeCollection(4),
  battleTheme5: makeCollection(5),
  battleTheme6: makeCollection(6),
  battleTheme7: makeCollection(7),
  battleTheme8: makeCollection(8),
  battleTheme9: makeCollection(9),
  battleTheme10: makeCollection(10),
  battleTheme11: makeCollection(11),
  battleTheme12: makeCollection(12),
  battleTheme13: makeCollection(13),
  battleTheme14: makeCollection(14),
  battleTheme15: makeCollection(15),
  battleTheme16: makeCollection(16),
  bg3TwistedForced: {
    label: "BG3 - Twisted Forced",
    battle: new URL("../../assets/music/no_dinamic_music/BG3_Twisted_Forced.mp3", import.meta.url).href,
    climax: new URL("../../assets/music/no_dinamic_music/BG3_Twisted_Forced.mp3", import.meta.url).href,
  },
  bg3Raphael: {
    label: "BG3 - Raphael's Final Act",
    battle: new URL("../../assets/music/no_dinamic_music/BG3_Raphael_Final_Act.wav", import.meta.url).href,
    climax: new URL("../../assets/music/no_dinamic_music/BG3_Raphael_Final_Act.wav", import.meta.url).href,
  },
  winTheme: {
    label: "Passionate Duelist (Win)",
    battle: new URL("../../assets/music/no_dinamic_music/Passionate_Duelist_win.wav", import.meta.url).href,
    climax: new URL("../../assets/music/no_dinamic_music/Passionate_Duelist_win.wav", import.meta.url).href,
  },
  lossTheme: {
    label: "The Legacy of Bhaal (Loss)",
    battle: new URL("../../assets/music/no_dinamic_music/The_Legacy_Of_Bhaal_lost.wav", import.meta.url).href,
    climax: new URL("../../assets/music/no_dinamic_music/The_Legacy_Of_Bhaal_lost.wav", import.meta.url).href,
  },
  mainMenuTheme: {
    label: "Main Menu",
    battle: new URL("../../assets/music/no_dinamic_music/Main_menu_deck_view_song.mp3", import.meta.url).href,
    climax: new URL("../../assets/music/no_dinamic_music/Main_menu_deck_view_song.mp3", import.meta.url).href,
  },
} as const;

export type MusicCollectionId = keyof typeof musicCollections;

export const musicCollectionIds = Object.keys(musicCollections) as MusicCollectionId[];

export const battleThemeIds: MusicCollectionId[] = musicCollectionIds.filter((id) => id !== "winTheme" && id !== "lossTheme" && id !== "mainMenuTheme");

function makeCollection(index: number): MusicCollection {
  return {
    label: `Battle Theme #${index}`,
    battle: new URL(`../../assets/music/battle_theme_${index}.mp3`, import.meta.url).href,
    climax: new URL(`../../assets/music/climax_theme_${index}.mp3`, import.meta.url).href,
  };
}
