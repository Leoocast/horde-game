export const sfxManifest = {
  click: new URL("../../assets/sounds/click.wav", import.meta.url).href,
  draw: new URL("../../assets/sounds/draw.mp3", import.meta.url).href,
  drawOne: new URL("../../assets/sounds/draw_one.wav", import.meta.url).href,
  playLand: new URL("../../assets/sounds/play_land.wav", import.meta.url).href,
  playMonster: new URL("../../assets/sounds/play_monster.wav", import.meta.url).href,
  playMonsterEffect: new URL("../../assets/sounds/play_monster_effect.wav", import.meta.url).href,
  playMonsterHeavy: new URL("../../assets/sounds/play_monster_heavy.wav", import.meta.url).href,
  attack: new URL("../../assets/sounds/attack.wav", import.meta.url).href,
  bloodSplash: new URL("../../assets/sounds/blood_splash.mp3", import.meta.url).href,
  bloodSplash2: new URL("../../assets/sounds/blood_splash2.mp3", import.meta.url).href,
  countessEnter: new URL("../../assets/sounds/countess/countess_enter.mp3", import.meta.url).href,
  countessHumans: new URL("../../assets/sounds/countess/countess_humans.mp3", import.meta.url).href,
  countessLaugh: new URL("../../assets/sounds/countess/countess_laugh_short.mp3", import.meta.url).href,
  countessPour: new URL("../../assets/sounds/countess/countess_pour.mp3", import.meta.url).href,
  countessThirdAttack: new URL("../../assets/sounds/countess/countess_third_attack.mp3", import.meta.url).href,
  countessWeak: new URL("../../assets/sounds/countess/countess_weak.mp3", import.meta.url).href,
  punch: new URL("../../assets/sounds/punch.mp3", import.meta.url).href,
  defend: new URL("../../assets/sounds/defend.wav", import.meta.url).href,
  skipNextBattle: new URL("../../assets/sounds/skip_next_battle.wav", import.meta.url).href,
  activateEffect: new URL("../../assets/sounds/activate_effect.wav", import.meta.url).href,
  buff: new URL("../../assets/sounds/buff.wav", import.meta.url).href,
  lastRainBuff: new URL("../../assets/sounds/last_rain_buff.mp3", import.meta.url).href,
  fireballCast1: new URL("../../assets/sounds/fireball_cast_1.wav", import.meta.url).href,
  fireballCast2: new URL("../../assets/sounds/fireball_cast_2.wav", import.meta.url).href,
  fireballCast3: new URL("../../assets/sounds/fireball_cast_3.wav", import.meta.url).href,
  fireballHit: new URL("../../assets/sounds/fireball_hit.wav", import.meta.url).href,
} as const;

export type SfxId = keyof typeof sfxManifest;

export type SfxGroupId = "interface" | "summoning" | "combat" | "effects" | "countess" | "fireball";

export const sfxGroups: Array<{ id: SfxGroupId; label: string }> = [
  { id: "interface", label: "Interface & cards" },
  { id: "summoning", label: "Summoning" },
  { id: "combat", label: "Combat" },
  { id: "effects", label: "Effects" },
  { id: "countess", label: "Countess voices" },
  { id: "fireball", label: "Fireball variants" },
];

export const sfxMetadata: Record<SfxId, { label: string; group: SfxGroupId }> = {
  click: { label: "Valid click", group: "interface" },
  draw: { label: "Draw", group: "interface" },
  drawOne: { label: "Draw one", group: "interface" },
  playLand: { label: "Play land", group: "interface" },
  playMonster: { label: "Play monster", group: "summoning" },
  playMonsterEffect: { label: "Play monster effect", group: "summoning" },
  playMonsterHeavy: { label: "Play monster heavy", group: "summoning" },
  attack: { label: "Attack", group: "combat" },
  bloodSplash: { label: "Blood splash", group: "combat" },
  bloodSplash2: { label: "Blood splash 2", group: "combat" },
  punch: { label: "Punch", group: "combat" },
  defend: { label: "Defend", group: "combat" },
  skipNextBattle: { label: "Skip / next battle", group: "effects" },
  activateEffect: { label: "Activate effect", group: "effects" },
  buff: { label: "Buff", group: "effects" },
  lastRainBuff: { label: "El Pacto de Elarion buff", group: "effects" },
  countessEnter: { label: "Countess enters", group: "countess" },
  countessHumans: { label: "Countess · Humans", group: "countess" },
  countessLaugh: { label: "Countess · Laugh", group: "countess" },
  countessPour: { label: "Countess · Pour", group: "countess" },
  countessThirdAttack: { label: "Countess · Third attack", group: "countess" },
  countessWeak: { label: "Countess · Weak", group: "countess" },
  fireballCast1: { label: "Fireball cast 1", group: "fireball" },
  fireballCast2: { label: "Fireball cast 2", group: "fireball" },
  fireballCast3: { label: "Fireball cast 3", group: "fireball" },
  fireballHit: { label: "Fireball hit", group: "fireball" },
};

// Casts keep varied voices; impact currently has one canonical hit.
export const fireballCastSfx: SfxId[] = ["fireballCast1", "fireballCast2", "fireballCast3"];
export const fireballHitSfx: SfxId = "fireballHit";
