export const battleThemeManifest = {
  battleTheme1: new URL("../../assets/music/battle_theme_1.mp3", import.meta.url).href,
  battleTheme2: new URL("../../assets/music/battle_theme_2.mp3", import.meta.url).href,
  battleTheme3: new URL("../../assets/music/battle_theme_3.mp3", import.meta.url).href,
  battleTheme4: new URL("../../assets/music/battle_theme_4.mp3", import.meta.url).href,
  battleTheme5: new URL("../../assets/music/battle_theme_5.mp3", import.meta.url).href,
  battleTheme6: new URL("../../assets/music/battle_theme_6.mp3", import.meta.url).href,
  battleTheme7: new URL("../../assets/music/battle_theme_7.mp3", import.meta.url).href,
  battleTheme8: new URL("../../assets/music/battle_theme_8.mp3", import.meta.url).href,
  battleTheme9: new URL("../../assets/music/battle_theme_9.mp3", import.meta.url).href,
  battleTheme10: new URL("../../assets/music/battle_theme_10.mp3", import.meta.url).href,
  battleTheme11: new URL("../../assets/music/battle_theme_11.mp3", import.meta.url).href,
  battleTheme12: new URL("../../assets/music/battle_theme_12.mp3", import.meta.url).href,
  battleTheme13: new URL("../../assets/music/battle_theme_13.mp3", import.meta.url).href,
  battleTheme14: new URL("../../assets/music/battle_theme_14.mp3", import.meta.url).href,
  battleTheme15: new URL("../../assets/music/battle_theme_15.mp3", import.meta.url).href,
  battleTheme16: new URL("../../assets/music/battle_theme_16.mp3", import.meta.url).href,
} as const;

export type BattleThemeId = keyof typeof battleThemeManifest;
