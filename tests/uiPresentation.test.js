import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";

import { activeDefenseArrowLinks, consumedDefenseArrowLinkIds, isBehindInStackOrder, isFrontOfCardStack, visibleDefenseArrowLinks } from "../src/components/battlefieldLayout";
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
import { boundedVfxPixelRatio, grownVfxSurface, sharedVfxSourceTop } from "../src/components/sharedVfxRenderer";
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
import {
  CANON_SEED_COMPACT_LENGTH,
  CANON_SEED_FORMATTED_LENGTH,
  canonSeedCharacterCount,
  formatCanonSeedDraft,
  formattedCanonSeedCaret,
  removeCanonSeedCharacter,
} from "../src/components/playThresholdSeedInput";
import { setupJustCompleted, setupPrimaryAction, setupProgress } from "../src/components/setupPresentation";
import { tooltipCenterWithinViewport } from "../src/components/tooltipGeometry";
import { CardStatsBadge, CardTraitTooltipBadge } from "../src/components/Card";
import { CardTraitIcon } from "../src/components/CardTraitIcon";
import { StabilizingEffect, stabilizingWaveStyles } from "../src/components/StabilizingEffect";
import { PreviewStatsBadge, TraitPills } from "../src/components/CardPreview";
import { VampireBite } from "../src/components/VampireBite";
import { cardLabelCamelCase } from "../src/i18n/cardLocalization";
import { translate } from "../src/i18n/translations";
import { UI_REFERENCE_CATALOG } from "../src/ui-reference/uiReferenceCatalog";
import {
  resolveCardBurnMaterial,
  resolveCardBurnScale,
  resolvePersonalAttackAnimation,
  resolvePersonalCombatAnimation,
  resolvePersonalTargetedAttackAnimation,
} from "../src/store/combatAnimation";
import { burnPathCurvature, resolveBurnRenderer } from "../src/store/burnAnimation";
import {
  completedStabilizationCards,
  stabilizationCompletionDelayMs,
  stabilizationCompletionTotalMs,
} from "../src/store/stabilizationPresentation";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("inscribed Future entry groups, caps, pastes, and deletes Canon Seed characters", () => {
  assert.equal(CANON_SEED_COMPACT_LENGTH, 15);
  assert.equal(CANON_SEED_FORMATTED_LENGTH, 19);
  assert.equal(formatCanonSeedDraft("123232232"), "123-232-232");
  assert.equal(formatCanonSeedDraft("hf1elagrvxx1xxx"), "HF1-ELA-GRV-XX1-XXX");
  assert.equal(formatCanonSeedDraft("hf1-ela-grv-xx1-xxx"), "HF1-ELA-GRV-XX1-XXX");
  assert.equal(formatCanonSeedDraft("HF1-ELA-GRV-XX1-XXX-TOO-LONG"), "HF1-ELA-GRV-XX1-XXX");
  assert.equal(canonSeedCharacterCount("HF1-ELA"), 6);
  assert.equal(formattedCanonSeedCaret(4), 5);
  assert.equal(formattedCanonSeedCaret(15), 19);
  assert.equal(removeCanonSeedCharacter("123-232-232", 2), "122-322-32");
});

test("compact command-bar tooltips stay centered on their own control", () => {
  assert.equal(
    tooltipCenterWithinViewport(1772, 112, 1920),
    1772,
    "a short tooltip with enough room should not inherit the maximum tooltip width",
  );
  assert.equal(tooltipCenterWithinViewport(1890, 112, 1920), 1852);
  assert.equal(tooltipCenterWithinViewport(36, 336, 1920), 180);

  const tooltipSource = readFileSync(new URL("../src/components/GameTooltip.tsx", import.meta.url), "utf8");
  assert.match(tooltipSource, /tooltipRef\.current\?\.getBoundingClientRect\(\)\.width/u);
  assert.match(tooltipSource, /ref=\{tooltipRef\}/u);
});

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

