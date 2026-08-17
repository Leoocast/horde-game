import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";

import { activeDefenseArrowLinks, isBehindInStackOrder, isFrontOfCardStack, visibleDefenseArrowLinks } from "../src/components/battlefieldLayout";
import {
  burnProjectileOriginRatios,
  burnProjectileParticleTimings,
} from "../src/components/burnPresentation";
import {
  burnImpactRoutes,
  burnMaterialColors,
  burnRenderBatches,
} from "../src/components/burnFireball";
import { shardPath, shardSuction, shardTiming } from "../src/components/destinyShardSuction";
import { buildDefeatShatterPlan } from "../src/components/defeatShatterGeometry";
import { grownVfxSurface, sharedVfxSourceTop } from "../src/components/sharedVfxRenderer";
import { frameLeafRootIndex, frameRootPathSpecs } from "../src/components/GrowthBuffAnimator";
import { buildStorm, stormBoltTones } from "../src/components/StormBuffAnimator";
import {
  completedHostMillPreviewCount,
  hostArchiveAttackPreview,
  hostArchiveDiscardCounterValue,
  hostMillOriginSelector,
} from "../src/components/hostArchiveCounter";
import { hostAttackPlayerHitDelay } from "../src/components/hostAttackPresentation";
import { memoryCardsNewestFirst, newestMemoryCard } from "../src/components/memoryPresentation";
import { playerAttackHostHitDelay } from "../src/components/playerAttackPresentation";
import { setupJustCompleted, setupPrimaryAction, setupProgress } from "../src/components/setupPresentation";
import { CardStatsBadge, CardTraitTooltipBadge } from "../src/components/Card";
import { CardTraitIcon } from "../src/components/CardTraitIcon";
import { PreviewStatsBadge, TraitPills } from "../src/components/CardPreview";
import { VampireBite } from "../src/components/VampireBite";
import { cardLabelCamelCase } from "../src/i18n/cardLocalization";
import { translate } from "../src/i18n/translations";
import {
  resolveCardBurnMaterial,
  resolveCardBurnScale,
  resolvePersonalAttackAnimation,
  resolvePersonalCombatAnimation,
  resolvePersonalTargetedAttackAnimation,
} from "../src/store/combatAnimation";
import { burnPathCurvature, resolveBurnRenderer } from "../src/store/burnAnimation";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("Preparation progress preserves the original total across normal play and resume", () => {
  assert.deepEqual(setupProgress(4, 4), { completed: 1, current: 1, total: 4 });
  assert.deepEqual(setupProgress(4, 3), { completed: 2, current: 2, total: 4 });
  assert.deepEqual(setupProgress(4, 1), { completed: 4, current: 4, total: 4 });
  assert.deepEqual(setupProgress(3, 2), { completed: 2, current: 2, total: 3 });
  assert.deepEqual(setupProgress(2, 0), undefined);
  assert.deepEqual(setupProgress(0, 2), { completed: 1, current: 1, total: 2 });
  assert.equal(translate("es", "phase.setupStepBanner", { current: 1, total: 3 }), "Preparación 1/3");
  assert.equal(translate("en", "phase.setupStepBanner", { current: 1, total: 3 }), "Preparation 1/3");
  assert.deepEqual(
    [1, 2, 3].map((current) => translate("es", "phase.setupStepShort", { current })),
    ["Prep. 1", "Prep. 2", "Prep. 3"],
  );
  assert.equal(translate("es", "orb.extraTurn"), "Siguiente paso");
  assert.equal(translate("es", "orb.endTurn"), "Terminar turno");
});

// Preparation is taught by the tutorial and labelled by the permanent HUD, so both languages must
// keep a single name for it. English previously mixed "Setup" and "Extra Turn" with the lesson copy.
test("Preparation keeps one name per language across HUD, orb and guided copy", () => {
  for (const language of ["en", "es"]) {
    const setupName = translate(language, "phase.setup");
    assert.ok(
      translate(language, "phase.setupStepBanner", { current: 1, total: 3 }).startsWith(setupName),
      `${language} setup banner must reuse "${setupName}".`,
    );
    assert.doesNotMatch(translate(language, "orb.extraTurn"), /extra/iu);
    assert.match(
      translate(language, "guided.firstSeed.preparationBody"),
      new RegExp(setupName, "iu"),
      `${language} guided copy must reuse "${setupName}".`,
    );
  }
  assert.match(translate("en", "guided.firstSeed.continueFirstBody"), /Press Next Step\./u);
  assert.match(translate("es", "guided.firstSeed.continueFirstBody"), /Pulsa Siguiente paso\./u);
});

