import { resolveBuiltinAudioUrl } from "../content/bootstrap";
import runtimeAudioAssets from "./runtimeAudioAssets.json";

export const sfxManifest = {
  click: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.click),
  draw: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.draw),
  drawOne: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.drawOne),
  playLand: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.playLand),
  playMonster: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.playMonster),
  playMonsterEffect: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.playMonsterEffect),
  playMonsterHeavy: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.playMonsterHeavy),
  attack: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.attack),
  bloodSplash: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.bloodSplash),
  bloodSplash2: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.bloodSplash2),
  countessEnter: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessEnter),
  countessHumans: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessHumans),
  countessLaugh: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessLaugh),
  countessPour: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessPour),
  countessThirdAttack: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessThirdAttack),
  countessWeak: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.countessWeak),
  punch: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.punch),
  defend: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.defend),
  skipNextBattle: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.skipNextBattle),
  activateEffect: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.activateEffect),
  buff: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.buff),
  pactOfElarionBuff: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.pactOfElarionBuff),
  fireballCast1: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.fireballCast1),
  fireballCast2: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.fireballCast2),
  fireballCast3: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.fireballCast3),
  fireballHit: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.fireballHit),
  selectAttacker: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.selectAttacker),
  stoneCrash: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.stoneCrash),
  vaelorLinePlay: resolveBuiltinAudioUrl(runtimeAudioAssets.sfx.vaelorLinePlay),
} as const;

export type SfxId = keyof typeof sfxManifest;

export type SfxGroupId = "new" | "interface" | "summoning" | "combat" | "effects" | "countess" | "fireball";

export const sfxGroups: Array<{ id: SfxGroupId; label: string }> = [
  { id: "new", label: "New feature cues" },
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
  pactOfElarionBuff: { label: "El Pacto de Elarion buff", group: "effects" },
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
  selectAttacker: { label: "Select attacker", group: "new" },
  stoneCrash: { label: "Vaelor stone crash", group: "new" },
  vaelorLinePlay: { label: "Vaelor play line", group: "new" },
};

// Casts keep varied voices; impact currently has one canonical hit.
export const fireballCastSfx: SfxId[] = ["fireballCast1", "fireballCast2", "fireballCast3"];
export const fireballHitSfx: SfxId = "fireballHit";