test("Preparation HUD keeps its numerals aligned with the interface font", () => {
  const hudSource = readFileSync(new URL("../src/components/TurnPhaseHud.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(hudSource, /className="game-setup-progress-numbers"[^>]*>\{setup\.current\}\/\{setup\.total\}<\/span>/u);
  assert.match(
    stylesSource,
    /\.game-setup-progress-numbers\s*\{[^}]*font-family:\s*var\(--hf-ui-font-body\);[^}]*font-variant-numeric:\s*tabular-nums;/su,
  );
});

test("the degree dial localizes West without changing the other cardinal initials", () => {
  const backdropSource = readFileSync(new URL("../src/components/TemporalBackdrop.tsx", import.meta.url), "utf8");

  assert.equal(translate("es", "destiny.cardinalWest"), "O");
  assert.equal(translate("en", "destiny.cardinalWest"), "W");
  assert.match(backdropSource, /t\("destiny\.cardinalWest"\)/u);
});

test("a Stabilizing attack attempt explains the attack restriction in modal and toast copy", () => {
  const storeSource = readFileSync(new URL("../src/store/useGameStore.ts", import.meta.url), "utf8");
  const conceptsSource = readFileSync(new URL("../src/guidance/contextualProductConcepts.ts", import.meta.url), "utf8");

  assert.equal(translate("es", "guided.contextual.product.stabilizingTitle"), "Este Eco todavía no puede atacar");
  assert.equal(
    translate("es", "guided.contextual.product.stabilizingBody"),
    "Fue Invocado este turno y sigue Estabilizándose. Podrá atacar en tu próximo turno.",
  );
  assert.equal(translate("es", "toast.attackUnavailable"), "Todavía no puede atacar");
  assert.equal(
    translate("es", "toast.stabilizingAttack", { card: "Liora" }),
    "Liora sigue Estabilizándose. Podrá atacar en tu próximo turno.",
  );
  assert.match(conceptsSource, /glossaryTerms:\s*\["stabilizing"\]/u);
  assert.match(storeSource, /"toast\.stabilizingAttack"/u);
  assert.match(storeSource, /"toast\.attackUnavailable"/u);
});

test("the Host Archive HUD fades into its centered fixed position without a transformed ancestor", () => {
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const hostEntrance = stylesSource.match(/\.game-screen\.is-overture-settling \.game-hud-host\s*\{[^}]*\}/su)?.[0] ?? "";
  const hostKeyframes = stylesSource.match(/@keyframes encounter-board-ui-top-fade\s*\{[^}]*\}\s*[^}]*\}/su)?.[0] ?? "";

  assert.match(hostEntrance, /animation:\s*encounter-board-ui-top-fade/u);
  assert.doesNotMatch(hostEntrance, /encounter-board-ui-top(?:\s|;)/u);
  assert.match(hostKeyframes, /opacity:\s*0/u);
  assert.doesNotMatch(hostKeyframes, /transform:/u);
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
  const dropTargetSource = readFileSync(new URL("../src/components/energyRecycleDropTarget.ts", import.meta.url), "utf8");
  const forecastSource = readFileSync(new URL("../src/components/PlayerArchiveForecast.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(handSource, /SourceActionMenu/u);
  assert.match(handSource, /useSourceActionUiStore/u);
  assert.match(handSource, /energyRecycleDropZoneContains/u);
  assert.match(handSource, /ENERGY_RECYCLE_MIN_HORIZONTAL_DRAG = 48/u);
  assert.match(dropTargetSource, /target\.top - 96/u);
  assert.match(dropTargetSource, /bottom \+ 120/u);
  assert.match(dropTargetSource, /viewport\.width \* 0\.78/u);
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
  assert.match(phaseOrbSource, /PHASE_BLOCKING_CONTEXTUAL_CONCEPTS/u);
  for (const conceptId of ["assign-defenders", "chronicler-life", "host-surge", "attack-exhausts-echo"]) {
    assert.match(phaseOrbSource, new RegExp(`"${conceptId}"`, "u"));
  }
  assert.match(phaseOrbSource, /contextualTutorialBlocksPhase/u);
  assert.match(phaseOrbSource, /\.\.\.contextualTutorial\.queue/u);
  assert.match(phaseOrbSource, /learnToPlayDefenseLeadIn/u);
  assert.match(phaseOrbSource, /learnToPlayOpeningEndLeadIn/u);
  assert.match(phaseOrbSource, /learnToPlay\.stage === "defense-intro"/u);
  assert.match(phaseOrbSource, /learnToPlayRenewalLeadIn/u);
  assert.match(phaseOrbSource, /guidedSpotlightPending/u);
  assert.equal(translate("en", "orb.chooseAttackers"), "Battle Phase");
  assert.equal(translate("en", "orb.attackArchive"), "Attack");
  assert.equal(translate("en", "orb.passCombat"), "No Attack");
  assert.equal(translate("es", "orb.chooseAttackers"), "Fase de batalla");
  assert.equal(translate("es", "orb.attackArchive"), "Atacar");
  assert.equal(translate("es", "orb.passCombat"), "No atacar");
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

test("Stabilizing uses synchronized CSS motes, charges and wave-only lattice", () => {
  const first = stabilizingWaveStyles("echo-alpha");
  assert.equal(first.length, 5);
  assert.deepEqual(first, stabilizingWaveStyles("echo-alpha"));
  assert.notDeepEqual(first, stabilizingWaveStyles("echo-beta"));

  for (const style of first) {
    const duration = Number.parseFloat(style["--stabilizing-duration"]);
    const glintDuration = Number.parseFloat(style["--stabilizing-glint-duration"]);
    const interval = Number.parseFloat(style["--stabilizing-interval"]);
    const sweepDuration = Number.parseFloat(style["--stabilizing-sweep-duration"]);
    const delay = Number.parseFloat(style["--stabilizing-delay"]);
    assert.ok(duration >= 9.5 && duration <= 11);
    assert.ok(Math.abs(interval - duration / 5) <= 0.02);
    assert.ok(Math.abs(glintDuration - interval * 1.45) <= 0.02);
    assert.ok(Math.abs(sweepDuration - interval * 2) <= 0.02);
    assert.ok(delay <= 0 && delay >= -(duration * 2));
  }

  const duration = Number.parseFloat(first[0]["--stabilizing-duration"]);
  assert.equal(new Set(first.map((style) => style["--stabilizing-duration"])).size, 1);
  assert.ok(new Set(first.map((style) => `${style["--stabilizing-from-x"]}:${style["--stabilizing-from-y"]}`)).size > 1);
  for (let index = 1; index < first.length; index += 1) {
    const previousDelay = Number.parseFloat(first[index - 1]["--stabilizing-delay"]);
    const delay = Number.parseFloat(first[index]["--stabilizing-delay"]);
    assert.ok(Math.abs(previousDelay - delay - duration / 5) <= 0.02);
  }

  const markup = renderToStaticMarkup(createElement(StabilizingEffect, { seedKey: "echo-alpha" }));
  assert.equal(markup.match(/class="stabilizing-gold-charge"/gu)?.length, 1);
  assert.equal(markup.match(/class="stabilizing-gold-glint"/gu)?.length, 1);
  assert.equal(markup.match(/class="stabilizing-wave-front"/gu)?.length, 2);
  assert.equal(markup.match(/class="stabilizing-mote"/gu)?.length, 5);

  const cardSource = readFileSync(new URL("../src/components/Card.tsx", import.meta.url), "utf8");
  const effectSource = readFileSync(new URL("../src/components/StabilizingEffect.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const latticeRule = css.match(/\.stabilizing-lattice\s*\{([\s\S]*?)\n  \}/u)?.[1] ?? "";

  assert.match(cardSource, /<StabilizingEffect[\s\S]*?seedKey=\{card\.instanceId\}/u);
  assert.doesNotMatch(effectSource, /canvas|WebGL|shader/iu);
  assert.match(latticeRule, /repeating-linear-gradient/u);
  assert.doesNotMatch(latticeRule, /background:/u);
  assert.match(css, /\.stabilizing-wave-front\s*\{[^}]*background:\s*radial-gradient/su);
  assert.match(css, /\.stabilizing-wave-front\s*\{[^}]*animation:\s*stabilizing-wave-front var\(--stabilizing-sweep-duration,/su);
  assert.match(css, /\.stabilizing-mote\s*\{[^}]*width:\s*4\.4cqw;/su);
  assert.match(css, /animation:\s*stabilizing-mote-fall[^;]*linear[^;]*infinite;/u);
  assert.match(css, /@keyframes stabilizing-wave-front\s*\{\s*0%\s*\{[^}]*opacity:\s*0\.92;/u);
  assert.match(css, /@keyframes stabilizing-wave-front[\s\S]*?62\.5%,\s*100%\s*\{[^}]*opacity:\s*0;/u);
  assert.match(css, /@keyframes stabilizing-mote-fall\s*\{[\s\S]*?94%\s*\{[^}]*opacity:\s*0\.95;[\s\S]*?100%\s*\{[^}]*opacity:\s*0;/u);
  assert.match(css, /\.stabilizing-gold-charge\s*\{[^}]*opacity:\s*0\.12;[^}]*\}/su);
  assert.match(css, /animation:\s*stabilizing-gold-glint var\(--stabilizing-glint-duration, 3s\) linear infinite;/u);
  assert.match(css, /animation:\s*stabilizing-satin-drift 9\.5s linear infinite;/u);
  assert.doesNotMatch(css, /@keyframes stabilizing-gold-charge/u);
  assert.match(css, /@keyframes stabilizing-gold-glint\s*\{\s*0%\s*\{[^}]*transform:\s*translate3d\(-85%, 0, 0\);[^}]*opacity:\s*0;/su);
  assert.match(css, /@keyframes stabilizing-satin-drift\s*\{\s*0%\s*\{[^}]*transform:\s*translate3d\(-85%, 0, 0\);[^}]*opacity:\s*0;/su);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.stabilizing-wave-front:first-child/su);
  assert.doesNotMatch(css, /summoning-sickness-rings|summoning-water-/u);
});

test("Stabilizing closes with a finite seal before its presentation state is released", () => {
  const previous = createTestGame("stabilization-completion");
  const playerEcho = addCard(previous, customCard("player-stabilizing", "player"));
  const hostEcho = addCard(previous, customCard("host-stabilizing", "host"));
  const removedEcho = addCard(previous, customCard("removed-stabilizing", "player"));
  playerEcho.stabilizing = true;
  hostEcho.stabilizing = true;
  removedEcho.stabilizing = true;

  const next = structuredClone(previous);
  next.player.field.find((card) => card.instanceId === playerEcho.instanceId).stabilizing = false;
  next.host.field.find((card) => card.instanceId === hostEcho.instanceId).stabilizing = false;
  next.player.field = next.player.field.filter((card) => card.instanceId !== removedEcho.instanceId);

  assert.deepEqual(completedStabilizationCards(previous, next), [
    { cardId: playerEcho.instanceId, side: "player" },
    { cardId: hostEcho.instanceId, side: "host" },
  ]);
  assert.equal(stabilizationCompletionDelayMs(0), 0);
  assert.equal(stabilizationCompletionDelayMs(2), 140);
  assert.equal(stabilizationCompletionTotalMs(0), 0);
  assert.equal(stabilizationCompletionTotalMs(3), 760);

  const markup = renderToStaticMarkup(createElement(StabilizingEffect, {
    seedKey: "echo-alpha",
    phase: "completing",
    completionDelayMs: 140,
  }));
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("../src/store/useGameStore.ts", import.meta.url), "utf8");
  const battlefieldSource = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const orbSource = readFileSync(new URL("../src/components/PhaseOrb.tsx", import.meta.url), "utf8");

  assert.match(markup, /stabilizing-effect is-completing/u);
  assert.match(markup, /--stabilizing-completion-delay:140ms/u);
  assert.match(markup, /stabilizing-completion-lattice/u);
  assert.match(markup, /stabilizing-completion-core/u);
  assert.match(markup, /stabilizing-completion-release/u);
  assert.match(css, /animation:\s*stabilizing-completion-lifetime 620ms[^;]*both;/u);
  assert.match(css, /@keyframes stabilizing-completion-lattice/u);
  assert.match(css, /@keyframes stabilizing-completion-release/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?animation-duration:\s*180ms;/u);
  assert.match(storeSource, /stabilizationCompletionForTransition\(game, next\)/u);
  assert.match(storeSource, /state\.stabilizationCompletion \|\|[\s\S]*?state\.surgeTransitionActive/u);
  assert.match(battlefieldSource, /const holdStableGrouping = holdCasualties \|\| Boolean/u);
  assert.match(orbSource, /hostStartAfterStabilizationRef/u);
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
  assert.match(animator, /boundedVfxPixelRatio\(/u);
  assert.match(animator, /const FRAME_INTERVAL_MS = 1000 \/ 60/u);
  assert.match(animator, /if \(now - lastRenderedAt < FRAME_INTERVAL_MS/u);
  assert.match(animator, /canvas\.width = 1;\s*canvas\.height = 1;/u);
  assert.match(styles, /\.burn-canvas\s*\{[^}]*opacity:\s*0;/u);
});

test("the permanent temporal sky stays inside the fullscreen GPU budget", () => {
  const backdrop = readFileSync(new URL("../src/components/TemporalBackdrop.tsx", import.meta.url), "utf8");
  const vortex = readFileSync(new URL("../src/components/DestinyRewriteTransition.tsx", import.meta.url), "utf8");

  assert.match(backdrop, /boundedVfxPixelRatio\(cssWidth, cssHeight, window\.devicePixelRatio \|\| 1\)/u);
  assert.match(backdrop, /const FRAME_INTERVAL_MS = 1000 \/ 60/u);
  assert.match(backdrop, /if \(now - lastRenderedAt < FRAME_INTERVAL_MS\)/u);
  assert.match(backdrop, /const presentedDial = dialMix - destinyMix \* 180;[\s\S]*?if \(presentedDial !== lastPositionedDial\)/u);
  assert.match(vortex, /boundedVfxPixelRatio\(width, height, window\.devicePixelRatio \|\| 1\)/u);
  assert.match(vortex, /const FRAME_INTERVAL_MS = 1000 \/ 60/u);
  assert.match(vortex, /canvas\.width = 1;\s*canvas\.height = 1;/u);
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

  // Los efectos fullscreen conservan detalle a 1080p y no reservan un framebuffer 4K/5K.
  assert.equal(boundedVfxPixelRatio(1920, 1080, 1), 1);
  assert.equal(boundedVfxPixelRatio(1920, 1080, 2), 4 / 3);
  assert.equal(boundedVfxPixelRatio(3840, 2160, 2), 2 / 3);
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
  assert.match(warmup, /boundedVfxPixelRatio\(width, height, window\.devicePixelRatio \|\| 1\)/u);
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
  assert.match(app, /if \(!productResumeRuntime\.enabled \|\| !boardSessionPolicy\.autosave \|\| screen !== "game"\) return;/u);
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

test("a defense arrow is consumed when its fight starts even if both Echoes survive", () => {
  const game = createTestGame();
  const attacker = addCard(game, customCard("surviving-arrow-attacker", "host"));
  const blocker = addCard(game, customCard("surviving-arrow-blocker", "player"));
  const laterBlocker = addCard(game, customCard("later-arrow-blocker", "player"));
  game.combat.hostAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId, laterBlocker.instanceId] };

  assert.deepEqual(consumedDefenseArrowLinkIds(game, {
    attackerId: attacker.instanceId,
    blockerId: blocker.instanceId,
    attackerDies: false,
  }), [`${attacker.instanceId}-${blocker.instanceId}`]);
  assert.deepEqual(consumedDefenseArrowLinkIds(game, {
    attackerId: attacker.instanceId,
    blockerId: blocker.instanceId,
    attackerDies: true,
  }), [
    `${attacker.instanceId}-${blocker.instanceId}`,
    `${attacker.instanceId}-${laterBlocker.instanceId}`,
  ]);

  const visibilitySource = readFileSync(new URL("../src/components/useDefenseLinkVisibility.ts", import.meta.url), "utf8");
  assert.doesNotMatch(visibilitySource, /HOST_ATTACK_LINK_CLEAR_MS|setTimeout/u);
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

test("deck collections present their key-card art as a large adaptive gallery", () => {
  const decksView = readFileSync(new URL("../src/components/DecksView.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(decksView, /decks-panel decks-panel-\$\{collection\}/u);
  assert.match(
    styles,
    /\.decks-panel\s*\{[^}]*--deck-key-card-width:\s*clamp\(210px, min\(22vw, calc\(\(100vh - 250px\) \/ 1\.52\)\), 340px\);/u,
  );
  assert.match(styles, /\.decks-panel \.decks-card-row\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, var\(--deck-key-card-width\)\);/u);
  assert.match(styles, /\.decks-panel \.deck-key-card:hover \.deck-key-card-stage,[\s\S]*?translateY\(-18px\) scale\(1\.025\)/u);
  assert.match(styles, /\.decks-panel \.deck-key-card-copy strong\s*\{[^}]*font-size:\s*clamp\(19px, 1\.5vw, 25px\);/u);
});

test("main menu uses the centered fracture frontispiece over the temporal sky", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.main-menu-layout\s*\{[^}]*width:\s*100%;[^}]*place-content:\s*center;[^}]*justify-items:\s*center;/u);
  assert.match(styles, /\.main-menu-layout\s*\{[^}]*transform:\s*scale\(1\.2\);[^}]*transform-origin:\s*center;/u);
  assert.match(styles, /\.main-menu-title\s*\{[^}]*margin:\s*0;[^}]*font-size:\s*clamp\(54px, min\(7\.7vw, 13\.5vh\), 102px\);/u);
  assert.match(styles, /\.main-menu-entry\.is-primary\s*\{[^}]*font-size:\s*clamp\(22px,/u);
  assert.match(startMenu, /className="main-menu-subtitle"><span \/><em>\{t\("menu\.act"\)\}<\/em><span \/><\/div>/u);
  assert.match(startMenu, /className="main-menu-entry is-primary group"[^>]*onClick=\{openThreshold\}/u);
  assert.doesNotMatch(startMenu, /main-menu-entry-mark/u);
});

test("main menu footer shows only the current beta version", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const version = readFileSync(new URL("../src/version.ts", import.meta.url), "utf8");

  assert.match(version, /APP_VERSION = "Beta 0\.1\.0"/u);
  assert.match(startMenu, /main-menu-credits[^>]*>[\s\S]*?\{APP_VERSION\}[\s\S]*?<\/div>/u);
  assert.doesNotMatch(startMenu, /Version:|developedBy|Leoocast|openExternalLink/u);
});

test("main menu collections, help and settings replace the menu at full screen", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(startMenu, /const fullScreenMenu = menuScreen !== "home";/u);
  assert.match(startMenu, /\) : menuScreen === "settings" \? \(/u);
  assert.match(startMenu, /\) : menuScreen === "howToPlay" \? \(/u);
  assert.match(startMenu, /\) : menuScreen === "chronicles" \? \(/u);
  assert.match(startMenu, /\) : menuScreen === "hosts" \? \(/u);
  assert.match(styles, /\.main-settings-screen\s*\{[^}]*width:\s*100%;[^}]*height:\s*100vh;/u);
});

