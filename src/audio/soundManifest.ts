export const sfxManifest = {
  click: new URL("../../assets/sounds/click.wav", import.meta.url).href,
  draw: new URL("../../assets/sounds/draw.mp3", import.meta.url).href,
  drawOne: new URL("../../assets/sounds/draw_one.wav", import.meta.url).href,
  playLand: new URL("../../assets/sounds/play_land.wav", import.meta.url).href,
  playMonster: new URL("../../assets/sounds/play_monster.wav", import.meta.url).href,
  playMonsterEffect: new URL("../../assets/sounds/play_monster_effect.wav", import.meta.url).href,
  playMonsterHeavy: new URL("../../assets/sounds/play_monster_heavy.wav", import.meta.url).href,
  attack: new URL("../../assets/sounds/attack.wav", import.meta.url).href,
  defend: new URL("../../assets/sounds/defend.wav", import.meta.url).href,
  skipNextBattle: new URL("../../assets/sounds/skip_next_battle.wav", import.meta.url).href,
} as const;

export type SfxId = keyof typeof sfxManifest;
