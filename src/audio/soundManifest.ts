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
  activateEffect: new URL("../../assets/sounds/activate_effect.wav", import.meta.url).href,
  buff: new URL("../../assets/sounds/buff.wav", import.meta.url).href,
  fireballCast1: new URL("../../assets/sounds/fireball_cast_1.wav", import.meta.url).href,
  fireballCast2: new URL("../../assets/sounds/fireball_cast_2.wav", import.meta.url).href,
  fireballCast3: new URL("../../assets/sounds/fireball_cast_3.wav", import.meta.url).href,
  fireballHit1: new URL("../../assets/sounds/fireball_hit_1.wav", import.meta.url).href,
  fireballHit2: new URL("../../assets/sounds/fireball_hit_2.wav", import.meta.url).href,
} as const;

export type SfxId = keyof typeof sfxManifest;

// The fireball picks a fresh cast/impact voice each time so repeated Goblin burns in one
// sequence never sound like a loop. Consumers pick a random entry per beat.
export const fireballCastSfx: SfxId[] = ["fireballCast1", "fireballCast2", "fireballCast3"];
export const fireballHitSfx: SfxId[] = ["fireballHit1", "fireballHit2"];