test("phase banners use content-sized plaques with tone-matched accents", () => {
  const bannerSource = readFileSync(new URL("../src/components/PhaseBanner.tsx", import.meta.url), "utf8");
  const statusSource = readFileSync(new URL("../src/components/GameStatusBadge.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(bannerSource, /lucide-react|phase-banner-crest|visiblePhase\.Icon/);
  assert.doesNotMatch(stylesSource, /\.phase-banner-crest/);
  assert.match(bannerSource, /className="phase-banner-count"/u);
  assert.doesNotMatch(statusSource, /game\.setupRemaining/u);
  assert.match(stylesSource, /\.phase-banner-copy\s*\{[^}]*width:\s*max-content;/su);
  assert.match(stylesSource, /\.phase-banner-copy\s*\{[^}]*padding:\s*0 clamp\(48px, 4\.2vw, 72px\);/su);
  assert.match(stylesSource, /\.phase-banner-count\s*\{[^}]*font-family:\s*"Outfit"[^}]*font-variant-numeric:\s*tabular-nums;/su);
  assert.match(stylesSource, /\.phase-banner-main\s*\{\s*--phase-accent:\s*#9da86a/u);
  assert.match(stylesSource, /\.phase-banner-defend\s*\{\s*--phase-accent:\s*#6fa8cf/u);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.phase-banner[^}]*animation:\s*none !important;/su);
});

test("Preparation actions distinguish continuing from awakening the Host", () => {
  assert.equal(setupPrimaryAction(3), "next");
  assert.equal(setupPrimaryAction(2), "next");
  assert.equal(setupPrimaryAction(1), "awaken");
  assert.equal(setupPrimaryAction(0), undefined);
  assert.equal(setupJustCompleted(1, 0), true);
  assert.equal(setupJustCompleted(2, 1), false);
  assert.equal(setupJustCompleted(0, 0), false);
});

test("Memory, Archive and Life share one row of equal boxes and the Archive owns the draw origin", () => {
  const boardSource = readFileSync(new URL("../src/components/DuelHud.tsx", import.meta.url), "utf8");
  const forecastSource = readFileSync(new URL("../src/components/PlayerArchiveForecast.tsx", import.meta.url), "utf8");
  const handSource = readFileSync(new URL("../src/components/Hand.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(boardSource, /<PlayerArchiveForecast game=\{game\}/u);
  assert.match(forecastSource, /data-player-archive-origin="true"/u);
  assert.match(forecastSource, /data-energy-recycle-target="true"/u);
  assert.match(handSource, /handArchiveEntryOffset/u);
  assert.match(handSource, /querySelector<HTMLElement>\("\[data-player-archive-origin='true'\]"\)/u);
  assert.match(handSource, /<AnimatePresence mode="popLayout">/u);
  assert.match(handSource, /className="hand-card-drag-layer"/u);
  assert.doesNotMatch(handSource, /className="hand-card-slot"[\s\S]{0,180}style=\{\{[^}]*x:\s*dragX/su);

  // Memory and the Archive are the same box; only Life keeps the vitals panel.
  assert.match(boardSource, /className="player-vitals-row"/u);
  assert.match(forecastSource, /"card-pile card-pile-archive"/u);
  assert.doesNotMatch(boardSource, /player-graveyard-host|player-graveyard-button/u);
  assert.match(stylesSource, /\.player-vitals-row\s*\{[^}]*align-items:\s*stretch;/su);
  // Box (75) plus its reserved tab gutter (7) equals the 82px of the Life panel, so the tab can
  // peek over the edge without the row growing: the Host's copy rests on the top screen edge.
  assert.match(stylesSource, /\.card-pile\s*\{[^}]*width:\s*62px;[^}]*min-height:\s*75px;\s*margin-top:\s*7px;/su);
  assert.match(stylesSource, /\.card-pile::before\s*\{[^}]*top:\s*-7px;/su);
  // Hovering Memory lights its border; the box itself never moves.
  assert.doesNotMatch(stylesSource, /\.card-pile-memory:hover,[^}]*\{[^}]*transform:/su);

  // Both sides own the same Memory box: the Chronicler's in the row, the Host's beside its panel.
  assert.equal(boardSource.match(/className="card-pile card-pile-memory"/gu)?.length, 2);
  assert.match(boardSource, /className="card-pile-host host-memory-pile-host"/u);
  assert.match(stylesSource, /\.host-memory-pile-host\s*\{[^}]*right:\s*100%;/su);
  assert.doesNotMatch(boardSource, /host-deck-graveyard/u);
  assert.doesNotMatch(stylesSource, /\.host-deck-graveyard/u);

  // The rotated Life crest only fits while the name floor leaves room for it inside the panel.
  assert.match(stylesSource, /\.game-screen \.player-life-counter\s*\{[^}]*width:\s*180px;/su);
  assert.match(stylesSource, /\.player-life-copy\s*\{[^}]*min-width:\s*5\.5rem;/su);

  // Both boxes name themselves at their base.
  assert.match(boardSource, /className="card-pile-label">\{t\("zones\.memory"\)\}/u);
  assert.match(forecastSource, /className="card-pile-label"[^>]*>\{archiveLabel\}/u);

  // The normal draw is a rule, not permanent UI: the badge only appears when it deviates.
  assert.match(forecastSource, /const extraDraw = forecast\.amount > 1;/u);
  assert.match(forecastSource, /\{extraDraw && \(/u);
  assert.match(forecastSource, /<GameTooltip content=\{emptyHandTooltip\}/u);
  assert.doesNotMatch(forecastSource, /game\.drawReasonEmptyHand["']/u);
});

test("a recyclable Source keeps the broad right-side gesture while lighting up the Archive box", () => {
  const handSource = readFileSync(new URL("../src/components/Hand.tsx", import.meta.url), "utf8");
  const forecastSource = readFileSync(new URL("../src/components/PlayerArchiveForecast.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(handSource, /SourceActionMenu/u);
  assert.match(handSource, /useSourceActionUiStore/u);
  assert.match(handSource, /ENERGY_RECYCLE_SCREEN_RATIO = 0\.82/u);
  assert.match(handSource, /ENERGY_RECYCLE_MIN_HORIZONTAL_DRAG = 48/u);
  assert.match(handSource, /setDraggingRecyclableSourceId\(energyRecyclable \? card\.instanceId : undefined\)/u);
  assert.match(handSource, /<EnergyRecycleDragHint/u);
  assert.match(handSource, /className="energy-recycle-drag-path"/u);
  assert.match(handSource, /className="energy-recycle-target-ring"/u);
  // The drop invitation is the box itself glowing and growing; the dragged card already carries
  // the wording, so the Archive never reopens a panel to repeat it.
  assert.doesNotMatch(forecastSource, /source-return-target-box|source-return-target-button|recycleSelectedSource/u);
  assert.match(stylesSource, /\.card-pile\.is-source-return-target\s*\{[^}]*transform:\s*scale\(1\.06\);/su);
  assert.match(stylesSource, /\.card-pile\.is-recycle-targeted\s*\{[^}]*transform:\s*scale\(1\.12\);/su);
  assert.match(stylesSource, /\.energy-recycle-drag-path\s*\{[^}]*stroke-dasharray:\s*7 8;/su);
});

test("unused blue Source orbs travel into yellow Reserve sockets before reappearing", () => {
  const battlefieldSource = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const animatorSource = readFileSync(new URL("../src/components/ReserveTransferAnimator.tsx", import.meta.url), "utf8");
  const presentationSource = readFileSync(new URL("../src/components/reserveTransferPresentation.ts", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(battlefieldSource, /reserveTransferPresentation\(previous, current\)/u);
  assert.doesNotMatch(battlefieldSource, /"is-pending"/u);
  assert.match(battlefieldSource, /<ReserveTransferAnimator/u);
  assert.match(presentationSource, /previous\.pending - current\.pending/u);
  assert.match(presentationSource, /current\.stored - previous\.stored/u);
    assert.match(animatorSource, /<EnergyFlowTravel/u);
    assert.match(animatorSource, /<EnergyFlowImpact/u);
    assert.match(animatorSource, /reserve-transfer-arrival/u);
    assert.match(animatorSource, /className="mana-alchemy-orb"/u);
    assert.match(animatorSource, /className="mana-alchemy-liquid"/u);
    assert.match(stylesSource, /\.reserve-transfer-arrival-yellow\s*\{/u);
    assert.match(stylesSource, /\.reserve-transfer-arrival\.is-ready \.mana-alchemy-orb\s*\{/u);
    assert.match(stylesSource, /\.mana-alchemy-socket\.is-reserve-transfer-source \.mana-alchemy-orb,[^}]*visibility:\s*hidden;/su);
    assert.match(stylesSource, /\.mana-alchemy-socket-blue\.is-spent \.mana-alchemy-liquid\s*\{[^}]*display:\s*none;/su);
    assert.match(stylesSource, /\.mana-alchemy-socket-blue\.is-spent \.mana-alchemy-orb::after\s*\{[^}]*border-color:\s*transparent;/su);
    assert.match(stylesSource, /\.mana-alchemy-socket-blue\.is-empty \.mana-alchemy-orb\s*\{[^}]*visibility:\s*hidden;/su);
    assert.match(stylesSource, /@keyframes mana-energy-orb-spend-blue[\s\S]*?100%[^}]*saturate\(0\.76\) brightness\(0\.82\)/u);
  });

test("Preparation keeps card-generated Reserve available and delays only unused Sources", () => {
  const battlefieldSource = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const translationsSource = readFileSync(new URL("../src/i18n/translations.ts", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(battlefieldSource, /reserveSetupActive/u);
  assert.match(battlefieldSource, /game\.reserveSetupTooltip/u);
  assert.doesNotMatch(battlefieldSource, /is-setup-latent|is-reserve-latent|LockKeyhole/u);
  assert.doesNotMatch(battlefieldSource, /reserveAvailable|reserveEffectsNow|reserveSourcesAfterHost/u);
  assert.match(translationsSource, /"game\.reserveSetupTooltip": "Energy from unused Sources is stored once Preparation ends\."/u);
  assert.match(battlefieldSource, /className="mana-reserve-tooltip-host"/u);
  assert.doesNotMatch(battlefieldSource, /<Hourglass[^>]*reserve/u);
  assert.doesNotMatch(stylesSource, /\.mana-reserve-setup-tooltip\s*\{/u);
  assert.doesNotMatch(stylesSource, /\.mana-reserve-setup-note\s*\{/u);
  assert.doesNotMatch(stylesSource, /\.mana-energy-track-yellow\.is-setup-latent/u);
});

test("committed hand cards yield to their specialized play animation without snapping home", () => {
  const handSource = readFileSync(new URL("../src/components/Hand.tsx", import.meta.url), "utf8");

  assert.match(handSource, /concealCommittedHandCard\(card\.instanceId\);\s*playFromHand/u);
  assert.match(handSource, /concealCommittedHandCard\(card\.instanceId\);\s*startEnergyRecycle/u);
  assert.match(handSource, /element\.style\.visibility = "hidden"/u);
  assert.doesNotMatch(handSource, /exit:\s*\{[^}]*y:\s*-34/su);
});

test("contextual card Actions use the current battlefield CTA treatment", () => {
  const battlefieldSource = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(battlefieldSource, /aria-label=\{abilityButtonText\(primaryAbility\)\}/u);
  assert.match(battlefieldSource, /effect-action-symbol-tap[\s\S]*?effect-action-mana-colon[\s\S]*?effect-action-mana-label[\s\S]*?effect-action-symbol-energy/u);
  assert.match(stylesSource, /\.effect-action-button\s*\{[^}]*border:\s*1px solid rgb\(178 158 92 \/ 0\.58\);[^}]*linear-gradient\(110deg, #3a4240, #1c2828 66%, #2e3836\);/su);
  assert.match(stylesSource, /\.guided-tutorial-continue\s*\{[^}]*border:\s*1px solid rgb\(178 158 92 \/ 0\.58\);[^}]*linear-gradient\(110deg, #3a4240, #1c2828 66%, #2e3836\);/su);
  assert.match(stylesSource, /\.effect-action-button:hover,[\s\S]*?transform:\s*translateY\(calc\(-50% - 1px\)\);/u);
  assert.doesNotMatch(stylesSource, /\.effect-action-button\s*\{[^}]*clip-path:/su);
});

test("the Host Archive attack preview shows the physical result and caps it to the Archive", () => {
  assert.deepEqual(hostArchiveAttackPreview(42, 7, 3), {
    conversionCount: 2,
    discardCount: 2,
    projectedArchiveCount: 40,
    visibleCardCount: 2,
  });
  assert.deepEqual(hostArchiveAttackPreview(42, 13, 3), {
    conversionCount: 4,
    discardCount: 4,
    projectedArchiveCount: 38,
    visibleCardCount: 3,
  });
  assert.deepEqual(hostArchiveAttackPreview(2, 99, 3), {
    conversionCount: 33,
    discardCount: 2,
    projectedArchiveCount: 0,
    visibleCardCount: 2,
  });
  assert.deepEqual(hostArchiveAttackPreview(42, 2, 3), {
    conversionCount: 0,
    discardCount: 0,
    projectedArchiveCount: 42,
    visibleCardCount: 0,
  });
});

test("the Host attack preview shows cards going to Memory and keeps the math in a tooltip", () => {
  const duelHudSource = readFileSync(new URL("../src/components/DuelHud.tsx", import.meta.url), "utf8");
  const phaseOrbSource = readFileSync(new URL("../src/components/PhaseOrb.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(duelHudSource, /t\("game\.hostArchive"\)/u);
  assert.match(duelHudSource, /className="host-attack-card-loss"/u);
  assert.match(duelHudSource, /t\("game\.attackCalculation"\)/u);
  assert.match(duelHudSource, /\u00f7 \$\{archiveDiscardThreshold\} \u2192/u);
  assert.doesNotMatch(duelHudSource, /host-attack-formula|= -/u);
  assert.match(stylesSource, /\.host-attack-card-loss i\s*\{/u);
  assert.match(stylesSource, /\.host-attack-calculation-tooltip\s*\{/u);
  assert.match(phaseOrbSource, /t\("orb\.chooseAttackers"\)/u);
  assert.match(phaseOrbSource, /t\("orb\.attackArchive"\)/u);
  assert.match(phaseOrbSource, /t\("orb\.passCombat"\)/u);
  assert.equal(translate("es", "orb.chooseAttackers"), "Elegir atacantes");
  assert.equal(translate("es", "orb.attackArchive"), "Atacar el Archivo");
  assert.equal(translate("es", "orb.passCombat"), "Pasar el combate");
});

test("the Host Archive discard drawer counts departures and closes after the last flight without showing zero", () => {
  const duelHudSource = readFileSync(new URL("../src/components/DuelHud.tsx", import.meta.url), "utf8");
  const millAnimatorSource = readFileSync(new URL("../src/components/HostMillAnimator.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.equal(hostArchiveDiscardCounterValue(4, 0, false, false), 4);
  assert.equal(hostArchiveDiscardCounterValue(0, 0, false, false), 0);
  assert.equal(hostArchiveDiscardCounterValue(4, 1, true, true), 3);
  assert.equal(hostArchiveDiscardCounterValue(4, 3, true, false), 1);
  assert.equal(hostArchiveDiscardCounterValue(4, 4, true, true), 1);
  assert.equal(hostArchiveDiscardCounterValue(4, 4, true, false), undefined);
  assert.equal(hostArchiveDiscardCounterValue(0, 0, true, false), undefined);
  assert.equal(hostMillOriginSelector(true), "[data-host-attack-mill-origin='true']");
  assert.equal(hostMillOriginSelector(false), "[data-host-mill-origin='archive']");
  assert.equal(completedHostMillPreviewCount(1, true), 0);
  assert.equal(completedHostMillPreviewCount(1, false), 1);
  assert.equal(completedHostMillPreviewCount(4, true), 3);
  assert.match(duelHudSource, /data-host-attack-mill-origin="true"/u);
  assert.match(duelHudSource, /completedHostMillPreviewCount/u);
  assert.match(millAnimatorSource, /hostMillOriginSelector\(preview\)/u);
  assert.match(stylesSource, /\.host-attack-count-host\s*\{[^}]*right:\s*100%;/su);
  assert.match(stylesSource, /\.host-attack-count\s*\{[^}]*border-right:\s*0;/su);
  assert.match(stylesSource, /\.host-deck-counter-cluster\.is-attack-counter-open \.host-memory-pile-host\s*\{[^}]*translateX\(-108px\)/su);
});

test("Vaelor uses his personal defense animation only when he wins and survives", () => {
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");
  const attacker = customCard("attacker", "host");
  const winningAnimation = resolvePersonalCombatAnimation({
    attacker,
    defender: vaelor,
    attackerDies: true,
    defenderDies: false,
    damageToAttacker: 6,
  });

  assert.deepEqual(winningAnimation, {
    preset: "emerald-fireball",
    sourceId: vaelor.instanceId,
    targetId: attacker.instanceId,
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "emerald",
      scale: 1.8,
      amount: 6,
      sourceMoves: false,
    },
  });
  assert.equal(resolvePersonalCombatAnimation({
    attacker,
    defender: vaelor,
    attackerDies: true,
    defenderDies: true,
    damageToAttacker: 6,
  }), undefined);
  assert.equal(resolvePersonalCombatAnimation({
    attacker,
    defender: vaelor,
    attackerDies: false,
    defenderDies: true,
    damageToAttacker: 6,
  }), undefined);
});

test("the surviving personal combatant owns the animation when Varka attacks Vaelor", () => {
  const varka = cardFromDeck("varka_infernal_matriarch", "host");
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");

  const animation = resolvePersonalCombatAnimation({
    attacker: varka,
    defender: vaelor,
    attackerDies: true,
    defenderDies: false,
    damageToAttacker: 6,
    damageToDefender: 4,
  });

  assert.equal(animation?.preset, "emerald-fireball");
  assert.equal(animation?.sourceId, vaelor.instanceId);
  assert.equal(animation?.targetId, varka.instanceId);
  assert.equal(animation?.effect.amount, 6);

  assert.equal(resolvePersonalCombatAnimation({
    attacker: varka,
    defender: customCard("ordinary-survivor", "player"),
    attackerDies: true,
    defenderDies: false,
    damageToAttacker: 6,
    damageToDefender: 4,
  }), undefined);
});

test("Vaelor's direct Host attack resolves to the shared emerald fireball preset", () => {
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");

  assert.deepEqual(resolvePersonalAttackAnimation(vaelor, 6), {
    preset: "emerald-fireball",
    sourceId: vaelor.instanceId,
    targetKind: "hostLife",
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "emerald",
      scale: 1.8,
      amount: 6,
      sourceMoves: false,
    },
  });
  assert.equal(resolvePersonalAttackAnimation(customCard("ordinary-attacker", "player"), 1), undefined);
});

test("card-sourced damage reuses the selected Echo's registered attack presentation", () => {
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");
  const target = customCard("source-damage-target", "host");

  assert.deepEqual(resolvePersonalTargetedAttackAnimation(vaelor, target, 6), {
    preset: "emerald-fireball",
    sourceId: vaelor.instanceId,
    targetId: target.instanceId,
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "emerald",
      scale: 1.8,
      amount: 6,
      sourceMoves: false,
    },
  });
  assert.equal(
    resolvePersonalTargetedAttackAnimation(customCard("ordinary-source", "player"), target, 2),
    undefined,
  );
});

test("the Hydra's personal attack uses the vampire bite silhouette with a venom palette", () => {
  const hydra = cardFromDeck("hydra_of_the_black_bough", "player");
  const target = customCard("hydra-bite-target", "host");
  const animation = resolvePersonalTargetedAttackAnimation(hydra, target, 1);

  assert.equal(animation?.preset, "venom-bite");
  assert.equal(animation?.effect.type, "bite");
  assert.equal(animation?.effect.variant, "venom");
  assert.equal(animation?.suppressDefaultMotion, false);

  const markup = renderToStaticMarkup(createElement(VampireBite, {
    animationId: "venom-preview",
    variant: "venom",
  }));
  assert.match(markup, /bite-venom/u);
  assert.match(markup, /#b7ff45/iu);
});

test("debuffed stats render a red downward indicator independently of damage", () => {
  const markup = renderToStaticMarkup(createElement(CardStatsBadge, {
    stats: {
      text: "2/3",
      power: 2,
      endurance: 3,
      damaged: false,
      buffed: false,
      debuffed: true,
    },
  }));
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(markup, /is-debuffed/u);
  assert.match(css, /\.card-stat-badge\.is-debuffed::before\s*\{[^}]*content:\s*"\\25BC"\s*!important;/u);
});

test("a repeated Burn volley lands as one aggregate impact and explicit targets keep their own", () => {
  // Descarga repetida contra el mismo objetivo: un solo impacto, en el reloj del último proyectil.
  assert.deepEqual(burnImpactRoutes(3, false, 90), [{ routeIndex: 2, delayMs: 180 }]);
  assert.deepEqual(burnImpactRoutes(2, false, 0), [{ routeIndex: 1, delayMs: 0 }]);
  // Objetivos explícitos: cada ruta conserva su impacto y su número de daño.
  assert.deepEqual(burnImpactRoutes(3, true, 90), [
    { routeIndex: 0, delayMs: 0 },
    { routeIndex: 1, delayMs: 90 },
    { routeIndex: 2, delayMs: 180 },
  ]);
  assert.deepEqual(burnImpactRoutes(0, false, 90), []);
});

test("procedural volleys render every route in bounded shader batches", () => {
  const explicitImpacts = burnImpactRoutes(14, true, 90);
  const explicitBatches = burnRenderBatches(14, explicitImpacts, 6);
  assert.deepEqual(explicitBatches.map((batch) => batch.routeIndexes), [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
    [12, 13],
  ]);
  assert.deepEqual(explicitBatches.map((batch) => batch.impacts.length), [6, 6, 2]);
  assert.deepEqual(explicitBatches[2].impacts, [
    { routeIndex: 0, delayMs: 1080 },
    { routeIndex: 1, delayMs: 1170 },
  ]);

  const aggregateBatches = burnRenderBatches(8, burnImpactRoutes(8, false, 90), 6);
  assert.deepEqual(aggregateBatches[0].impacts, []);
  assert.deepEqual(aggregateBatches[1].impacts, [{ routeIndex: 1, delayMs: 630 }]);
});

test("procedural Burn hides the WebGL buffer until its first rendered frame", () => {
  const animator = readFileSync(new URL("../src/components/BurnAnimator.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const renderIndex = animator.indexOf("renderSharedVfxFrame(canvas");
  const revealIndex = animator.indexOf('canvas.style.opacity = "1"', renderIndex);

  assert.ok(renderIndex >= 0);
  assert.ok(revealIndex > renderIndex);
  assert.match(animator, /if \(drawn && !firstFramePresented\)/u);
  assert.match(animator, /canvas\.style\.opacity = "0";\s*cancelAnimationFrame/u);
  assert.match(styles, /\.burn-canvas\s*\{[^}]*opacity:\s*0;/u);
});

// Migración a un único contexto WebGL: ver docs/plans/webgl_context_budget.md.
const SHARED_RENDERER_ANIMATORS = [
  "BloodSiphonAnimator",
  "BuffSurgeAnimator",
  "BurnAnimator",
  "DestinyRewriteTransition",
  "DrainEssenceAnimator",
  "FinalBanquetAnimator",
  "GrowthBuffAnimator",
  "HeavyCreatureLanding",
];
const OWN_RENDERER_ANIMATORS = [];

test("no animator poisons its canvas with forceContextLoss", () => {
  // forceContextLoss deja el <canvas> inservible para siempre. Con React.StrictMode cada efecto
  // se monta, se limpia y se vuelve a montar sobre el mismo lienzo, así que llamarlo en una
  // limpieza deja el segundo montaje sin contexto y mata todas las animaciones.
  for (const animator of [...SHARED_RENDERER_ANIMATORS, ...OWN_RENDERER_ANIMATORS]) {
    const source = readFileSync(new URL(`../src/components/${animator}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /forceContextLoss/u, `${animator} inutilizaría su lienzo`);
  }
});

test("migrated animators draw through the single shared WebGL context", () => {
  for (const animator of SHARED_RENDERER_ANIMATORS) {
    const source = readFileSync(new URL(`../src/components/${animator}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /new THREE\.WebGLRenderer/u, `${animator} volvió a abrir contexto propio`);
    assert.match(source, /renderSharedVfxFrame/u, `${animator} debe dibujar por el renderer compartido`);
  }
  for (const animator of OWN_RENDERER_ANIMATORS) {
    const source = readFileSync(new URL(`../src/components/${animator}.tsx`, import.meta.url), "utf8");
    assert.match(source, /new THREE\.WebGLRenderer/u, `${animator} ya no abre contexto propio: muévelo a la lista migrada`);
  }
});

test("the shared renderer preserves premultiplied alpha when copying transparent VFX", () => {
  const sharedRenderer = readFileSync(
    new URL("../src/components/sharedVfxRenderer.ts", import.meta.url),
    "utf8",
  );

  assert.match(sharedRenderer, /premultipliedAlpha:\s*true/u);
});

test("the shared VFX surface only grows and its crop reads from the buffer top", () => {
  // La superficie compartida nunca encoge: redimensionar reasigna el búfer.
  assert.deepEqual(grownVfxSurface({ width: 1, height: 1 }, 200, 120), { width: 200, height: 120 });
  assert.deepEqual(grownVfxSurface({ width: 200, height: 120 }, 80, 60), { width: 200, height: 120 });
  assert.deepEqual(grownVfxSurface({ width: 200, height: 120 }, 80, 300), { width: 200, height: 300 });
  assert.deepEqual(grownVfxSurface({ width: 200, height: 120 }, 0.2, 0.2), { width: 200, height: 120 });

  // WebGL dibuja desde abajo y drawImage lee desde arriba: el recorte vive en la franja superior.
  assert.equal(sharedVfxSourceTop(300, 120), 180);
  assert.equal(sharedVfxSourceTop(120, 120), 0);
  assert.equal(sharedVfxSourceTop(100, 120), 0);
});

test("the shared VFX renderer restores global state for every frame", () => {
  const source = readFileSync(
    new URL("../src/components/sharedVfxRenderer.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /active\.setClearColor\(0x000000, 0\)/u);
  assert.match(source, /active\.setPixelRatio\(1\)/u);
  assert.match(source, /outputEncoding: THREE\.TextureEncoding = THREE\.sRGBEncoding/u);
  assert.match(source, /active\.outputEncoding = outputEncoding/u);
  assert.match(source, /frame\.outputEncoding/u);
});

test("the loading pipeline warms the shared renderer and representative VFX programs", () => {
  const preloader = readFileSync(
    new URL("../src/utils/assetPreloader.ts", import.meta.url),
    "utf8",
  );
  const warmup = readFileSync(
    new URL("../src/components/vfxWarmup.ts", import.meta.url),
    "utf8",
  );
  const sharedRenderer = readFileSync(
    new URL("../src/components/sharedVfxRenderer.ts", import.meta.url),
    "utf8",
  );

  assert.match(preloader, /run:\s*prewarmGameVfx/u);
  assert.match(warmup, /BURN_FIREBALL_FRAGMENT_SHADER/u);
  assert.match(warmup, /new THREE\.MeshPhongMaterial/u);
  assert.match(warmup, /new THREE\.SpriteMaterial/u);
  assert.match(warmup, /new THREE\.LineBasicMaterial/u);
  assert.match(sharedRenderer, /active\.compile\(frame\.scene, frame\.camera\)/u);
  assert.match(sharedRenderer, /active\.getContext\(\)\.finish\(\)/u);
});

test("production resume checkpoints exclude Playground and presentation state", () => {
  const service = readFileSync(
    new URL("../src/persistence/resumeService.ts", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(
    new URL("../src/persistence/resumeSave.ts", import.meta.url),
    "utf8",
  );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(service, /playground/iu);
  assert.doesNotMatch(schema, /playground/iu);
  assert.match(schema, /checkpoint:\s*Object\.freeze\(\{ game:/u);
  assert.match(app, /if \(screen !== "game"\) return;/u);
});

test("procedural Burn never mounts the legacy full-screen white flash", () => {
  const procedural = readFileSync(new URL("../src/components/BurnAnimator.tsx", import.meta.url), "utf8");
  const classic = readFileSync(new URL("../src/components/ClassicBurnAnimator.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(procedural, /className="burn-screen-flash"/u);
  assert.match(classic, /className="burn-screen-flash"/u);
});

test("only Vaelor's entry volley keeps the curved procedural route", () => {
  assert.equal(burnPathCurvature(undefined), 0);
  assert.equal(burnPathCurvature("straight"), 0);
  assert.equal(burnPathCurvature("curved"), 1);
});

test("Todos contra uno uses the procedural fireball renderer at scale 1.2", () => {
  const gameStore = readFileSync(new URL("../src/store/useGameStore.ts", import.meta.url), "utf8");

  assert.equal(resolveBurnRenderer("all_against_one"), "procedural");
  assert.equal(resolveCardBurnScale("all_against_one"), 1.2);
  assert.equal(resolveBurnRenderer("varka_infernal_matriarch"), "procedural");
  assert.equal(resolveBurnRenderer(undefined), "procedural");
  assert.match(gameStore, /scale:\s*resolveCardBurnScale\(source\?\.definitionId\)/u);
});

test("the legacy classic volley keeps an independent particle clock for every projectile", () => {
  assert.deepEqual(burnProjectileParticleTimings(3, 90), [
    { projectileIndex: 0, flightStartMs: 220, impactMs: 638 },
    { projectileIndex: 1, flightStartMs: 310, impactMs: 728 },
    { projectileIndex: 2, flightStartMs: 400, impactMs: 818 },
  ]);
});

test("each Burn material is only a colour ramp and a density", () => {
  const emerald = burnMaterialColors("emerald");
  // Vaelor ya no depende de rotar el tono del mundo: su rampa es verde por derecho propio.
  assert.ok(emerald.mid[1] > emerald.mid[0] && emerald.mid[1] > emerald.mid[2]);
  // La brea de Nerezh tapa el fondo; las llamas suman luz.
  assert.ok(burnMaterialColors("oil").ink > 0.8);
  for (const variant of ["fire", "emerald", "golden"]) {
    assert.ok(burnMaterialColors(variant).ink < 0.2);
  }
  assert.deepEqual(burnMaterialColors(undefined), burnMaterialColors("fire"));
});

test("Varka's split projectile origin follows the left and right card edges", () => {
  assert.deepEqual(burnProjectileOriginRatios(2, "split-horizontal"), [
    { x: 0.08, y: 0.52 },
    { x: 0.92, y: 0.52 },
  ]);
  assert.deepEqual(burnProjectileOriginRatios(2), [
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
  ]);
});

test("every Burn sourced by Varka resolves to her golden material and personal scale", () => {
  assert.equal(resolveCardBurnMaterial("varka_infernal_matriarch"), "golden");
  assert.equal(resolveCardBurnMaterial("varka_infernal_matriarch", "oil"), "golden");
  assert.equal(resolveCardBurnMaterial("ordinary_burn_source", "oil"), "oil");
  assert.equal(resolveCardBurnScale("varka_infernal_matriarch"), 1.3);
  assert.equal(resolveCardBurnScale("ordinary_burn_source"), 1);
});

test("Varka casts two smaller infernal fireballs at defenders and the Chronicler life panel", () => {
  const varka = cardFromDeck("varka_infernal_matriarch", "host");
  const defender = customCard("varka-defender", "player");

  assert.deepEqual(resolvePersonalCombatAnimation({
    attacker: varka,
    defender,
    attackerDies: false,
    defenderDies: false,
    damageToDefender: 4,
  }), {
    preset: "infernal-fireball",
    sourceId: varka.instanceId,
    targetId: defender.instanceId,
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "golden",
      scale: 1.3,
      amount: 4,
      sourceMoves: false,
      projectileCount: 2,
      projectileOrigin: "split-horizontal",
      projectileGapMs: 0,
    },
  });

  const direct = resolvePersonalAttackAnimation(varka, 4, "playerLife");
  assert.deepEqual(direct, {
    preset: "infernal-fireball",
    sourceId: varka.instanceId,
    targetKind: "playerLife",
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "golden",
      scale: 1.3,
      amount: 4,
      sourceMoves: false,
      projectileCount: 2,
      projectileOrigin: "split-horizontal",
      projectileGapMs: 0,
    },
  });
  assert.equal(hostAttackPlayerHitDelay(direct), 638);
  assert.equal(hostAttackPlayerHitDelay(undefined), 0);
});

test("the Host panel reacts when a personal attack impacts, not when it starts", () => {
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");
  const customAnimation = resolvePersonalAttackAnimation(vaelor, 6);

  assert.equal(playerAttackHostHitDelay(customAnimation), 638);
  assert.equal(playerAttackHostHitDelay(undefined), 0);
});

test("defense arrows disappear as soon as either combat endpoint leaves the field", () => {
  const game = createTestGame();
  const attacker = addCard(game, customCard("attacker", "host"));
  const blocker = addCard(game, customCard("blocker", "player"));
  game.combat.hostAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };

  assert.deepEqual(activeDefenseArrowLinks(game), [{
    attackerId: attacker.instanceId,
    blockerId: blocker.instanceId,
  }]);

  game.player.field = [];
  assert.deepEqual(activeDefenseArrowLinks(game), []);

  game.player.field = [blocker];
  game.host.field = [];
  assert.deepEqual(activeDefenseArrowLinks(game), []);
});

test("hidden defense links disappear from every combat presentation while assignments remain", () => {
  const game = createTestGame();
  const attacker = addCard(game, customCard("hidden-link-attacker", "host"));
  const blocker = addCard(game, customCard("hidden-link-blocker", "player"));
  const linkId = `${attacker.instanceId}-${blocker.instanceId}`;
  game.combat.hostAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };

  assert.deepEqual(visibleDefenseArrowLinks(game, new Set([linkId])), []);
  assert.deepEqual(game.combat.blockers, { [attacker.instanceId]: [blocker.instanceId] });
});

test("Memory presents the most recently moved card first without mutating game state", () => {
  const oldest = { instanceId: "oldest" };
  const middle = { instanceId: "middle" };
  const newest = { instanceId: "newest" };
  const memory = [oldest, middle, newest];

  assert.deepEqual(memoryCardsNewestFirst(memory), [newest, middle, oldest]);
  assert.equal(newestMemoryCard(memory), newest);
  assert.deepEqual(memory, [oldest, middle, newest]);
});

test("only the front card in a visual stack owns the shared trait badges", () => {
  assert.equal(isFrontOfCardStack(0, 1), true);
  assert.equal(isFrontOfCardStack(0, 3), false);
  assert.equal(isFrontOfCardStack(1, 3), false);
  assert.equal(isFrontOfCardStack(2, 3), true);
});

test("shared trait badges render icons and preserve Poison amounts", () => {
  const flying = renderToStaticMarkup(createElement(CardTraitIcon, { keyword: "FLYING" }));
  const poison = renderToStaticMarkup(createElement(CardTraitIcon, { keyword: "POISON {3}", showAmount: true }));

  assert.match(flying, /<svg/);
  assert.match(poison, /<svg/);
  assert.match(poison, /<small[^>]*>3<\/small>/);
});

test("battlefield trait tooltips preserve faction color and natural capitalization", () => {
  const badge = renderToStaticMarkup(createElement(CardTraitTooltipBadge, {
    keyword: "LETHAL",
    label: "Toque letal",
    toneClass: "card-keyword-badge-zombie",
  }));

  assert.match(badge, /card-keyword-badge-zombie/);
  assert.doesNotMatch(badge, /keyword-pill/);
  assert.match(badge, />Toque letal<\/strong>/);
});

test("deck viewer traits reuse the in-game faction badges", () => {
  const badges = renderToStaticMarkup(createElement(TraitPills, {
    traits: "LETHAL, FLYING",
    cardTheme: "zombie",
  }));

  assert.match(badges, /card-keyword-badge-zombie/);
  assert.equal((badges.match(/<svg/g) ?? []).length, 2);
});

test("card previews reuse the current printed stats plaque", () => {
  const stats = renderToStaticMarkup(createElement(PreviewStatsBadge, {
    stats: "4/6",
    cardTheme: "goblin",
  }));
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(stats, /card-preview-stats card-theme-goblin/);
  assert.match(stats, /card-preview-stat-value[^>]*>4<\/span>/);
  assert.match(stats, /card-preview-stat-separator[^>]*>\/<\/span>/);
  assert.match(stats, /card-preview-stat-value[^>]*>6<\/span>/);
  assert.doesNotMatch(stats, /<svg/);
  assert.match(styles, /\.card-preview-stats\s*\{[^}]*min-width:\s*54px;[^}]*height:\s*31px;/u);
  assert.match(styles, /\.deck-viewer-trait-list \.card-keyword-badge,[\s\S]*?height:\s*31px;/u);
});

test("deck collections do not clip a raised key card or its glow", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.decks-content-single\s*\{[^}]*overflow:\s*visible;/u);
  assert.match(
    styles,
    /\.decks-panel\s*\{[^}]*--deck-key-card-width:\s*clamp\(140px, min\(15vw, calc\(\(100vh - 290px\) \/ 1\.9\)\), 220px\);/u,
  );
});

test("main menu reserves enough width and breathing room for the Hostfall title", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /--main-menu-panel-width:\s*clamp\(380px, 34vw, 590px\)/u);
  assert.match(styles, /\.main-menu-title\s*\{[^}]*margin:\s*16px 0 0;/u);
});

test("the Hostfall wordmark and Chronicler name use the bundled decorative face", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /@font-face\s*\{[^}]*font-family:\s*"Cinzel Decorative";[^}]*font-weight:\s*400;[^}]*cinzel-decorative-latin\.woff2/u,
  );
  assert.match(styles, /\.hostfall-wordmark\s*\{[^}]*font-family:\s*"Cinzel Decorative"[^}]*font-weight:\s*400;/u);
  assert.match(styles, /\.main-menu-chronicler-name\s*\{[^}]*font-family:\s*"Cinzel Decorative"[^}]*font-weight:\s*400;/u);
});

test("deck setup panels and deck cards opt into shared click audio", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const decksView = readFileSync(new URL("../src/components/DecksView.tsx", import.meta.url), "utf8");

  assert.match(startMenu, /<article\s+data-audio-click="valid"\s+className=\{`expedition-combatant/u);
  assert.match(decksView, /<button\s+data-audio-click="off"\s+className=\{`deck-key-card/u);
  assert.match(decksView, /onClick=\{\(\) => \{\s*playSfx\("click"\);\s*onOpen\(\);/u);
});

test("How to Play opens a right-side catalog and keeps Basic Tutorial content-gated", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(startMenu, /type MenuScreen = [^;]*"howToPlay"/u);
  assert.match(startMenu, /setMenuScreen\("howToPlay"\)/u);
  assert.match(startMenu, /main-settings-screen how-to-play-screen/u);
  assert.match(startMenu, /howToPlay\.basicTutorial/u);
  assert.match(startMenu, /disabled=\{!onOpenBasicTutorial\}/u);
  assert.match(styles, /\.how-to-play-lesson\s*\{[^}]*grid-template-columns:/u);
});

test("deck detail close buttons inherit their deck palette", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.deck-collection-modal-close\s*\{[^}]*var\(--deck-accent,[^}]*var\(--deck-accent-bright,[^}]*var\(--deck-accent-soft,/u);
});

test("cards behind the front of a stack use the left combat-arrow anchor", () => {
  const back = { id: "back" };
  const middle = { id: "middle" };
  const front = { id: "front" };
  const slots = [back, middle, front];

  assert.equal(isBehindInStackOrder(back, slots), true);
  assert.equal(isBehindInStackOrder(middle, slots), true);
  assert.equal(isBehindInStackOrder(front, slots), false);
  assert.equal(isBehindInStackOrder(front, [front]), false);
});

test("card names and type lines use initial capitals on every word", () => {
  assert.equal(
    cardLabelCamelCase("tributo de los cuatro pesares", "es"),
    "Tributo De Los Cuatro Pesares",
  );
  assert.equal(
    cardLabelCamelCase("eco de crónica — elfo druida", "es"),
    "Eco De Crónica — Elfo Druida",
  );
});

test("the Elarion branch buff climbs the card border instead of crossing the art", () => {
  /* `.growth-three-effect` insets the canvas -34% top, -27% each side and -24% bottom, so a
     1000x1000 card sits at x 270..1270 and y 240..1240 inside a 1540x1580 canvas. */
  const width = 1540;
  const height = 1580;
  const inner = { left: 270 + 90, right: 1270 - 90, bottom: 240 + 90, top: 1240 - 90 };

  const specs = frameRootPathSpecs(width, height, { duration: 1.08, rootCount: 12 });
  assert.equal(specs.length, 8);
  assert.deepEqual(specs.slice(0, 2).map((spec) => spec.leafSide), [1, -1]);

  for (const [index, spec] of specs.entries()) {
    const curve = new THREE.CatmullRomCurve3(spec.points, false, "centripetal", 0.36);
    for (let step = 0; step <= 60; step += 1) {
      const point = curve.getPoint(step / 60);
      const overArt =
        point.x > inner.left &&
        point.x < inner.right &&
        point.y > inner.bottom &&
        point.y < inner.top;
      assert.equal(
        overArt,
        false,
        `strand ${index} covers the portrait at ${point.x.toFixed(0)},${point.y.toFixed(0)}`,
      );
    }
  }
});

test("frame foliage alternates both rails and only every fourth leaf sits on a tendril", () => {
  const chosen = Array.from({ length: 12 }, (_, index) => frameLeafRootIndex(index, 8));

  assert.deepEqual(chosen, [0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 4]);
  assert.equal(chosen.filter((index) => index < 2).length, 9);
  assert.equal(frameLeafRootIndex(3, 2), 1);
  assert.equal(frameLeafRootIndex(7, 5), 2 + 1);
});

test("Kaelor's strike keeps every bolt in the same golden tone", () => {
  const strike = stormBoltTones(12, "kaelor-a", 7);

  assert.equal(strike.length, 7);
  assert.deepEqual(stormBoltTones(12, "kaelor-a", 7), strike);
  assert.deepEqual(strike, Array(7).fill("yellow"));
  assert.deepEqual(stormBoltTones(99, "kaelor-b", 2), ["yellow", "yellow"]);
});

test("Kaelor's sky bolts converge on the upper-left marked point without base or rain", () => {
  /* Cropped Echo row and tall slot: the strike is authored in measured pixels, so both keep the
     same proportions instead of being stretched by a fixed viewBox. */
  const slots = [
    { left: 106, top: 58, width: 172, height: 153 },
    { left: 93, top: 79, width: 150, height: 209 },
  ];

  for (const card of slots) {
    const storm = buildStorm(9, "kaelor-slot", card);
    const markedX = card.left + card.width * 0.135;
    const markedY = card.top + card.height * 0.2;

    assert.equal(storm.bolts.length, 2);
    assert.equal(storm.bolts.filter((bolt) => bolt.primary).length, 1);
    assert.deepEqual(storm.bolts.map((bolt) => bolt.tone), ["yellow", "yellow"]);
    assert.equal(storm.impact.x, markedX);
    assert.equal(storm.impact.y, markedY);
    assert.equal("ground" in storm, false);
    assert.equal("flecks" in storm, false);
  }
});

test("the rewrite suction pulls every piece to the vortex and lands them at the same instant", () => {
  const viewport = { width: 1600, height: 900 };
  const middle = shardSuction({ left: 780, top: 430, width: 40, height: 40 }, viewport);
  const corner = shardSuction({ left: 0, top: 0, width: 40, height: 40 }, viewport);

  // La pieza del centro ya está en el horizonte: no viaja y no espera.
  assert.equal(Math.round(middle.dx), 0);
  assert.equal(Math.round(middle.dy), 0);
  assert.equal(middle.reach, 0);
  // La esquina viaja hacia adentro y hacia abajo, y es la última en ser alcanzada.
  assert.ok(corner.dx > 0 && corner.dy > 0);
  assert.ok(corner.reach > 0.95 && corner.reach <= 1);
  // El desvío es perpendicular al tirón: la pieza entra curvándose, no en línea recta.
  assert.equal(Math.round(corner.dx * corner.swirlX + corner.dy * corner.swirlY), 0);

  const first = shardTiming(middle.reach, 980);
  const last = shardTiming(corner.reach, 980);
  assert.equal(first.delayMs, 0);
  assert.ok(last.delayMs > first.delayMs);
  assert.equal(first.delayMs + first.durationMs, 980);
  assert.equal(last.delayMs + last.durationMs, 980);
});

test("the rewrite suction resists once and then accelerates without ever stalling", () => {
  // Un tramo que termina lanzado seguido de otro que arranca parado se ve como un frenazo a mitad
  // de la caída. La trayectoria tiene que salir de una sola función continua.
  const suction = shardSuction({ left: 0, top: 0, width: 40, height: 40 }, { width: 1600, height: 900 });
  const path = shardPath(suction);

  assert.equal(path[0].offset, 0);
  assert.equal(path[0].progress, 0);
  assert.equal(path[path.length - 1].offset, 1);
  assert.equal(path[path.length - 1].progress, 1);

  // Primero se resiste: hay un tramo que retrocede antes del tirón.
  assert.ok(path.some((step) => step.progress < 0));

  // Y a partir de ahí no vuelve a frenar nunca: cada paso avanza más que el anterior.
  for (let index = 1; index < path.length - 1; index++) {
    const previous = path[index].progress - path[index - 1].progress;
    const next = path[index + 1].progress - path[index].progress;
    assert.ok(next >= previous - 1e-9, `la succión frena en el paso ${index}`);
  }

  // La pieza se estira hacia el horizonte y termina convertida en un hilo que ya no se ve.
  const landing = path[path.length - 1];
  assert.ok(landing.along > landing.across * 5);
  assert.equal(landing.opacity, 0);
  assert.equal(path[0].along, 1);
  assert.equal(path[0].across, 1);
});

test("defeat glass tiles the viewport deterministically and leaves broken edge shards behind", () => {
  const plan = buildDefeatShatterPlan(16 / 9, 0.314159);
  const repeated = buildDefeatShatterPlan(16 / 9, 0.314159);
  const anotherFuture = buildDefeatShatterPlan(16 / 9, 0.731);

  assert.deepEqual(plan, repeated);
  assert.notDeepEqual(plan.positions, anotherFuture.positions);

  // Cada triángulo es un prisma: 3 cara frontal + 3 trasera + 18 de los tres muros.
  const VERTICES_PER_SHARD = 24;
  assert.equal(plan.vertexCount % VERTICES_PER_SHARD, 0);
  const shardCount = plan.vertexCount / VERTICES_PER_SHARD;
  // 20 puntos de borde: 20 triángulos en el abanico central y 2 por celda en las
  // tres coronas restantes.
  assert.equal(shardCount, 140);

  // Todos los atributos describen los mismos vértices.
  assert.equal(plan.centroids.length, plan.vertexCount * 3);
  assert.equal(plan.uvs.length, plan.vertexCount * 2);
  assert.equal(plan.motions.length, plan.vertexCount * 4);
  assert.equal(plan.dynamics.length, plan.vertexCount * 3);
  assert.equal(plan.infos.length, plan.vertexCount * 4);

  // Las tres clases de cara existen: frontal, trasera y muro.
  const kinds = new Set();
  for (let i = 1; i < plan.infos.length; i += 4) kinds.add(plan.infos[i]);
  assert.deepEqual([...kinds].sort(), [0, 1, 2]);

  // Quedan restos y se va la mayoría, y los que se quedan viajan menos.
  const retained = [];
  const escaped = [];
  for (let shard = 0; shard < shardCount; shard += 1) {
    const vertex = shard * VERTICES_PER_SHARD;
    const speed = Math.hypot(plan.motions[vertex * 4], plan.motions[vertex * 4 + 1]);
    (plan.infos[vertex * 4 + 2] > 0.5 ? retained : escaped).push(speed);
  }
  assert.ok(retained.length > 0);
  assert.ok(escaped.length > retained.length);
  assert.ok(Math.max(...retained) < Math.min(...escaped));
});

test("the defeat shatter reuses the shared WebGL renderer and provides reduced-motion glass", () => {
  const animator = readFileSync(new URL("../src/components/DefeatShatterAnimator.tsx", import.meta.url), "utf8");
  const glassShader = readFileSync(new URL("../src/components/defeatGlassShader.ts", import.meta.url), "utf8");
  const desktopBridge = readFileSync(new URL("../src/platform/desktopBridge.ts", import.meta.url), "utf8");
  const preload = readFileSync(new URL("../electron/preload.ts", import.meta.url), "utf8");
  const electronMain = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/components/DefeatModal.tsx", import.meta.url), "utf8");
  const backdrop = readFileSync(new URL("../src/components/TemporalBackdrop.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(animator, /renderSharedVfxFrame/u);
  assert.match(animator, /await import\("html-to-image"\)/u);
  // Se fotografía `body`: la Reserva y los tooltips cuelgan de ahí por portal y sólo con el
  // tablero desaparecerían al montarse la placa.
  assert.match(animator, /toCanvas\(document\.body, \{/u);
  assert.match(animator, /new THREE\.CanvasTexture\(snapshot\)/u);
  assert.match(animator, /captureDesktopViewport\(\)/u);
  assert.match(animator, /snapshotHasVisualDetail/u);
  assert.match(animator, /function settleBefore<T>/u);
  assert.match(animator, /captureBattlefield\(width, height, root\),\s*PLATE_DEADLINE_MS,/u);
  // La secuencia arranca con la Vida a 0: la captura corre por debajo y la placa releva a la
  // pantalla viva cuando está lista, nunca al revés.
  assert.match(animator, /const startedAt = performance\.now\(\);\s*onSequenceStart\(\);/u);
  assert.match(animator, /const PLATE_DEADLINE_MS = BURST_MS - 80/u);
  assert.match(animator, /if \(!snapshot\) \{[\s\S]*?setFallback\(true\)[\s\S]*?return;/u);
  assert.doesNotMatch(animator, /new THREE\.DataTexture/u);
  assert.match(animator, /createDefeatGlassMaterial/u);
  // Una sola malla con atributos por trozo: ni una geometría por fragmento ni luces
  // de escena. El brillo depende de la orientación real, no de un Phong iluminado.
  assert.match(animator, /new THREE\.BufferAttribute\(plan\.motions, 4\)/u);
  assert.match(animator, /new THREE\.BufferAttribute\(plan\.dynamics, 3\)/u);
  assert.doesNotMatch(animator, /ExtrudeGeometry|MeshPhongMaterial|PointLight|DirectionalLight/u);
  assert.match(animator, /const BURST_MS = SHOCK_AT_MS/u);
  assert.match(animator, /material\.uniforms\.uShock\.value/u);
  // Prismas con espesor, Fresnel y canto biselado.
  assert.match(glassShader, /float expand = clamp\(max\(wave \* 0\.25, flying\)/u);
  assert.match(glassShader, /float fresnel = pow\(1\.0 - ndv, 3\.0\)/u);
  assert.match(glassShader, /N \*= sign\(dot\(N, V\)/u);
  assert.match(glassShader, /if \(vKind > 1\.5\)/u);
  assert.match(desktopBridge, /captureViewport\(\): Promise<string \| undefined>/u);
  assert.match(desktopBridge, /typeof captureViewport === "function"/u);
  assert.match(preload, /hostfall:capture-viewport/u);
  assert.match(electronMain, /event\.sender\.capturePage\(\)/u);
  assert.doesNotMatch(animator, /new THREE\.WebGLRenderer|forceContextLoss/u);
  assert.match(animator, /prefers-reduced-motion:\s*reduce/u);
  assert.match(modal, /<DefeatShatterAnimator seed=\{game\.seed\} onSequenceStart=\{startSequence\}/u);
  assert.match(modal, /reducedMotion \? 60 : REVEAL_AT_MS/u);
  assert.match(modal, /const REVEAL_AT_MS = 2900/u);
  assert.match(modal, /t\("destiny\.futureLostLineOne"\)/u);
  assert.match(modal, /t\("destiny\.futureLostLineTwo"\)/u);
  // Detrás del vidrio no se dibuja ningún fondo propio: el lienzo queda transparente y lo
  // que asoma es el espacio permanente del juego, con el tablero vivo ya retirado.
  assert.doesNotMatch(animator, /Abyss/u);
  assert.doesNotMatch(glassShader, /Abyss|ABYSS/u);
  assert.match(animator, /const PLATED_BODY_CLASS = "is-defeat-plated"/u);
  assert.match(styles, /body\.is-defeat-plated \.game-screen > \*:not\(\.temporal-backdrop\):not\(\.game-result-overlay\)/u);
  assert.match(styles, /body\.is-defeat-plated[\s\S]*?\.temporal-backdrop-grid \{ visibility: hidden; \}/u);
  // La captura web llega sin cielo porque `html-to-image` no fotografía WebGL: se compone
  // sobre el lienzo vivo para que el cosmos no desaparezca al montarse la placa.
  assert.match(animator, /captureTemporalSky/u);
  assert.match(backdrop, /export function captureTemporalSky/u);
  assert.doesNotMatch(animator, /backgroundColor: "#07100f"/u);
  // En lineal: la conversión sRGB del renderer compartido aclara la captura y el Fresnel
  // deja de leerse frío.
  assert.match(animator, /outputEncoding: THREE\.LinearEncoding/u);
  // El desenlace tiene que ganarle a `.game-screen [role="dialog"]`, que impone
  // `game-surface-in` y borra el centrado con su transform final.
  assert.match(styles, /\.game-result-defeat \.defeat-outcome \{[\s\S]*?transform: translate\(-50%, -50%\);[\s\S]*?animation: defeat-outcome-in/u);
  // Las magnitudes del cuarteado se dieron sobre un plano de alto 1: escalar sin
  // reajustarlas convierte la tensión en un salto visible.
  assert.match(glassShader, /dir \* wave \* 0\.004 \* uScale/u);
  // Sin rastro del montaje anterior: ni destello DOM, ni oscurecimiento propio, ni
  // temblor de pantalla. El golpe lo cuenta la onda WebGL.
  assert.doesNotMatch(animator, /defeat-shatter-impact/u);
  assert.doesNotMatch(styles, /defeat-screen-tremor|defeat-result-darkness|defeat-shatter-impact/u);
  assert.match(styles, /animation:\s*defeat-crack-grow 520ms 620ms/u);
  assert.match(styles, /animation:\s*defeat-cracks-away 280ms 1560ms/u);
  assert.match(styles, /animation:\s*defeat-vignette-close 700ms 1560ms/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.defeat-shatter-canvas \{ display:\s*none; \}/u);
});

test("developer tools keep their development imports without a release URL escape hatch", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const gateSource = readFileSync(new URL("../src/utils/devMode.ts", import.meta.url), "utf8");

  assert.match(appSource, /const PlaygroundScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/playground\/PlaygroundScreen"\)/);
  assert.match(appSource, /const AudioLabScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/audio-lab\/AudioLabScreen"\)/);
  assert.match(gateSource, /export const IS_DEV: boolean = import\.meta\.env\.DEV/);
  assert.doesNotMatch(`${appSource}\n${gateSource}`, /\?playground/);
});