test("main menu settings are grouped into two responsive columns", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(startMenu, /main-settings-content main-settings-content-columns old-scrollbar/u);
  assert.equal(startMenu.match(/className="main-settings-column"/gu)?.length, 2);
  assert.match(styles, /\.main-settings-content-columns\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?\.main-settings-content-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/u);
});

test("deck inspection keeps the same temporal sky as the main menu", () => {
  const deckInspector = readFileSync(new URL("../src/components/DeckInspector.tsx", import.meta.url), "utf8");
  assert.match(deckInspector, /<main className=\{`deck-detail-screen[\s\S]*?<TemporalBackdrop \/>/u);
});

test("the Hostfall wordmark and Chronicler name use the bundled decorative face", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /@font-face\s*\{[^}]*font-family:\s*"Cinzel Decorative";[^}]*font-weight:\s*400;[^}]*cinzel-decorative-latin\.woff2/u,
  );
  assert.match(styles, /\.hostfall-wordmark\s*\{[^}]*font-family:\s*"Cinzel Decorative"[^}]*font-weight:\s*400;/u);
  assert.match(styles, /\.main-menu-chronicler-name\s*\{[^}]*font-family:\s*"Cinzel Decorative"[^}]*font-weight:\s*400;/u);
  assert.match(startMenu, /className="hf-ui-button main-menu-chronicler-edit"[\s\S]*?<Pencil size=\{16\}/u);
  assert.doesNotMatch(startMenu, /main-menu-chronicler-mark|<Feather/u);
  assert.doesNotMatch(styles, /\.main-menu-chronicler-mark/u);
});

test("the Chronicler claims a name over the clean temporal sky", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.equal(translate("es", "name.beforeFirstPage"), "De entre todos los futuros");
  assert.equal(translate("en", "name.beforeFirstPage"), "Among all possible futures");
  assert.equal(translate("es", "name.save"), "Que así sea");
  assert.equal(translate("en", "name.save"), "So shall it be");
  assert.match(startMenu, /showNameEditor \? "chronicler-name-open"/u);
  assert.match(startMenu, /className="chronicler-name-divider"/u);
  assert.doesNotMatch(startMenu, /chronicler-name-(?:ornament|flourish|feather)/u);
  assert.match(styles, /\.main-menu-shell\.chronicler-name-open > \.main-menu-stage[\s\S]*?opacity:\s*0;/u);
  assert.match(styles, /\.chronicler-name-modal\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/u);
  assert.match(styles, /\.chronicler-name-input-shell:focus-within::after\s*\{[^}]*width:\s*100%;/u);
});

test("deck setup panels and deck cards opt into shared click audio", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const decksView = readFileSync(new URL("../src/components/DecksView.tsx", import.meta.url), "utf8");

  assert.match(startMenu, /<article\s+data-audio-click="valid"\s+className=\{`expedition-combatant/u);
  assert.match(decksView, /<button\s+data-audio-click="off"\s+className=\{`deck-key-card/u);
  assert.match(decksView, /onClick=\{\(\) => \{\s*playSfx\("click"\);\s*onOpen\(\);/u);
});

test("standard Preparation uses a fixed Future frontispiece and keeps the real deck drawer", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.equal(translate("es", "common.viewDeck"), "Ver mazo");
  assert.equal(translate("es", "common.changeDeck"), "Cambiar mazo");
  assert.equal(translate("es", "setup.chooseChronicle"), "Elige una Crónica");
  assert.equal(translate("es", "setup.chooseHost"), "Elige una Hueste");
  assert.equal(translate("es", "setup.adventurer"), "Esperanza");
  assert.equal(translate("es", "setup.veteran"), "Presagio");
  assert.equal(translate("es", "setup.doomed"), "Perdición");
  assert.equal(translate("en", "setup.adventurer"), "Hope");
  assert.equal(translate("en", "setup.veteran"), "Omen");
  assert.equal(translate("en", "setup.doomed"), "Doom");
  assert.match(startMenu, /props\.chaos \? "chaos-setup" : "expedition-frontispiece"/u);
  assert.match(startMenu, /<FutureCode key=\{futureCode\} code=\{futureCode\} \/>/u);
  assert.match(startMenu, /className="preparation-frontispiece-future"/u);
  assert.match(startMenu, /className="preparation-frontispiece-modes"[\s\S]*?<HostAwakening turns=\{props\.selectedMode\.setupTurns\} \/>/u);
  assert.match(startMenu, /<SetupDeckDrawer[\s\S]*?selectedDeckId=/u);
  assert.doesNotMatch(startMenu, /expedition-future-identity/u);

  const modeMarkup = startMenu.slice(
    startMenu.indexOf('<div className="preparation-frontispiece-modes"'),
    startMenu.indexOf("<HostAwakening", startMenu.indexOf('<div className="preparation-frontispiece-modes"')),
  );
  const combatantMarkup = startMenu.slice(
    startMenu.indexOf("function PreparationCombatant"),
    startMenu.indexOf("function ChaosRules"),
  );
  const centerMarkup = startMenu.slice(
    startMenu.indexOf('<div className="preparation-frontispiece-center">'),
    startMenu.indexOf('<PreparationCombatant\n              eyebrow={t("setup.hostSide")}'),
  );
  const footerMarkup = startMenu.slice(
    startMenu.indexOf('<footer className="expedition-footer preparation-frontispiece-footer"'),
    startMenu.indexOf("</footer>", startMenu.indexOf('<footer className="expedition-footer preparation-frontispiece-footer"')),
  );
  const drawerMarkup = startMenu.slice(
    startMenu.indexOf("export function SetupDeckDrawer"),
    startMenu.indexOf("function DeveloperWarningModal"),
  );
  assert.doesNotMatch(modeMarkup, /setupTurns|phase\.setup|Preparation|Preparación/u);
  assert.equal(combatantMarkup.match(/\{eyebrow\}/gu)?.length, 1);
  assert.doesNotMatch(combatantMarkup, /cardCount|common\.cards/u);
  assert.match(centerMarkup, /preparation-frontispiece-match[\s\S]*?preparation-frontispiece-center-fate[\s\S]*?preparation-frontispiece-modes[\s\S]*?<HostAwakening/u);
  assert.match(centerMarkup, /className=\{`preparation-frontispiece-center-fate is-\$\{props\.mode\}`\}/u);
  assert.doesNotMatch(footerMarkup, /preparation-frontispiece-modes|HostAwakening/u);
  assert.match(drawerMarkup, /const drawerTitle = t\(side === "player" \? "setup\.chooseChronicle" : "setup\.chooseHost"\);/u);
  assert.doesNotMatch(drawerMarkup, /<small>\{eyebrow\}<\/small>|menu\.(?:chronicles|hosts)/u);

  assert.match(styles, /\.preparation-frontispiece-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) clamp\(300px, 35vw, 560px\) minmax\(0, 1fr\);/u);
  assert.match(styles, /\.preparation-frontispiece-future\s*\{[^}]*width:\s*100%;[^}]*font-variant-numeric:\s*tabular-nums;/u);
  assert.match(styles, /\.preparation-frontispiece-future\s*\{[^}]*color:\s*#f4dc91;[^}]*0 0 82px rgb\(190 144 55 \/ 0\.24\);/u);
  assert.match(styles, /\.preparation-frontispiece-future > span\s*\{[^}]*width:\s*0\.72em;[^}]*preparation-future-digit-in/u);
  assert.match(styles, /\.preparation-frontispiece-kicker\s*\{[^}]*color:\s*#91a29e;[^}]*font-size:\s*clamp\(15px, 1\.25vw, 21px\);/u);
  assert.match(styles, /\.preparation-frontispiece-future > span\.is-separator\s*\{[^}]*color:\s*inherit;/u);
  assert.match(styles, /\.preparation-frontispiece-match > span\s*\{[^}]*font-size:\s*clamp\(17px, 1\.45vw, 23px\);/u);
  assert.match(styles, /\.preparation-frontispiece-match > small\s*\{[^}]*font-size:\s*12px;/u);
  assert.match(styles, /\.preparation-frontispiece-wing-foot\s*\{[^}]*margin-top:\s*clamp\(7px, 1vh, 11px\);/u);
  assert.doesNotMatch(startMenu, /preparation-frontispiece-diamond|frontispiece-active/u);
  const futureDigitKeyframes = styles.slice(
    styles.indexOf("@keyframes preparation-future-digit-in"),
    styles.indexOf("@keyframes preparation-future-halo"),
  );
  assert.doesNotMatch(futureDigitKeyframes, /brightness/u);
  assert.match(styles, /\.expedition-deck-drawer > header h2\s*\{[^}]*grid-column:\s*2;[^}]*text-align:\s*center;/u);
  assert.match(styles, /\.expedition-deck-drawer-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2, var\(--deck-key-card-width\)\);[^}]*align-content:\s*start;/u);
  assert.match(styles, /@keyframes expedition-drawer-card-in/u);
  assert.match(styles, /\.preparation-frontispiece-center-fate \.expedition-awakening\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*white-space:\s*nowrap;/u);
  assert.match(styles, /\.preparation-frontispiece-modes\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/u);
  assert.match(styles, /\.preparation-frontispiece-center-fate\.is-easy\s*\{[^}]*--difficulty-accent:\s*#a9e2b2;/u);
  assert.match(styles, /\.preparation-frontispiece-center-fate\.is-hard\s*\{[^}]*--difficulty-accent:\s*#f0aaa2;/u);
  assert.match(styles, /\.preparation-frontispiece-mode\.is-selected\s*\{[^}]*background:\s*var\(--difficulty-surface\);[^}]*color:\s*var\(--difficulty-accent\);/u);
  assert.match(styles, /\.preparation-frontispiece-center-fate \.expedition-awakening strong\s*\{[^}]*color:\s*var\(--difficulty-accent\);/u);
  assert.match(styles, /@keyframes preparation-cta-orbit-clockwise\s*\{\s*to \{ transform: translate\(-50%, -50%\) rotate\(360deg\); \}/u);
  assert.match(styles, /@keyframes preparation-card-player-in/u);
  assert.match(styles, /@keyframes preparation-card-host-in/u);
});

test("standard Preparation hands its visible cards to the encounter clash", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const encounter = readFileSync(new URL("../src/components/EncounterTransition.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(startMenu, /const playerCardRef = useRef<HTMLButtonElement>\(null\);/u);
  assert.match(startMenu, /const hostCardRef = useRef<HTMLButtonElement>\(null\);/u);
  assert.match(startMenu, /captureEncounterCardRect\(playerCardRef\.current\)[\s\S]*?captureEncounterCardRect\(hostCardRef\.current\)/u);
  assert.match(startMenu, /props\.onStart\(player && host \? \{ player, host \} : undefined\);/u);
  assert.match(startMenu, /ref=\{cardRef\}[\s\S]*?className=\{`preparation-frontispiece-card/u);
  assert.match(startMenu, /className=\{`expedition-setup[\s\S]*?props\.launching \? "is-launching"/u);
  assert.match(app, /cardOrigins: reducedMotion \? undefined : options\.encounterCardOrigins/u);
  assert.match(app, /cardOrigins=\{launchTransition\.cardOrigins\}/u);

  assert.match(encounter, /useLayoutEffect\(\(\) => \{[\s\S]*?readEncounterCardRect\(playerTargetRef\.current\)[\s\S]*?setCardTargets\(\{ player, host \}\);/u);
  assert.match(encounter, /is-continuity-measuring/u);
  assert.match(encounter, /has-card-continuity/u);
  assert.match(encounter, /encounter-transition-continuity-card/u);
  assert.match(styles, /\.expedition-frontispiece\.is-launching \.preparation-frontispiece-card-art\s*\{[^}]*visibility:\s*hidden;/u);
  assert.match(styles, /\.encounter-transition\.is-continuity-measuring \.encounter-transition-combatant\s*\{[^}]*animation:\s*none !important;/u);
  assert.match(styles, /\.encounter-transition\.has-card-continuity \.encounter-transition-art\s*\{[^}]*visibility:\s*hidden;/u);
  assert.match(styles, /@keyframes encounter-continuity-card-player\s*\{[\s\S]*?42\.857%, 68%[\s\S]*?calc\(var\(--encounter-target-top\) \+ 104vh\)/u);
  assert.match(styles, /@keyframes encounter-continuity-card-host\s*\{[\s\S]*?42\.857%, 68%[\s\S]*?calc\(var\(--encounter-target-top\) - 104vh\)/u);
});

test("secondary menus homologate their back control with Play's Main menu anchor", () => {
  const threshold = readFileSync(new URL("../src/components/PlayThreshold.tsx", import.meta.url), "utf8");
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const decksView = readFileSync(new URL("../src/components/DecksView.tsx", import.meta.url), "utf8");
  const seeds = readFileSync(new URL("../src/components/SeedsOfDestinyScreen.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(threshold, /className="play-threshold-back expedition-back"/u);
  assert.equal(startMenu.match(/className="menu-screen-back expedition-back"/gu)?.length, 2);
  assert.match(decksView, /className="menu-screen-back expedition-back"[\s\S]*?t\("common\.mainMenu"\)/u);
  assert.match(seeds, /className="menu-screen-back expedition-back"[\s\S]*?t\("common\.mainMenu"\)/u);
  assert.match(styles, /\.play-threshold-back\s*\{[^}]*top:\s*18px;[^}]*left:\s*clamp\(28px, 4vw, 64px\);[^}]*font-size:\s*13px;/u);
  assert.match(styles, /\.menu-screen-back\s*\{[^}]*top:\s*18px;[^}]*left:\s*clamp\(28px, 4vw, 64px\);[^}]*margin:\s*0;/u);
  assert.match(styles, /\.preparation-frontispiece-header\s*\{[^}]*min-height:\s*72px;[^}]*padding-block:\s*10px;/u);
  assert.match(styles, /@media \(max-height: 760px\)\s*\{\s*\.play-threshold-back,\s*\.menu-screen-back \{ top: 14px; \}/u);
});

test("the menu archive and inscription both use Seed of Destiny", () => {
  const seeds = readFileSync(new URL("../src/components/SeedsOfDestinyScreen.tsx", import.meta.url), "utf8");

  assert.equal(translate("en", "menu.seedsOfDestiny"), "Seed of Destiny");
  assert.equal(translate("es", "menu.seedsOfDestiny"), "Semilla del Destino");
  assert.equal(translate("en", "threshold.seedLabel"), "Seed of Destiny");
  assert.equal(translate("es", "threshold.seedLabel"), "Semilla del Destino");
  assert.doesNotMatch(seeds, /seeds-intro/u);
});

test("How to Play opens a full-screen data-driven tutorial catalog", () => {
  const startMenu = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(startMenu, /type MenuScreen = [^;]*"howToPlay"/u);
  assert.match(startMenu, /setMenuScreen\("howToPlay"\)/u);
  assert.match(startMenu, /main-settings-screen how-to-play-screen/u);
  assert.match(startMenu, /howToPlayEntries\.map/u);
  assert.match(startMenu, /disabled=\{!entry\.onLaunch\}/u);
  assert.match(styles, /\.how-to-play-lesson\s*\{[^}]*grid-template-columns:/u);
});

test("Settings stays above gameplay while confirmations stay above Settings", () => {
  const settings = readFileSync(new URL("../src/components/SettingsMenu.tsx", import.meta.url), "utf8");
  const languageSelector = readFileSync(new URL("../src/components/LanguageSelector.tsx", import.meta.url), "utf8");
  const board = readFileSync(new URL("../src/components/Board.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(settings, /modalPresence\.mounted && createPortal\(/u);
  assert.match(settings, /const portalLauncher = guided && typeof document !== "undefined";/u);
  assert.match(settings, /game-settings-popover game-guided-settings-launcher-layer fixed right-4 top-4/u);
  assert.match(settings, /game-settings-popover game-settings-system-layer game-settings-modal-backdrop/u);
  assert.match(settings, /restartPresence\.mounted && createPortal\(/u);
  assert.match(settings, /game-settings-popover game-system-confirmation-layer game-home-backdrop/u);
  assert.match(settings, /onClick=\{onReturnToMenu\}/u);
  assert.match(settings, /guided \? "w-\[min\(640px,calc\(100vw-40px\)\)\]"/u);
  assert.match(settings, /: "w-\[min\(1180px,calc\(100vw-40px\)\)\]"/u);
  assert.match(settings, /guided \? "grid-cols-1" : "grid-cols-\[360px_minmax\(0,1fr\)\]"/u);
  assert.match(settings, /\{!guided && <section className="hf-ui-panel-soft p-4">[\s\S]*?guided\.contextual\.settingsTitle/u);
  assert.match(settings, /className="hf-ui-button guided-settings-restart/u);
  assert.match(languageSelector, /language-selector is-\$\{variant\}/u);

  assert.match(board, /homeConfirmationPresence\.mounted && createPortal\(/u);
  assert.match(board, /game-settings-popover game-system-confirmation-layer game-home-backdrop/u);
  assert.match(styles, /\.game-settings-system-layer\s*\{\s*z-index:\s*40000;/u);
  assert.match(styles, /\.game-guided-settings-launcher-layer\s*\{\s*z-index:\s*39990;/u);
  assert.match(styles, /\.game-system-confirmation-layer\s*\{\s*z-index:\s*40010;/u);
  assert.match(styles, /\.game-log-card-preview\s*\{[\s\S]*?z-index:\s*40005;/u);
  assert.match(styles, /\.deck-collection-modal-backdrop\.game-log-details-backdrop\s*\{\s*z-index:\s*40005;/u);
  assert.match(styles, /\.game-settings-popover \.old-panel/u);
  assert.match(styles, /\.game-settings-popover \.game-settings-modal/u);
  assert.match(styles, /\.language-selector\.is-panel \{[\s\S]*?width: min\(100%, 440px\);[\s\S]*?margin-inline: auto;/u);
  assert.match(styles, /\.language-selector-option \{[\s\S]*?text-align: center;[\s\S]*?white-space: nowrap;/u);
});

test("the Log card hover shows only a larger card image", () => {
  const gameLog = readFileSync(new URL("../src/components/GameLog.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(gameLog, /const CARD_PREVIEW_WIDTH = 270;/u);
  assert.doesNotMatch(gameLog, /<span>\{previewCard\.displayName\}<\/span>/u);
  assert.match(styles, /\.game-log-card-preview\s*\{[\s\S]*?width:\s*270px;/u);
  assert.doesNotMatch(styles, /\.game-log-card-preview\s*\{[^}]*?(?:border|background|box-shadow):/u);
  assert.doesNotMatch(styles, /\.game-log-card-preview span\s*\{/u);
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

test("combat arrows reveal upward with padded edges before their glint starts", () => {
  const combatArrowsSource = readFileSync(new URL("../src/components/CombatArrows.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(combatArrowsSource, /<g className="combat-arrow-reveal">[\s\S]*?<TacticalArrowGlyph/u);
  assert.match(stylesSource, /\.combat-arrow-reveal\s*\{[^}]*animation:\s*combat-arrow-reveal 320ms[^}]*both;/u);
  assert.match(stylesSource, /\.combat-arrow-reveal \.tactical-arrow-glint\s*\{[^}]*animation-delay:\s*320ms;[^}]*animation-fill-mode:\s*backwards;/u);
  assert.match(stylesSource, /@keyframes combat-arrow-reveal\s*\{[\s\S]*?to\s*\{\s*clip-path:\s*inset\(-32px\);/u);
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
  const modal = readFileSync(new URL("../src/components/DefeatModal.tsx", import.meta.url), "utf8");
  const outcomeDialog = readFileSync(new URL("../src/components/GameOutcomeDialog.tsx", import.meta.url), "utf8");
  const destinyAction = readFileSync(new URL("../src/components/DestinyActionButton.tsx", import.meta.url), "utf8");
  const journeyModal = readFileSync(new URL("../src/components/LearnToPlayDefeatModal.tsx", import.meta.url), "utf8");
  const journeyDialogs = readFileSync(new URL("../src/components/LearnToPlayDefeatDialogs.tsx", import.meta.url), "utf8");
  const board = readFileSync(new URL("../src/components/Board.tsx", import.meta.url), "utf8");
  const desktopMain = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
  const backdrop = readFileSync(new URL("../src/components/TemporalBackdrop.tsx", import.meta.url), "utf8");
  const heavyLanding = readFileSync(new URL("../src/components/HeavyCreatureLanding.tsx", import.meta.url), "utf8");
  const duelHud = readFileSync(new URL("../src/components/DuelHud.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(animator, /renderSharedVfxFrame/u);
  assert.match(board, /captureDesktopViewport\(\)/u);
  // The native capture happens after every finite store/local/DOM presentation settles and
  // before the overlay mounts. Electron copies painted pixels, so it never reloads card URLs.
  // La barrera es común a los dos desenlaces: la derrota la drena para capturar el frame exacto
  // que va a romperse y la victoria para no retirar el tablero encima de un beat en curso.
  assert.match(board, /function outcomePresentationActive\(state: GameStore\)/u);
  assert.match(board, /guidedPresentationActivity\.snapshot\(\)\.activeCount === 0/u);
  assert.match(board, /await waitForFiniteDocumentAnimations\(\)/u);
  assert.match(board, /stopGamePresentation\(\);\s*await waitForFiniteDocumentAnimations\(\)/u);
  assert.match(board, /image\.decoding = "async"/u);
  assert.match(board, /await image\.decode\(\)/u);
  assert.match(board, /const destinyDialSettled = settledDestinyDialRevision === destinyDialRevision/u);
  assert.match(board, /const outcomeOutroReady = Boolean\(game\.winner\)[\s\S]*?destinyDialSettled[\s\S]*?!storePresentationActive[\s\S]*?localPresentation\.activeCount === 0/u);
  assert.match(board, /const outcomeEnabled = sessionPolicy\.showStandardOutcome[\s\S]*?sessionPolicy\.showJourneyDefeat && game\.winner === "host"/u);
  assert.match(board, /const defeatOutcomeReady = outcomeEnabled && outcomeOutroReady && game\.winner === "host"/u);
  assert.match(board, /const OUTCOME_DRAIN_WATCHDOG_MS = 15000/u);
  assert.match(board, /if \(outcomeOutroReady\) return;/u);
  assert.match(board, /stopGamePresentation\(\);[\s\S]*?setForcedOutcomeDrainSessionId\(watchedSessionId\)/u);
  assert.match(board, /settleDialImmediately=\{forcedOutcomeDrain\}/u);
  assert.match(board, /const defeatReady = defeatOutcomeReady && defeatSnapshot !== undefined/u);
  assert.match(board, /const outcomePresentationPending = outcomeEnabled && Boolean\(game\.winner\) && !defeatReady && !victoryReady/u);
  assert.match(board, /presentationInputBlocked && \(!tributeOfTheFourSorrowsSelectionActive \|\| outcomePresentationPending\)/u);
  assert.match(board, /snapshotImage=\{defeatSnapshot \?\? undefined\}/u);
  assert.match(board, /settleDefeatCapture\(capturePaintedDefeatFrame\(\)\)/u);
  assert.match(backdrop, /const DIAL_SETTLE_EPSILON = 0\.05/u);
  assert.match(backdrop, /lastReportedDialRevision !== targetRevision/u);
  assert.match(backdrop, /onDialSettledRef\.current\?\.\(targetRevision\)/u);
  assert.match(heavyLanding, /guidedPresentationActivity\.begin\(\s*"battlefield\.heavy-landing"/u);
  assert.match(duelHud, /guidedPresentationActivity\.begin\(\s*"life\.damage"/u);
  assert.match(desktopMain, /const DEFEAT_CAPTURE_MAX_WIDTH = 2560/u);
  assert.match(desktopMain, /const DEFEAT_CAPTURE_MAX_HEIGHT = 1440/u);
  assert.match(desktopMain, /capture\.resize\(\{/u);
  assert.doesNotMatch(animator, /html-to-image|toCanvas\(document\.body|snapshotHasVisualDetail/u);
  assert.doesNotMatch(board, /html-to-image|toCanvas\(document\.body/u);
  // The native plate contains the exact final compositor frame, including portal content.
  assert.match(animator, /snapshotImage\?: HTMLImageElement/u);
  assert.match(animator, /screenTexture\.image = snapshotImage/u);
  // The opaque screenshot colors the shards; transparency comes from the gaps in their geometry.
  // Capture, decode, and upload settle before the visible sequence clock begins.
  assert.match(animator, /function createClearGlassTexture\(\)/u);
  // Once the preflight succeeds, timing is deterministic.
  assert.match(animator, /const preflightDrew = renderShatterFrame\(\);/u);
  assert.ok(animator.indexOf("const preflightDrew = renderShatterFrame();") < animator.lastIndexOf("onSequenceStart();"));
  assert.match(animator, /const CRACK_AT_MS = 0/u);
  assert.match(animator, /const CRACK_SPAN_MS = 900/u);
  assert.match(animator, /const BURST_SETTLE_MS = 40/u);
  assert.match(animator, /const BURST_AT_MS = CRACK_AT_MS \+ CRACK_SPAN_MS \+ BURST_SETTLE_MS/u);
  assert.match(animator, /elapsed >= BURST_AT_MS/u);
  // The live board is hidden only after the captured plate has painted.
  assert.match(animator, /coverAfterPaint = Boolean\(snapshotImage\);/u);
  assert.match(animator, /if \(coverAfterPaint\) \{[\s\S]*?coverBoard\(\);/u);
  // El render/copy fullscreen no corre a 120/144 Hz ni excede el presupuesto 2560x1440.
  assert.match(animator, /const FRAME_INTERVAL_MS = 1000 \/ 60/u);
  assert.match(animator, /boundedVfxPixelRatio\(width, height, window\.devicePixelRatio \|\| 1\)/u);
  // El desenlace se nombra respecto del golpe real, no de un reloj propio del modal.
  assert.match(modal, /onBurst=\{revealOutcome\}/u);
  assert.doesNotMatch(modal, /REVEAL_AT_MS/u);
  assert.match(animator, /const REVEAL_AFTER_BURST_MS = 1340/u);
  // Nada tiñe la pantalla antes de que el vidrio se rompa: ni sello frío en el shader, ni capa
  // de hielo en el DOM, ni viñeta encendida de salida.
  assert.doesNotMatch(glassShader, /uFreeze/u);
  assert.doesNotMatch(animator, /uFreeze|defeat-shatter-freeze/u);
  assert.doesNotMatch(styles, /defeat-shatter-freeze/u);
  assert.match(styles, /\.defeat-shatter-vignette \{[\s\S]*?opacity: 0;\s*\}/u);
  // El desenlace se centra con una capa a pantalla completa: la succión del vórtice anima
  // `transform` sobre cada pieza y borraría un `translate` propio del bloque.
  assert.match(styles, /\.defeat-outcome \{\s*position: absolute;[\s\S]*?place-items: center;/u);
  assert.match(styles, /\.defeat-outcome-inner \{[\s\S]*?place-self: center;[\s\S]*?margin-inline: auto;/u);
  assert.doesNotMatch(styles, /\.defeat-title \{[^}]*translate:/su);
  assert.match(styles, /@keyframes defeat-outcome-in \{\s*from \{ opacity: 0; transform: translateY\(10px\); \}/u);
  // Cinzel's tracked advance box is not its visible ink box. The shared Spanish and English
  // verdicts use measured, locale-specific compensation so both the normal and tutorial title
  // sit on the viewport center instead of sharing one approximate tracking offset.
  assert.match(styles, /\.defeat-title \.line:first-child \{[^}]*padding-left: 0\.0268em;/su);
  assert.match(styles, /\.defeat-title \.line:last-child \{[^}]*padding-left: 0\.0378em;/su);
  assert.match(styles, /\.defeat-title:lang\(es\) \.line \{[^}]*padding-left: 0\.0489em;/su);
  assert.doesNotMatch(styles, /\.defeat-title \.line \{[^}]*padding-left: 0\.065em;/su);
  assert.match(modal, /<GameOutcomeDialog/u);
  assert.match(outcomeDialog, /className=\{`\$\{tone\}-outcome-inner`\}/u);
  // TemporalBackdrop and ambience remain alive below the opaque shard geometry.
  assert.match(styles, /\.game-screen-ambience \{/u);
  assert.doesNotMatch(styles, /\.game-screen::before/u);
  assert.match(board, /className="game-screen-ambience"/u);
  assert.match(board, /sessionPolicy\.showStandardOutcome && defeatReady/u);
  assert.match(board, /sessionPolicy\.showJourneyDefeat && defeatReady/u);
  assert.match(journeyModal, /<DefeatShatterAnimator/u);
  assert.match(journeyModal, /<LearnToPlayDefeatOutcomeDialog/u);
  assert.match(journeyDialogs, /destiny\.futureLostLineOne/u);
  assert.match(journeyDialogs, /destiny\.futureLostLineTwo/u);
  assert.match(journeyDialogs, /result\.chapterLostAmongShards/u);
  assert.match(journeyModal, /LEARN_TO_PLAY_NARRATIVE_DELAY_MS\s*=\s*1_000/u);
  assert.match(journeyDialogs, /guided\.learnToPlay\.defeatLineOne/u);
  assert.match(journeyDialogs, /guided\.learnToPlay\.defeatLineTwo/u);
  assert.match(journeyDialogs, /guided\.learnToPlay\.defeatBody/u);
  assert.match(journeyDialogs, /guided\.continue/u);
  assert.match(journeyDialogs, /guided\.learnToPlay\.defeatCta/u);
  assert.match(journeyModal, /onContemplateFuture/u);
  assert.match(journeyDialogs, /<DestinyActionButton/u);
  assert.match(destinyAction, /"destiny-command-button", "learn-to-play-contemplate-button"/u);
  assert.doesNotMatch(journeyDialogs, /disabled/u);
  assert.doesNotMatch(`${journeyModal}\n${journeyDialogs}`, /onRewriteFuture|defeat-future-plate|destiny-command-glyph/u);
  assert.match(styles, /\.learn-to-play-contemplate-button::before \{[\s\S]*?width: 180%;[\s\S]*?aspect-ratio: 1;/u);
  assert.match(styles, /\.learn-to-play-contemplate-button \.destiny-command-copy strong \{[^}]*padding-left: 0\.13em;/su);
  assert.match(styles, /\.learn-to-play-defeat-cta \{[^}]*justify-self: center;[^}]*margin-inline: auto;/su);
  // El vidrio se lee aunque no haya nada impreso: alfa de la captura con suelo de Fresnel.
  assert.match(glassShader, /float printed = middle\.a/u);
  assert.match(glassShader, /vFade \* max\(printed, glassEdge\)/u);
  assert.doesNotMatch(animator, /new THREE\.DataTexture/u);
  assert.match(animator, /createDefeatGlassMaterial/u);
  // Una sola malla con atributos por trozo: ni una geometría por fragmento ni luces
  // de escena. El brillo depende de la orientación real, no de un Phong iluminado.
  assert.match(animator, /new THREE\.BufferAttribute\(plan\.motions, 4\)/u);
  assert.match(animator, /new THREE\.BufferAttribute\(plan\.dynamics, 3\)/u);
  assert.doesNotMatch(animator, /ExtrudeGeometry|MeshPhongMaterial|PointLight|DirectionalLight/u);
  assert.match(animator, /material\.uniforms\.uShock\.value/u);
  // Prismas con espesor, Fresnel y canto biselado.
  assert.match(glassShader, /float expand = clamp\(max\(wave \* 0\.25, flying\)/u);
  assert.match(glassShader, /float fresnel = pow\(1\.0 - ndv, 3\.0\)/u);
  assert.match(glassShader, /N \*= sign\(dot\(N, V\)/u);
  assert.match(glassShader, /if \(vKind > 1\.5\)/u);
  // La onda es transparente fuera de su frente; alfa 1 convertiría el cielo en negro.
  assert.match(glassShader, /float coverage = clamp\(max\(emitted\.r, max\(emitted\.g, emitted\.b\)\)/u);
  assert.match(glassShader, /if \(coverage < 0\.001\) discard;/u);
  assert.match(glassShader, /gl_FragColor = vec4\(emitted, coverage\)/u);
  assert.match(glassShader, /blending: THREE\.AdditiveBlending,[\s\S]*?premultipliedAlpha: true,/u);
  assert.doesNotMatch(glassShader, /gl_FragColor = vec4\(color \* fade, 1\.0\)/u);
  assert.doesNotMatch(animator, /new THREE\.WebGLRenderer|forceContextLoss/u);
  assert.match(animator, /prefers-reduced-motion:\s*reduce/u);
  assert.match(modal, /<DefeatShatterAnimator seed=\{matchOriginVisualSeed\(matchOrigin\)\} snapshotImage=\{snapshotImage\} onSequenceStart=\{startSequence\}/u);
  assert.match(modal, /<GameOutcomeDialog[\s\S]*?tone="defeat"/u);
  assert.match(outcomeDialog, /destiny\.futureLostLineOne/u);
  assert.match(outcomeDialog, /destiny\.futureLostLineTwo/u);
  // Detrás del vidrio no se dibuja ningún fondo propio: el lienzo queda transparente y lo
  // que asoma es el espacio permanente del juego, con el tablero vivo ya retirado.
  assert.doesNotMatch(animator, /Abyss/u);
  assert.doesNotMatch(glassShader, /Abyss|ABYSS/u);
  assert.match(animator, /const PLATED_BODY_CLASS = "is-defeat-plated"/u);
  // El espacio del juego no se enrojece en la derrota: ese intento quedo retirado.
  assert.doesNotMatch(backdrop, /defeat/u);
  assert.doesNotMatch(readFileSync(new URL("../src/components/temporalBackdropShader.ts", import.meta.url), "utf8"), /uDefeat/u);
  assert.match(styles, /body\.is-defeat-plated \.game-screen > \*:not\(\.temporal-backdrop\):not\(\.game-screen-ambience\):not\(\.game-result-overlay\)/u);
  assert.match(styles, /body\.is-defeat-plated[\s\S]*?\.temporal-backdrop-grid \{ visibility: hidden; \}/u);
  // No opaque placeholder is used when the desktop bridge is unavailable.
  assert.doesNotMatch(animator, /backgroundColor: "#07100f"/u);
  // En lineal: la conversión sRGB del renderer compartido aclara la captura y el Fresnel
  // deja de leerse frío.
  assert.match(animator, /outputEncoding: THREE\.LinearEncoding/u);
  // El desenlace tiene que ganarle a `.game-screen [role="dialog"]`, que impone
  // `game-surface-in` y borra el centrado con su transform final.
  // Las magnitudes del cuarteado se dieron sobre un plano de alto 1: escalar sin
  // reajustarlas convierte la tensión en un salto visible.
  assert.match(glassShader, /dir \* wave \* 0\.004 \* uScale/u);
  // Sin rastro del montaje anterior: ni destello DOM, ni oscurecimiento propio, ni
  // temblor de pantalla. El golpe lo cuenta la onda WebGL.
  assert.doesNotMatch(animator, /defeat-shatter-impact/u);
  assert.doesNotMatch(styles, /defeat-screen-tremor|defeat-result-darkness|defeat-shatter-impact/u);
  assert.match(styles, /animation:\s*defeat-crack-grow 520ms 0ms/u);
  assert.match(styles, /path:nth-child\(3n\) \{ animation-delay: 240ms; \}/u);
  assert.match(styles, /\.is-bursting \.defeat-shatter-fractures \{\s*animation: defeat-cracks-away 280ms ease-out both;/u);
  assert.match(styles, /\.is-bursting \.defeat-shatter-vignette \{\s*animation: defeat-vignette-close 700ms ease both;/u);
  assert.match(styles, /\.defeat-shatter\.is-fallback \{\s*background: transparent;/u);
  assert.doesNotMatch(styles, /\.defeat-shatter-fractures \{[^}]*filter:/u);
  assert.doesNotMatch(styles, /\.defeat-outcome-inner::before/u);
  assert.match(styles, /@keyframes defeat-vignette-close \{\s*from \{ opacity: 0; \}\s*to \{ opacity: 0\.42; \}/u);
  // Todo el bloque de derrota sube un paso de tamaño sin tocar la victoria. Las dos acciones
  // permanecen en una sola fila y ninguna etiqueta se parte en dos líneas.
  const defeatKicker = styles.match(/\.defeat-kicker \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const defeatTitle = styles.match(/\.defeat-title \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const defeatSubtitle = styles.match(/\.defeat-subtitle \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const defeatFutureLabel = styles.match(/\.defeat-future-plate span \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const defeatFutureCode = styles.match(/\.defeat-future-plate b \{[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(defeatKicker, /font: 800 16px\/1 "Cinzel"/u);
  assert.match(defeatTitle, /font: 700 clamp\(48px, 8\.4vw, 96px\)\/0\.9 "Cinzel"/u);
  assert.match(defeatSubtitle, /font: 600 clamp\(12px, 1\.45vw, 16px\)\/1\.4 "Cinzel"/u);
  assert.match(defeatFutureLabel, /font: 800 14px\/1\.2 "Cinzel"/u);
  assert.match(defeatFutureCode, /font: 800 clamp\(23px, 2\.8vw, 33px\)\/1\.2 "Cinzel"/u);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/u);
  assert.match(styles, /\.defeat-outcome-inner \{[\s\S]*?place-self: center;/u);
  assert.match(styles, /\.game-outcome-action \{[\s\S]*?width: 100%;[\s\S]*?margin: 0;[\s\S]*?white-space: nowrap;/u);
  const contemplateHandlerAt = outcomeDialog.indexOf("onClick={onContemplateFuture}");
  const contemplateButton = outcomeDialog.slice(
    outcomeDialog.lastIndexOf("<button", contemplateHandlerAt),
    outcomeDialog.indexOf("</button>", contemplateHandlerAt) + "</button>".length,
  );
  assert.ok(contemplateHandlerAt >= 0);
  assert.doesNotMatch(contemplateButton, /<(?:svg|[A-Z][A-Za-z0-9]*)\b/u);
  assert.match(outcomeDialog, /<DestinyActionButton[\s\S]*?className="game-outcome-rewrite-action"[\s\S]*?onClick=\{onRewriteFuture\}/u);
  assert.match(destinyAction, /"destiny-command-button", "learn-to-play-contemplate-button"/u);
  assert.match(destinyAction, /destiny-command-copy[\s\S]*?<strong>\{label\}<\/strong>[\s\S]*?destiny-command-shimmer/u);
  assert.match(journeyDialogs, /<DestinyActionButton[\s\S]*?guided\.learnToPlay\.defeatCta/u);
  assert.doesNotMatch(outcomeDialog, /Sparkles/u);
  assert.doesNotMatch(styles, /@media \(max-width: 520px\) \{[\s\S]*?\.defeat-outcome-actions \{ grid-template-columns: 1fr; \}/u);
  const vortexVeil = styles.match(/\.destiny-vortex-veil \{[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.doesNotMatch(vortexVeil, /repeating-conic-gradient/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.defeat-shatter-canvas \{ display:\s*none; \}/u);
});

test("developer tools keep their development imports without a release URL escape hatch", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const gateSource = readFileSync(new URL("../src/utils/devMode.ts", import.meta.url), "utf8");

  assert.match(appSource, /const PlaygroundScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/playground\/PlaygroundScreen"\)/);
  assert.match(appSource, /const AudioLabScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/audio-lab\/AudioLabScreen"\)/);
  assert.match(appSource, /const SeedExplorerScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/seed-explorer\/SeedExplorerScreen"\)/);
  assert.match(appSource, /const UIReferenceScreen = import\.meta\.env\.DEV/);
  assert.match(appSource, /import\("\.\/ui-reference\/UIReferenceScreen"\)/);
  assert.match(gateSource, /export const IS_DEV: boolean = import\.meta\.env\.DEV/);
  assert.doesNotMatch(`${appSource}\n${gateSource}`, /\?playground/);
});

test("Audio Lab uses the standalone dev-workbench hierarchy without changing its authoring flow", () => {
  const labSource = readFileSync(new URL("../src/audio-lab/AudioLabScreen.tsx", import.meta.url), "utf8");
  const labStyles = readFileSync(new URL("../src/audio-lab/AudioLabScreen.css", import.meta.url), "utf8");

  assert.match(labSource, /import "\.\/AudioLabScreen\.css"/u);
  assert.match(labSource, /audio-lab-button audio-lab-back[\s\S]*?<ArrowLeft[\s\S]*?<span>Volver<\/span>/u);
  assert.ok(labSource.indexOf("audio-lab-back") < labSource.indexOf("audio-lab-brand"));
  assert.doesNotMatch(labSource, /Hostfall · Developer tool|<Home/u);
  assert.match(labSource, /Audio Lab <span>\/ Mezcla y balance<\/span>/u);
  assert.match(labSource, /\{visibleCount\} of \{totalCount\}/u);
  assert.match(labSource, /<AudioLabEmptyState query=\{search\}/u);
  assert.match(labSource, /sliderPositionPercent[\s\S]*?--audio-lab-position/u);
  assert.match(labStyles, /\.audio-lab-topbar \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto;/u);
  assert.match(labStyles, /\.audio-lab-workbench \{[\s\S]*?grid-template-columns: minmax\(250px, 286px\) minmax\(0, 1fr\);/u);
  assert.match(labStyles, /linear-gradient\(90deg,[\s\S]*?var\(--audio-lab-position\)/u);
});

test("Seed Explorer is a standalone dev screen launched from the home tool dock", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const menuSource = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const playgroundSource = readFileSync(new URL("../src/playground/PlaygroundScreen.tsx", import.meta.url), "utf8");
  const explorerSource = readFileSync(new URL("../src/seed-explorer/SeedExplorerScreen.tsx", import.meta.url), "utf8");
  const explorerStylesSource = readFileSync(new URL("../src/seed-explorer/SeedExplorerScreen.css", import.meta.url), "utf8");
  const globalStylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /screen === "seedExplorer" && SeedExplorerScreen/u);
  assert.match(appSource, /onOpenSeedExplorer=\{IS_DEV/u);
  assert.match(menuSource, /import\.meta\.env\.DEV && menuScreen === "home" && \(onOpenPlayground \|\| onOpenAudioLab \|\| onOpenSeedExplorer \|\| onOpenUiReference\)/u);
  assert.match(menuSource, /className="main-menu-developer-tools"/u);
  assert.match(menuSource, />Seed Explorer</u);
  assert.match(globalStylesSource, /\.main-menu-developer-tools \{[\s\S]*?position: absolute;[\s\S]*?right:[\s\S]*?bottom:/u);
  assert.doesNotMatch(playgroundSource, /SeedExplorer|id: "seeds"/u);
  assert.match(explorerSource, /<strong>Aproximación:<\/strong>/u);
  assert.doesNotMatch(explorerSource, /Preparación se deriva de dificultad/u);
  assert.match(explorerSource, /Probar en tablero/u);
  assert.match(explorerSource, /Ver detalles/u);
  assert.match(explorerSource, /title="Mano inicial"[\s\S]*?candidate\.preview\.openingHand/u);
  assert.match(explorerSource, /title="Mano tras mulligan"[\s\S]*?candidate\.preview\.mulliganHand/u);
  assert.match(explorerSource, /const imageUrl = useCardImage\(card\.definitionId\)/u);
  assert.match(explorerSource, /backgroundColor: ratingColor/u);
  assert.match(explorerSource, /useState<"best" \| "diverse">\("diverse"\)/u);
  assert.match(explorerSource, /label: "Primer acercamiento"[\s\S]*?label: "Equilibrada"[\s\S]*?label: "Hostfallero experimentado"[\s\S]*?label: "Presión alta"[\s\S]*?label: "Escalada progresiva"/u);
  assert.match(explorerSource, /value=\{configuration\.profileId\}[\s\S]*?SEED_SEARCH_PROFILES\[profileId\]\.defaultAvoidEarlySpikes/u);
  assert.match(explorerSource, /<VariationSelectControl[\s\S]*?value=\{configuration\.variationId\}/u);
  assert.match(explorerSource, /variationId: configuration\.variationId/u);
  assert.match(explorerSource, /SEARCH_VARIATION_OPTIONS\.map[\s\S]*?<VariationDot variationId=\{option\.value\}/u);
  assert.match(explorerSource, /favoriteNote \? "Editar nota" : "Agregar nota"/u);
  assert.match(explorerSource, /<FavoriteNoteModal[\s\S]*?note=\{noteDraft\}/u);
  assert.match(explorerSource, /updateStoredSeedFavoriteNote\(noteEditorCode, noteDraft\)/u);
  assert.match(explorerStylesSource, /\.seed-explorer-note-overlay[\s\S]*?z-index: 10045;[\s\S]*?\.seed-explorer-note-modal/u);
  assert.doesNotMatch(explorerSource, /<output className="seed-explorer-readonly-field">Primer acercamiento<\/output>/u);
  assert.match(explorerSource, /selectDiverseSeedCandidates\(rankedCandidatePool, configuration\.top\)/u);
  assert.match(explorerSource, />Mejores<\/button>[\s\S]*?>Variadas<\/button>/u);
  assert.match(explorerSource, /seed-explorer-archetype/u);
  assert.match(explorerSource, /is-\$\{variationTone\(variationId\)\}/u);
  assert.match(explorerStylesSource, /\.seed-explorer-archetype\.is-stable[\s\S]*?\.seed-explorer-archetype\.is-mulligan[\s\S]*?\.seed-explorer-archetype\.is-balanced/u);
  assert.match(explorerStylesSource, /\.seed-explorer-variation-menu[\s\S]*?\.seed-explorer-variation-dot\.is-mulligan/u);
  assert.match(explorerSource, /createInitialGame\([\s\S]*?identity\.entropy,[\s\S]*?identity\.preparationTurns,[\s\S]*?identity\.difficulty,[\s\S]*?identity\.gameMode/u);
  assert.match(explorerSource, /loadScenario\([\s\S]*?createInitialGame/u);
  assert.match(explorerSource, /startBattleMusic\(true\);[\s\S]*?setBoardCandidate\(candidate\)/u);
  assert.match(explorerSource, /if \(boardCandidate\)[\s\S]*?<Board/u);
  assert.match(explorerSource, /onReturnToMenu=\{\(\) => \{[\s\S]*?stopMusic\(\);[\s\S]*?setBoardCandidate\(undefined\);[\s\S]*?\}\}/u);
  assert.match(explorerSource, /<header className="seed-explorer-topbar">[\s\S]*?seed-explorer-back[\s\S]*?seed-explorer-brand/u);
  assert.doesNotMatch(explorerSource, /Hostfall · Developer/u);
  assert.doesNotMatch(explorerSource, /Análisis aproximado|Explicar Seed Explorer|HelpCircle/u);
  assert.match(explorerSource, /value=\{finalistDraft\}[\s\S]*?onChange=\{\(event\) => updateFinalistDraft\(event\.target\.value\)\}[\s\S]*?onBlur=\{commitFinalistDraft\}/u);
  assert.match(explorerSource, /import "\.\/SeedExplorerScreen\.css"/u);
  assert.match(explorerStylesSource, /\.seed-explorer-workspace \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?z-index: 10020;/u);
  const explorerBoardStyles = explorerStylesSource.match(/\.seed-explorer-board \{[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(explorerBoardStyles, /height: 100vh;/u);
  assert.doesNotMatch(explorerBoardStyles, /z-index:/u);
  assert.match(explorerStylesSource, /\.seed-explorer-topbar \{[\s\S]*?min-height: 52px;/u);
  assert.match(explorerStylesSource, /\.seed-explorer-detail-modal \{[\s\S]*?width: min\(1600px, calc\(100vw - 48px\)\);[\s\S]*?height: calc\(100vh - 36px\);/u);
  assert.doesNotMatch(appSource, /seedExplorerRuntime|seedExplorerSearch/u);
});

test("UI Reference inventories only real player UI and traces every component to its runtime use", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const menuSource = readFileSync(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8");
  const screenSource = readFileSync(new URL("../src/ui-reference/UIReferenceScreen.tsx", import.meta.url), "utf8");
  const modalGallerySource = readFileSync(new URL("../src/ui-reference/RuntimeModalGallery.tsx", import.meta.url), "utf8");
  const confirmationSource = readFileSync(new URL("../src/components/GameConfirmationDialog.tsx", import.meta.url), "utf8");
  const destinyDialogSource = readFileSync(new URL("../src/components/DestinyRewriteControl.tsx", import.meta.url), "utf8");
  const temporalBackdropSource = readFileSync(new URL("../src/components/TemporalBackdrop.tsx", import.meta.url), "utf8");
  const temporalBackdropShaderSource = readFileSync(new URL("../src/components/temporalBackdropShader.ts", import.meta.url), "utf8");
  const destinyActionSource = readFileSync(new URL("../src/components/DestinyActionButton.tsx", import.meta.url), "utf8");
  const handLimitSource = readFileSync(new URL("../src/components/HandLimitOverlay.tsx", import.meta.url), "utf8");
  const learnIntroSource = readFileSync(new URL("../src/components/LearnToPlayIntroModal.tsx", import.meta.url), "utf8");
  const guidedOverlaySource = readFileSync(new URL("../src/components/GuidedTutorialOverlay.tsx", import.meta.url), "utf8");
  const guidedDialogSource = readFileSync(new URL("../src/components/GuidedTutorialDialog.tsx", import.meta.url), "utf8");
  const referenceStyles = readFileSync(new URL("../src/ui-reference/UIReferenceScreen.css", import.meta.url), "utf8");
  const runtimeStyles = readFileSync(new URL("../src/ui-system.css", import.meta.url), "utf8");
  const gameStyles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

  assert.match(appSource, /screen === "uiReference" && UIReferenceScreen/u);
  assert.match(appSource, /onOpenUiReference=\{IS_DEV/u);
  assert.match(menuSource, />UI Reference</u);
  assert.match(screenSource, /import \{ Card, CardCostBadge \} from "\.\.\/components\/Card"/u);
  assert.match(screenSource, /import \{ TurnPhaseHud \} from "\.\.\/components\/TurnPhaseHud"/u);
  assert.match(screenSource, /import \{ DeckKeyCard \} from "\.\.\/components\/DecksView"/u);
  assert.match(screenSource, /<strong>Dónde se usa<\/strong>/u);
  assert.match(screenSource, /<RuntimeModalGallery game=\{game\}/u);
  assert.match(screenSource, /entry\.component/u);
  assert.match(screenSource, /entry\.source/u);
  assert.match(screenSource, /entry\.usedIn/u);
  assert.match(screenSource, /Qué significa cada estado/u);
  assert.match(screenSource, /No\s+significa viejo, retirado ni pendiente de reemplazo/u);
  assert.match(screenSource, /const ELEMENT_FILTERS = \[[\s\S]*?"Botones"[\s\S]*?"Modales"[\s\S]*?"Texto"[\s\S]*?"Feedback"/u);
  assert.match(screenSource, />Tipos de elemento</u);
  assert.doesNotMatch(screenSource, /UI_REFERENCE_GROUPS|ui-reference-scope/u);
  assert.doesNotMatch(screenSource, /from\s+["'][^"']*(?:dev\/mockups|playground|audio-lab|seed-explorer|Animator|Vfx|vfx|three)[^"']*["']/u);
  assert.match(modalGallerySource, /const MODAL_SPECIMENS:[\s\S]*?chronicler-name[\s\S]*?guided-tutorial[\s\S]*?learn-defeat-narrative/u);
  assert.doesNotMatch(modalGallerySource, /chronicler-required|chronicler-edit|deck-drawer-(?:player|host)|settings-(?:normal|tutorial|journey)|confirmation-(?:return|interrupted|restart)|outcome-(?:victory|defeat)/u);
  assert.match(modalGallerySource, /<strong>Dónde se usa<\/strong>/u);
  assert.match(modalGallerySource, /<OpeningHandModal/u);
  assert.match(modalGallerySource, /<HandLimitModal/u);
  assert.match(modalGallerySource, /<GuidedTutorialDialog/u);
  assert.match(modalGallerySource, /<GameOutcomeDialog/u);
  assert.match(modalGallerySource, /Los resultados omiten su secuencia visual/u);
  assert.doesNotMatch(modalGallerySource, /from\s+["'][^"']*(?:dev\/mockups|playground|audio-lab|seed-explorer|Animator|Vfx|vfx|three)[^"']*["']/u);
  assert.match(guidedOverlaySource, /<GuidedTutorialDialog/u);
  assert.match(guidedDialogSource, /guided-tutorial-callout-mark/u);
  assert.doesNotMatch(confirmationSource, /game-dialog-icon|game-dialog-kicker|kicker:/u);
  assert.match(destinyDialogSource, /destiny-dialog-controls[\s\S]*?destiny-dialog-kicker[\s\S]*?destiny-dialog-actions/u);
  assert.match(destinyDialogSource, /destiny-dialog hf-ui-panel w-full max-w-\[620px\]/u);
  assert.match(destinyDialogSource, /destiny-dialog-controls[\s\S]*?destiny-dialog-copy[\s\S]*?destiny-dialog-close[\s\S]*?destiny-dialog-kicker/u);
  assert.doesNotMatch(destinyDialogSource, /destiny-dialog-(?:watermark|future-plate|narrative|rift|heading)|destiny\.dialog(?:Body|Consequence)|<h2/u);
  assert.match(destinyDialogSource, /querySelector\(":scope > \.temporal-backdrop"\)/u);
  assert.match(destinyDialogSource, /document\.body\.classList\.add\("is-destiny-dialog-open"\)/u);
  assert.match(destinyDialogSource, /classList\.toggle\("is-destiny-dialog-closing", modalPresence\.closing\)/u);
  assert.match(destinyDialogSource, /useAnimatedPresence\(open, 480\)/u);
  assert.match(destinyDialogSource, /<DestinyActionButton[\s\S]*?className="destiny-dialog-primary"[\s\S]*?destiny-dialog-secondary/u);
  assert.match(destinyActionSource, /"destiny-command-button", "learn-to-play-contemplate-button"/u);
  assert.match(destinyDialogSource, /destiny-dialog-kicker" aria-label=[^>]*>\{futureCode\}<\/span>/u);
  assert.match(gameStyles, /\.destiny-dialog-kicker \{[^}]*left: 50%;[^}]*width: min\(920px, calc\(100vw - 32px\)\);[^}]*margin: -82px 0 92px;[^}]*font-size: clamp\(92px, 14vw, 146px\);[^}]*padding: 0;[^}]*text-align: center;[^}]*transform: translateX\(-50%\);/su);
  assert.doesNotMatch(gameStyles.match(/\.destiny-dialog-kicker \{[^}]*\}/su)?.[0] ?? "", /mask-image/u);
  assert.match(gameStyles, /\.destiny-dialog-controls \{[^}]*position: fixed;[^}]*top: calc\(50% - 235px\);[^}]*left: min\(calc\(50% \+ 305px\), calc\(100% - 82px\)\);[^}]*opacity: 0\.68;/su);
  assert.match(destinyDialogSource, /<GameTooltip content=\{t\("destiny\.copyIdentity"\)\} side="bottom">[\s\S]*?className="destiny-dialog-copy"/u);
  assert.doesNotMatch(destinyDialogSource, /data-tooltip/u);
  assert.doesNotMatch(gameStyles, /\.destiny-dialog-copy::after/u);
  assert.doesNotMatch(gameStyles, /\.destiny-dialog-primary::before\s*\{[^}]*animation-direction:\s*reverse/u);
  assert.match(gameStyles, /\.destiny-dialog-secondary \{[^}]*border: 0;[^}]*background: transparent;[^}]*font-size: 9px;/su);
  assert.match(temporalBackdropSource, /const presentedDial = dialMix - destinyMix \* 180;[\s\S]*?positionDial\(presentedDial\)/u);
  assert.match(temporalBackdropSource, /uprightTemporalDialLabelTransform\(degrees, DIAL_LABELS\[index\]\)/u);
  assert.match(temporalBackdropShaderSource, /uniform float uDestiny;[\s\S]*?vec2 destinyFlow = vec2\(-uTime \* 0\.042, 0\.0\);[\s\S]*?mix\(surgeFlow, destinyFlow, uDestiny\)/u);
  assert.doesNotMatch(gameStyles, /\.game-screen-ambience::after|destiny-gold-atmosphere/u);
  assert.doesNotMatch(gameStyles, /\.destiny-dialog \.destiny-dialog-primary(?:\s|:|\{)/u);
  assert.match(gameStyles, /body\.is-destiny-dialog-open \.game-screen > \*:not\(:where\(\.temporal-backdrop, \.game-screen-ambience, \.game-command-bar\)\)/u);
  assert.match(gameStyles, /\.destiny-dialog \{[^}]*border: 0 !important;[^}]*background: transparent !important;[^}]*box-shadow: none !important;/su);
  assert.doesNotMatch(gameStyles, /\.destiny-dialog-backdrop::before/u);
  assert.doesNotMatch(gameStyles, /\.destiny-dialog-(?:rift|heading)/u);
  assert.doesNotMatch(destinyDialogSource, /destiny-dialog-sigil/u);
  assert.match(handLimitSource, /hand-limit-mark[\s\S]*?hand-limit-heading[\s\S]*?hand-limit-actions/u);
  assert.doesNotMatch(handLimitSource, /hand\.endPhaseCount|hand-limit-icon/u);
  assert.match(handLimitSource, /counter-target-button counter-target-cancel[\s\S]*?counter-target-button counter-target-confirm/u);
  assert.match(handLimitSource, /hand-limit-layer pointer-events-none[\s\S]*?hand-limit-panel pointer-events-auto/u);
  assert.match(learnIntroSource, /<GuidedTutorialDialog/u);
  assert.match(learnIntroSource, /learn-to-play-intro-progress/u);
  assert.doesNotMatch(learnIntroSource, /old-panel|old-title|game-home-dialog/u);

  assert.match(mainSource, /import "\.\/ui-system\.css"/u);
  assert.match(runtimeStyles, /\.hf-ui-panel,/u);
  assert.match(runtimeStyles, /\.hf-ui-button/u);
  assert.match(runtimeStyles, /\.expedition-begin,[\s\S]*?\.game-dialog-action-primary,[\s\S]*?\.guided-tutorial-continue/u);
  assert.match(referenceStyles, /--ui-reference-font: "Segoe UI"/u);
  assert.match(referenceStyles, /\.ui-reference-topbar \{[\s\S]*?min-height: 68px;[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);/u);
  assert.match(referenceStyles, /\.ui-reference-specimen-stage \{[\s\S]*?font-family: var\(--hf-ui-font-body\);/u);
  assert.doesNotMatch(referenceStyles, /(^|\n)(?:body|:root|\.game-screen|\.old-panel|\.hf-ui-panel)\s*\{/u);
  assert.match(gameStyles, /\.hand-limit-mark\s*\{[\s\S]*?transform: rotate\(45deg\);/u);
  assert.match(gameStyles, /\.hand-limit-layer \{[\s\S]*?padding: 16px 16px clamp\(104px, 18vh, 184px\);/u);
  assert.match(gameStyles, /\.learn-to-play-intro-overlay\s*\{[\s\S]*?backdrop-filter: blur\(10px\)/u);
  assert.match(gameStyles, /\.game-tooltip-top::after \{[\s\S]*?border-right: 1px solid[\s\S]*?border-bottom: 1px solid/u);
  assert.match(gameStyles, /\.game-tooltip-bottom::after \{[\s\S]*?border-top: 1px solid[\s\S]*?border-left: 1px solid/u);

  const ids = UI_REFERENCE_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(UI_REFERENCE_CATALOG.length >= 25);
  assert.equal(UI_REFERENCE_CATALOG.some((entry) => /CardContextMenu|CardDetailsModal/u.test(entry.component)), false);
  for (const modalId of [
    "chronicler-name-modal",
    "setup-deck-drawer",
    "settings-menu-modal",
    "destiny-rewrite-dialog",
    "game-confirmation-dialog",
    "opening-hand",
    "hand-limit-modal",
    "graveyard-viewer-modal",
    "graveyard-details-modal",
    "deck-inspector-details-modal",
    "learn-intro",
    "guided-tutorial-dialog",
    "game-outcome-dialog",
    "learn-defeat-outcome-dialog",
    "learn-defeat-narrative-dialog",
  ]) {
    assert.ok(ids.includes(modalId), `${modalId} must be inventoried individually`);
  }
  for (const entry of UI_REFERENCE_CATALOG) {
    assert.ok(entry.component.length > 0, `${entry.id} must name its component`);
    assert.match(entry.source, /^src\//u, `${entry.id} must point to runtime source`);
    assert.ok(entry.usedIn.length > 0, `${entry.id} must say where it is used`);
    assert.ok(["canonical", "product-variant", "context-only"].includes(entry.status));
  }
});

test("Tribute source selection portals only its arrow above Energy and keeps its focused UI elevated", () => {
  const overlaySource = readFileSync(new URL("../src/components/TributeOfTheFourSorrowsSelectionOverlay.tsx", import.meta.url), "utf8");
  const battlefieldSource = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(overlaySource, /import \{ createPortal \} from "react-dom";/u);
  assert.match(overlaySource, /return \(\s*<>\s*<div[^>]*className="counter-target-backdrop"[^>]*\/>\s*\{createPortal\(\s*<svg[^>]*z-\[111\][^>]*>/u);
  assert.match(overlaySource, /<svg[\s\S]*?<\/svg>,\s*document\.body,\s*\)\}/u);
  assert.doesNotMatch(battlefieldSource, /mana-core-target-label/u);
  assert.doesNotMatch(stylesSource, /\.mana-core-target-label/u);
});

test("manual Invoked targeting reveals and exposes battlefield targets behind its source card", () => {
  const overlaySource = readFileSync(new URL("../src/components/CounterTargetingOverlay.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(overlaySource, /shouldRevealOverlappedTargets/u);
  assert.match(overlaySource, /targetCandidates\(game, source\.controller, requirement\)/u);
  assert.match(overlaySource, /findBattlefieldSlot\(targetId\)\?\.getBoundingClientRect\(\)/u);
  assert.match(overlaySource, /data-source-overlap=\{sourceRevealsTargets \? "true" : undefined\}/u);
  assert.match(stylesSource, /\.counter-target-source-panel\[data-source-overlap="true"\] \{[^}]*pointer-events: none;/su);
  assert.match(stylesSource, /\.counter-target-source-panel\[data-source-overlap="true"\] \.counter-target-source-card \{[^}]*opacity: 0\.34;/su);
});
