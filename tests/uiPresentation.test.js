import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { activeDefenseArrowLinks, isBehindInStackOrder, isFrontOfCardStack, visibleDefenseArrowLinks } from "../src/components/battlefieldLayout";
import { remainingArchiveDiscardPreview } from "../src/components/hostArchiveCounter";
import { memoryCardsNewestFirst, newestMemoryCard } from "../src/components/memoryPresentation";
import { CardTraitTooltipBadge } from "../src/components/Card";
import { CardTraitIcon } from "../src/components/CardTraitIcon";
import { PreviewStatsBadge, TraitPills } from "../src/components/CardPreview";
import { cardLabelCamelCase } from "../src/i18n/cardLocalization";
import { resolvePersonalAttackAnimation, resolvePersonalCombatAnimation } from "../src/store/combatAnimation";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("the Host Archive counter counts attack discards down without displaying zero", () => {
  assert.equal(remainingArchiveDiscardPreview(7, 0), 7);
  assert.equal(remainingArchiveDiscardPreview(7, 1), 6);
  assert.equal(remainingArchiveDiscardPreview(7, 6), 1);
  assert.equal(remainingArchiveDiscardPreview(7, 7), undefined);
  assert.equal(remainingArchiveDiscardPreview(0, 0), undefined);
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
      scale: 1.5,
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
      scale: 1.5,
      amount: 6,
      sourceMoves: false,
    },
  });
  assert.equal(resolvePersonalAttackAnimation(customCard("ordinary-attacker", "player"), 1), undefined);
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
