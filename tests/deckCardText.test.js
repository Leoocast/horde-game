import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  cardThemeForDefinition,
  shouldShowFullCardImage,
  useCardDetails,
  usesFullArtCardImage,
} from "../src/utils/cardImages";
import {
  BATTLEFIELD_ART_VIEWPORT,
  battlefieldArtCssVariables,
  battlefieldArtSourceCssVariables,
} from "../src/utils/battlefieldArtFrame";
import { cardStatFrameCssVariables } from "../src/utils/cardStatFrame";
import {
  STUDIO_DECKS,
  buildStudioCards,
  generatedGameArtData,
  generatedStudioData,
  loadStudioConfig,
  normalizeBattlefieldArtFrame,
  resolveStudioFullArt,
  resolveStudioHeaderFade,
  studioGameArt,
  studioSourceFiles,
  syncStudioData,
} from "../scripts/card-studio-data.mjs";

function loadDeckCardTextFormatter() {
  const source = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-text.js", import.meta.url),
    "utf8",
  );
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.HostfallCardText.formatEffectText;
}

test("deck card text consistently highlights gameplay terms and separates abilities", () => {
  const formatEffectText = loadDeckCardTextFormatter();
  const captain = formatEffectText(
    "Toque mortal. Los demás Zombies de la Horda obtienen +1/+1. "
      + "Siempre que otro Zombie de la Horda muera, el jugador pierde 1 vida.",
  );
  const tokenMaker = formatEffectText(
    "Pon un contador +1/+1 sobre esta criatura y luego crea dos Trasgos 1/1 atacando.",
  );
  const fightSpell = formatEffectText(
    "Una criatura aliada obtiene +1/+2 hasta el final del turno y luego lucha contra una criatura enemiga.",
  );
  const gallows = formatEffectText(
    "Siempre que se lance una carta que no sea ficha, quita un contador +1/+1 de esta criatura y crea un Zombie 2/2.",
  );
  const invokedToken = formatEffectText("Invoca un Eco Ficha Zombi 2/2.");
  const variableTokenWave = formatEffectText(
    "Luego Invoca tantos Ecos Ficha Trasgo 1/1 atacando como su Fuerza.",
  );
  const namedTokenWave = formatEffectText(
    "Luego Invoca esa cantidad de Esbirros de Varka atacando.",
  );
  const previewStates = formatEffectText("Un Eco Marcado y Aturdido permanece Atado.");
  const raidBombardment = formatEffectText(
    "Cada Trasgo atacante con fuerza 2 o menos agrega 1 de daño a la salva.",
  );
  const lifeCost = formatEffectText(
    "Coste adicional: Paga 5 de Vida.\nRoba 2 cartas.",
  );
  const fractionalLifeCost = formatEffectText(
    "Coste adicional: Paga la mitad de tu Vida.",
  );
  const inlineTraits = formatEffectText(
    "Volar. Drenar. Alerta.\nCoste adicional: Paga la mitad de tu Vida.",
  );
  const numberedTrait = formatEffectText("Letal\nVeneno 1");
  const repeatedEnergy = formatEffectText("Gana {E}{E}.", {
    energyIconHtml: '<span class="energy-icon"></span>',
  });
  const exhaustAction = formatEffectText("Agota: Gana {E}.", {
    energyIconHtml: '<span class="energy-icon"></span>',
  });
  const acolyteCost = formatEffectText(
    "{{T}} y paga 5 de Vida: Gana {E}.",
    {
      tapIconHtml: '<span class="tap-icon"></span>',
      energyIconHtml: '<span class="energy-icon"></span>',
    },
  );

  assert.match(captain, /class="effect-keyword">Toque mortal<\/strong>/);
  assert.match(captain, /class="effect-stat">\+1\/\+1<\/strong>/);
  assert.equal((captain.match(/class="effect-paragraph"/g) ?? []).length, 3);

  assert.match(tokenMaker, /class="effect-counter">un contador \+1\/\+1<\/strong>/);
  assert.match(tokenMaker, /class="effect-token">crea dos Trasgos 1\/1 atacando<\/strong>/);
  assert.equal((tokenMaker.match(/class="effect-paragraph"/g) ?? []).length, 2);

  assert.match(fightSpell, /class="effect-stat">\+1\/\+2<\/strong>/);
  assert.equal((fightSpell.match(/class="effect-paragraph"/g) ?? []).length, 2);

  assert.match(gallows, /y <strong class="effect-token">crea un Zombie 2\/2<\/strong>/);
  assert.equal((gallows.match(/class="effect-paragraph"/g) ?? []).length, 1);
  assert.match(
    invokedToken,
    /class="effect-token">Invoca un Eco Ficha Zombi 2\/2<\/strong>/,
  );
  assert.match(
    variableTokenWave,
    /class="effect-token">Invoca tantos Ecos Ficha Trasgo 1\/1 atacando<\/strong>/,
  );
  assert.match(
    namedTokenWave,
    /class="effect-token">Invoca esa cantidad de Esbirros de Varka atacando<\/strong>/,
  );
  assert.equal((previewStates.match(/class="effect-state"/g) ?? []).length, 3);

  assert.match(raidBombardment, /class="effect-danger">fuerza 2 o menos<\/strong>/);
  assert.match(raidBombardment, /class="effect-danger">1 de daño<\/strong>/);
  assert.match(lifeCost, /class="effect-life-cost">Paga 5 de Vida\.<\/strong>/);
  assert.match(lifeCost, /Coste adicional: <strong class="effect-life-cost">Paga 5 de Vida\.<\/strong>/);
  assert.equal((lifeCost.match(/class="effect-paragraph"/g) ?? []).length, 2);
  assert.match(
    fractionalLifeCost,
    /Coste adicional: <strong class="effect-life-cost">Paga la mitad de tu Vida\.<\/strong>/,
  );
  assert.match(
    inlineTraits,
    /class="effect-keyword">Volar<\/strong>\. <strong class="effect-keyword">Drenar<\/strong>\. <strong class="effect-keyword">Alerta<\/strong>\./,
  );
  assert.match(
    numberedTrait,
    /class="effect-keyword">Veneno <span class="effect-keyword-value">1<\/span><\/strong>/,
  );
  assert.equal((repeatedEnergy.match(/class="energy-icon"/g) ?? []).length, 2);
  assert.doesNotMatch(repeatedEnergy, /Gana\s+\d/u);
  assert.match(exhaustAction, /<strong class="effect-action">Agota<\/strong>:/u);
  assert.equal((inlineTraits.match(/class="effect-paragraph"/g) ?? []).length, 2);
  assert.match(acolyteCost, /<span class="tap-icon"><\/span> y <strong class="effect-life-cost">paga 5 de Vida<\/strong>:/);
  assert.match(acolyteCost, /Gana <span class="energy-icon"><\/span>\./);
  assert.equal((acolyteCost.match(/class="effect-paragraph"/g) ?? []).length, 1);
});

test("local Vampire studio art paths resolve to real files", () => {
  const indexUrl = new URL("../dev/tools/Decks/court_of_the_crimson_eclipse/index.html", import.meta.url);
  for (const card of buildStudioCards("court_of_the_crimson_eclipse")) {
    assert.doesNotMatch(card.art_crop, /^https?:/iu, `${card.id} still uses remote art`);
    assert.ok(
      fs.existsSync(new URL(card.art_crop, indexUrl)),
      `${card.id} points to missing art: ${card.art_crop}`,
    );
  }
});

test("card studios consume one generated projection instead of embedded or mirrored data", () => {
  assert.deepEqual(syncStudioData({ check: true }), []);

  for (const [deckId, definition] of Object.entries(STUDIO_DECKS)) {
    const indexUrl = new URL(`../${definition.directory}/index.html`, import.meta.url);
    const generatedUrl = new URL(`../${definition.directory}/deck-data.generated.js`, import.meta.url);
    const indexHtml = fs.readFileSync(indexUrl, "utf8");
    assert.match(indexHtml, /<script src="\.\/deck-data\.generated\.js"><\/script>/u);
    assert.match(
      indexHtml,
      /<script src="\.\.\/deck-card-studio\.js"><\/script>/u,
      `${deckId} must use the shared studio renderer`,
    );
    assert.match(
      indexHtml,
      /<link rel="stylesheet" href="\.\.\/deck-card-studio\.css">/u,
      `${deckId} must use the shared final card design`,
    );
    assert.doesNotMatch(
      indexHtml,
      /(?:pact-of-elarion|hunters)\.css/u,
      `${deckId} must not load a per-deck card stylesheet`,
    );
    assert.doesNotMatch(indexHtml, /id="deck-data"|const deckData = \[/u);
    assert.equal(fs.readFileSync(generatedUrl, "utf8"), generatedStudioData(deckId));

    const { config } = loadStudioConfig(deckId);
    if (!config.previewOnly) {
      assert.ok(config.runtimeDeck, `${deckId} must derive rules from a runtime deck`);
      assert.equal(
        config.cards.some((card) => Object.hasOwn(card, "rulesTextEs")),
        false,
        `${deckId} duplicates runtime rules in presentation data`,
      );
      assert.equal(
        config.cards.some((card) => Object.hasOwn(card, "flavorTextEs") || Object.hasOwn(card, "lore")),
        false,
        `${deckId} duplicates runtime flavor in presentation data`,
      );

      const runtimeDeck = JSON.parse(fs.readFileSync(new URL(config.runtimeDeck, indexUrl), "utf8"));
      const runtimeById = new Map(runtimeDeck.cards.map((card) => [card.id, card]));
      for (const studioCard of buildStudioCards(deckId)) {
        const runtimeCard = runtimeById.get(studioCard.id);
        assert.ok(runtimeCard, `${deckId}/${studioCard.id} is missing from the runtime deck`);
        assert.equal(studioCard.lore, runtimeCard.flavorText.es, `${deckId}/${studioCard.id} has stale flavor`);
        assert.equal(
          studioCard.showFlavorText,
          runtimeCard.showFlavorText,
          `${deckId}/${studioCard.id} has a stale flavor visibility flag`,
        );
      }
    }
  }

  const sharedRenderer = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.js", import.meta.url),
    "utf8",
  );
  assert.match(sharedRenderer, /card\.showFlavorText !== false/u);

  const hiddenFlavor = buildStudioCards("court_of_the_crimson_eclipse").find((card) => card.id === "duelist_of_the_eclipse");
  assert.ok(hiddenFlavor?.lore, "hidden flavor must remain in generated studio data");
  assert.equal(hiddenFlavor.showFlavorText, false);

});

test("runtime deck studios use the same minimal header presentation", () => {
  const pactOfElarionIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/pact_of_elarion/index.html", import.meta.url),
    "utf8",
  );
  const vampireIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/court_of_the_crimson_eclipse/index.html", import.meta.url),
    "utf8",
  );
  const zombieIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/uprising_of_the_graveless/index.html", import.meta.url),
    "utf8",
  );
  const goblinIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/legion_of_varka/index.html", import.meta.url),
    "utf8",
  );
  const hunterIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/hunters/index.html", import.meta.url),
    "utf8",
  );
  const retiredHeaderUi = /(?:studio-kicker|studio-toolbar|studio-status|export-btn|exportación HD|Cartas HD|alta resolución|976×1360|Preview visual|antes de exportar)/iu;

  for (const [label, indexHtml] of [
    ["El Pacto de Elarion", pactOfElarionIndex],
    ["Vampires", vampireIndex],
    ["Zombies", zombieIndex],
    ["Goblins", goblinIndex],
    ["Hunters", hunterIndex],
  ]) {
    assert.match(indexHtml, /<header class="studio-header">/u, `${label} is missing the shared header`);
    assert.match(indexHtml, /class="studio-title"/u, `${label} is missing its title`);
    assert.match(indexHtml, /class="studio-subtitle"/u, `${label} is missing its thematic subtitle`);
    assert.doesNotMatch(indexHtml, retiredHeaderUi, `${label} exposes retired studio controls or export copy`);
  }

  assert.match(
    vampireIndex,
    /<main class="cards-grid scale-35" id="cards-container"><\/main>/u,
    "Vampires must open at 35%",
  );
});

test("Card Studio removes preview chrome and focus-mode overflow", () => {
  const studioApp = fs.readFileSync(
    new URL("../dev/tools/Decks/studio.js", import.meta.url),
    "utf8",
  );
  const studioShell = fs.readFileSync(
    new URL("../dev/tools/Decks/studio.html", import.meta.url),
    "utf8",
  );
  const studioServer = fs.readFileSync(
    new URL("../dev/tools/Decks/studio-server.cjs", import.meta.url),
    "utf8",
  );

  assert.match(studioApp, /\.studio-header \{ display: none !important; \}/u);
  assert.match(studioApp, /html\.studio-focus, body\.studio-focus \{ overflow: hidden !important; \}/u);
  assert.match(studioApp, /doc\.documentElement\.classList\.toggle\("studio-focus"/u);
  assert.doesNotMatch(studioApp, /\.tcg-card\.studio-selected\s*\{[^}]*outline:/u);
  assert.doesNotMatch(studioApp, /\{ key: "gem"/u, "the motif editor must not expose the plain cost orb");
  assert.match(
    studioApp,
    /label: "Zoom", value: values\.zoom, min: 0\.2, max: 4/u,
    "every motif slot must allow zooming below 100%",
  );
  assert.match(studioApp, /label: "Rotación", value: values\.rotation/u);
  assert.doesNotMatch(studioApp, /hint:/u, "motif panels must not include helper copy");
  assert.doesNotMatch(studioShell, /El motivo es la textura del mazo/u);
  assert.match(studioShell, /id="full-art-toggle"/u);
  assert.match(studioShell, /id="header-fade-toggle"/u);
  assert.match(studioShell, /id="game-preview"/u);
  assert.match(studioShell, /id="game-art-controls"/u);
  assert.match(
    studioShell,
    /\.game-preview-wrap\s*\{[^}]*width:\s*212px;[^}]*max-width:\s*100%;/u,
    "the Studio game preview must use the battlefield card's real display width",
  );
  assert.match(
    studioShell,
    /\.game-preview-title\s*\{[^}]*background:\s*linear-gradient\(90deg, var\(--game-title-start\) 0%, var\(--game-title-end\) 65%, var\(--game-title-end\) 100%\);/u,
    "the Studio cropped-card header must remain opaque across its full width",
  );
  assert.match(studioApp, /fullArtOverrides/u);
  assert.match(studioApp, /headerFadeOverrides/u);
  assert.match(studioApp, /battlefieldArtFrames/u);
  assert.match(
    studioApp,
    /gamePreviewImage\.naturalWidth[\s\S]*--game-art-source-width/u,
    "the Studio crop must size the complete source image before applying its frame",
  );
  assert.match(
    studioApp,
    /function versionedArtUrl\(url, id, targetDeckId = deckId\)/u,
    "uploaded Studio art needs a temporary cache-busting URL",
  );
  assert.match(
    studioApp,
    /versionedArtUrl\(current\.battlefieldArtUrl, cardId\)/u,
    "the cropped-card preview must refresh after replacing its source image",
  );
  assert.match(
    studioApp,
    /art_crop: versionedArtUrl\(entry\.art_crop, entry\.id\)/u,
    "the printable card preview must refresh after replacing its source image",
  );
  assert.match(
    studioApp,
    /thumb\.style\.backgroundImage = `url\("\$\{versionedArtUrl\(/u,
    "the card-list thumbnail must refresh after replacing its source image",
  );
  assert.match(
    studioApp,
    /markArtUploaded\(targetDeckId, targetCardId\);\s*await loadDecks\(true\);/u,
    "a successful upload must invalidate the previous image before repainting the Studio",
  );
  assert.match(studioServer, /fullArtOverrides: true/u);
  assert.match(studioServer, /headerFadeOverrides: true/u);
  assert.match(studioServer, /battlefieldArtFrames: true/u);
  assert.match(
    studioServer,
    /path\.resolve\(ROOT, 'public', `\.\$\{decoded\}`\)/u,
    "Card Studio must serve Vite-style /cards URLs from public/",
  );
  assert.match(studioShell, /<span class="info-label">ID<\/span>/u);
  assert.match(studioShell, /#status:empty\s*\{[^}]*display:\s*none;/u);
  assert.doesNotMatch(studioShell, /(?:ID impreso|list-foot|stage-help|Arrastra para mover)/iu);
});

test("card generators print the Hostfall copyright footer", () => {
  const sharedStudio = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.js", import.meta.url),
    "utf8",
  );

  assert.match(sharedStudio, /© 2026 HOSTFALL/u, "shared studio is missing the year-first copyright footer");
  assert.match(sharedStudio, /tcg-art-credit/u, "shared studio is missing the explicit art credit");
  assert.match(sharedStudio, /tcg-full-art-footer/u, "full-art cards are missing printable metadata");
  assert.match(sharedStudio, /tcg-art-credit-icon/u, "shared studio is missing the illustration icon");
  assert.match(sharedStudio, /aria-label="Ilustración:/u, "shared studio does not label the artist's role accessibly");
  assert.doesNotMatch(sharedStudio, /Hostfall TCG/iu, "shared studio still prints the retired footer");
});

test("the shared printed design keeps the approved compact geometry", () => {
  const sharedCss = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.css", import.meta.url),
    "utf8",
  );
  const runtimeCss = fs.readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const sharedStudio = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.js", import.meta.url),
    "utf8",
  );

  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-head\s*\{[^}]*top:\s*32px;[^}]*height:\s*74px;/u,
    "the common header must stay centered on the cost at type-band height",
  );
  assert.match(
    sharedCss,
    /\.tcg-cost-gem\s*\{[^}]*top:\s*30\.5px;[^}]*left:\s*31px;[^}]*width:\s*77px;[^}]*height:\s*77px;/u,
    "common and full-art cards must share one printed cost position and size",
  );
  assert.doesNotMatch(
    sharedCss,
    /\.tcg-card--(?:common|full-art) \.tcg-cost-gem\s*\{/u,
    "card variants must not override the shared printed cost geometry",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-head\s*\{[^}]*top:\s*30\.5px;[^}]*right:\s*31px;[^}]*left:\s*31px;[^}]*padding-left:\s*96px;/u,
    "the full-art title row must align with the shared cost geometry",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-seal\s*\{[^}]*width:\s*77px;[^}]*height:\s*77px;[^}]*flex:\s*0 0 77px;/u,
    "the full-art top-right seal must mirror the cost orb",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-typeband\s*\{[^}]*min-height:\s*74px;/u,
    "the common type band must match the header height",
  );
  assert.match(
    sharedCss,
    /\.tcg-title\s*\{[^}]*text-transform:\s*capitalize;/u,
    "printed card names must use initial capitals per word",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-title\s*\{[^}]*font:\s*700 37px\/1\.08 "Lora", serif;/u,
    "common card names must use a mixed-case serif instead of Cinzel small caps",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-title\s*\{[^}]*font:\s*700 42px\/1\.06 "Lora", serif;/u,
    "full-art card names must use the same mixed-case serif",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-typeband\s*\{[^}]*text-transform:\s*capitalize;/u,
    "printed card types must use initial capitals per word",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-typeband\s*\{[^}]*font:\s*700 28px\/1\.1 "Lora", serif;/u,
    "common card types must render real lowercase glyphs",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-typeband\s*\{[^}]*text-transform:\s*capitalize;/u,
    "full-art card types must use initial capitals per word",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-typeband\s*\{[^}]*font:\s*700 26px\/1\.1 "Lora", serif;/u,
    "full-art card types must render real lowercase glyphs",
  );
  assert.match(
    runtimeCss,
    /\.card-visual\.card-image-full > \.card-stat-badge\.is-buffed:not\(\.is-damaged\),/u,
    "the full-card buff palette must not override the damaged palette",
  );
  assert.match(
    runtimeCss,
    /\.battlefield-row-overflow \.card-visual\.card-image-native-hd > \.card-stat-badge\.is-buffed:not\(\.is-damaged\)\s*\{/u,
    "the cropped-card buff palette must not override the damaged palette",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-copy\s*\{[^}]*justify-content:\s*center;/u,
    "common card copy must remain vertically centered",
  );
  assert.doesNotMatch(sharedCss, /motif-gem/u, "the cost orb must not render a motif");
  assert.match(sharedStudio, /&& !isEnergy;/u, "Energy cards must not print a cost orb");
  assert.match(sharedStudio, /hasEffect && !isToken && !isEnergy/u, "Energy cards must not print rules");
  assert.match(sharedStudio, /hasLore && !isToken && !isEnergy/u, "Energy cards must not print lore");
  assert.match(
    sharedStudio,
    /const coverScale = Math\.max\(CARD_WIDTH \/ sourceWidth, CARD_HEIGHT \/ sourceHeight\)/u,
    "art zoom must operate on the complete source image instead of a pre-cropped cover box",
  );
  assert.match(sharedCss, /\.tcg-art-image\.tcg-art-image--positioned/u);
  assert.match(sharedCss, /\.tcg-card--common\.tcg-card--no-header-fade \.tcg-card-veil/u);
  assert.match(sharedStudio, /headerFadeClass/u);
  assert.match(
    sharedCss,
    /@font-face\s*\{[^}]*font-family:\s*"Lora";[^}]*font-weight:\s*400 700;[^}]*lora-normal-latin\.woff2/u,
    "the Studio must expose Lora's real weight range instead of synthesizing bold text",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-effect\s*\{[^}]*font:\s*400 43px\/1\.35 "Lora", serif;/u,
    "common-card rules text must use the regular weight",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--full-art \.tcg-effect\s*\{[^}]*font:\s*400 39px\/1\.36 "Lora", serif;/u,
    "full-art rules text must use the regular weight",
  );
  assert.match(
    sharedCss,
    /\.tcg-effect strong,[\s\S]*?\.effect-stat\s*\{[^}]*font-weight:\s*600;/u,
    "highlighted rules terms must remain distinct without using bold text",
  );
  assert.match(
    sharedCss,
    /\.tcg-art-credit-name\s*\{[^}]*font:\s*italic 500 24px\/1 "Lora", Georgia, serif;/u,
    "the artist credit must remain slightly larger than its original 22px size",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-card-frame\s*\{[^}]*padding:\s*18px;[^}]*linear-gradient\(180deg,\s*#536174 0%,\s*#414e60 42%,\s*#2d3948 72%,\s*#1b232e 100%\);[^}]*inset 0 0 15px rgba\(0, 0, 0, 0\.9\);/u,
    "common cards must keep the approved historical blue-steel frame",
  );
  assert.match(
    sharedCss,
    /\.tcg-card--common \.tcg-card-frame::before,[\s\S]*?\.tcg-card--common \.tcg-card-frame::after\s*\{[^}]*content:\s*none;/u,
    "the blue-steel frame must not restore the later gold corner ornaments",
  );
  assert.match(
    runtimeCss,
    /\.card-visual\.card-image-full > \.card-stat-badge,[\s\S]*?right:\s*var\(--card-stat-right,\s*3\.28cqw\);[\s\S]*?bottom:\s*var\(--card-stat-bottom,\s*57\.79cqw\);[\s\S]*?height:\s*var\(--card-stat-height,\s*9\.32cqw\);[\s\S]*?min-width:\s*var\(--card-stat-width,\s*16\.19cqw\);/u,
    "hand and hover stats must cover the new printed tab above the common-card type band",
  );
  assert.match(
    runtimeCss,
    /--card-stat-separator:\s*#eadcad;/u,
    "the dynamic stat separator must use the printed card's gold palette",
  );
});

test("Act I print metadata stays sequential and credits Dean Spencer as artist", () => {
  const cards = [
    "pact_of_elarion",
    "uprising_of_the_graveless",
    "legion_of_varka",
    "court_of_the_crimson_eclipse",
  ].flatMap((deckId) => buildStudioCards(deckId));

  assert.equal(cards.length, 61);
  assert.deepEqual(
    cards.map((card) => card.collectorId),
    Array.from({ length: 61 }, (_, index) => `HFA1${String(index + 1).padStart(3, "0")}`),
  );
  assert.equal(cards.every((card) => card.artist === "Dean Spencer"), true);
});

test("Card Studio defaults full art to Chronicles, Energy and selected tokens", () => {
  const pactOfElarion = new Map(buildStudioCards("pact_of_elarion").map((card) => [card.id, card]));
  const courtOfTheCrimsonEclipse = new Map(buildStudioCards("court_of_the_crimson_eclipse").map((card) => [card.id, card]));
  const brokenForge = new Map(buildStudioCards("legion_of_varka").map((card) => [card.id, card]));
  const hollowBell = new Map(buildStudioCards("uprising_of_the_graveless").map((card) => [card.id, card]));
  const hunters = new Map(buildStudioCards("hunters").map((card) => [card.id, card]));

  assert.equal(pactOfElarion.get("aelyra_heir_of_elarion")?.isChronicle, true);
  assert.equal(pactOfElarion.get("aelyra_heir_of_elarion")?.fullArt, true);
  assert.equal(courtOfTheCrimsonEclipse.get("mirevna_countess_of_the_crimson_eclipse")?.isChronicle, true);
  assert.equal(courtOfTheCrimsonEclipse.get("mirevna_countess_of_the_crimson_eclipse")?.fullArt, true);
  assert.equal(brokenForge.get("varka_infernal_matriarch")?.isChronicle, true);
  assert.equal(brokenForge.get("varka_infernal_matriarch")?.fullArt, true);
  assert.equal(hunters.get("lyra_ojo_de_la_caceria")?.isChronicle, true);
  assert.equal(hunters.get("lyra_ojo_de_la_caceria")?.fullArt, true);

  assert.equal(pactOfElarion.get("river_of_elarion")?.isEnergy, true);
  assert.equal(pactOfElarion.get("river_of_elarion")?.fullArt, true);
  assert.equal(courtOfTheCrimsonEclipse.get("sanctuary_of_the_red_moon")?.isEnergy, true);
  assert.equal(courtOfTheCrimsonEclipse.get("sanctuary_of_the_red_moon")?.fullArt, true);
  assert.equal(hunters.get("territorio_de_caza")?.isEnergy, true);
  assert.equal(hunters.get("territorio_de_caza")?.fullArt, true);

  assert.equal(hollowBell.get("graveless_soldier")?.isToken, true);
  assert.equal(hollowBell.get("graveless_soldier")?.fullArt, true);
  assert.equal(hollowBell.get("graveless_titan")?.fullArt, true);
  assert.equal(brokenForge.get("varkas_minion")?.isToken, true);
  assert.equal(brokenForge.get("varkas_minion")?.fullArt, true);

  assert.equal(brokenForge.get("corrupted_war_bear")?.fullArt, undefined);
});

test("runtime full-art stats use the measured frame of each exported card", () => {
  const layout = JSON.parse(fs.readFileSync(
    new URL("../src/data/cardRuntimeLayout.generated.json", import.meta.url),
    "utf8",
  ));
  const exportedDecks = [
    "pact_of_elarion",
    "uprising_of_the_graveless",
    "legion_of_varka",
    "court_of_the_crimson_eclipse",
  ];

  for (const deckId of exportedDecks) {
    const measuredCards = layout.decks?.[deckId]?.cards ?? {};
    for (const card of buildStudioCards(deckId).filter((candidate) => candidate.fullArt)) {
      assert.equal(measuredCards[card.id]?.fullArt, true, `${deckId}/${card.id} is missing its full-art runtime layout`);
      if (card.atk !== null && card.atk !== undefined && card.def !== null && card.def !== undefined) {
        assert.deepEqual(
          Object.keys(measuredCards[card.id]?.statsFrame ?? {}).sort(),
          ["bottom", "height", "right", "width"],
          `${deckId}/${card.id} is missing its measured stats frame`,
        );
      }
    }
  }

  const iriaBottom = layout.decks.pact_of_elarion.cards.aelyra_heir_of_elarion.statsFrame.bottom;
  const countessBottom = layout.decks.court_of_the_crimson_eclipse.cards.mirevna_countess_of_the_crimson_eclipse.statsFrame.bottom;
  assert.notEqual(iriaBottom, countessBottom, "full-art text flow must be allowed to place stats per card");
  assert.equal(usesFullArtCardImage("aelyra_heir_of_elarion"), true);
  assert.equal(usesFullArtCardImage("mirevna_countess_of_the_crimson_eclipse"), true);
  assert.deepEqual(
    useCardDetails("aelyra_heir_of_elarion").statsFrame,
    layout.decks.pact_of_elarion.cards.aelyra_heir_of_elarion.statsFrame,
  );
  assert.deepEqual(
    cardStatFrameCssVariables({ right: 62, bottom: 421.594, width: 158, height: 91 }),
    {
      "--card-stat-right": `${(62 / 976) * 100}cqw`,
      "--card-stat-bottom": `${(421.594 / 976) * 100}cqw`,
      "--card-stat-width": `${(158 / 976) * 100}cqw`,
      "--card-stat-height": `${(91 / 976) * 100}cqw`,
    },
  );

  const cardImagesSource = fs.readFileSync(
    new URL("../src/utils/cardImages.ts", import.meta.url),
    "utf8",
  );
  const cardSource = fs.readFileSync(
    new URL("../src/components/Card.tsx", import.meta.url),
    "utf8",
  );
  const previewSource = fs.readFileSync(
    new URL("../src/components/CardPreview.tsx", import.meta.url),
    "utf8",
  );
  const runtimeCss = fs.readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const layoutMeasureSource = fs.readFileSync(
    new URL("../scripts/card-runtime-layout.mjs", import.meta.url),
    "utf8",
  );
  const exporterSource = fs.readFileSync(
    new URL("../dev/tools/Decks/export_cards.cjs", import.meta.url),
    "utf8",
  );
  assert.match(cardImagesSource, /cardRuntimeLayout\.generated\.json/u);
  assert.match(cardSource, /cardStatFrameCssVariables\(statsFrame\)/u);
  assert.match(previewSource, /cardStatFrameCssVariables\(details\.statsFrame\)/u);
  assert.match(runtimeCss, /right:\s*var\(--card-stat-right,\s*3\.28cqw\)/u);
  assert.match(runtimeCss, /bottom:\s*var\(--card-stat-bottom,\s*57\.79cqw\)/u);
  assert.match(layoutMeasureSource, /cardBounds\.bottom - statsBounds\.bottom/u);
  assert.match(exporterSource, /card-runtime-layout\.mjs/u, "card export must refresh runtime full-art frames");
  assert.match(exporterSource, /measureDeckRuntimeLayout\(page, deckId\)/u);
});

test("Card Studio allows a per-card full-art override", () => {
  assert.equal(resolveStudioFullArt("card", {}, true), true);
  assert.equal(resolveStudioFullArt("card", { fullArt: true }, false), true);
  assert.equal(resolveStudioFullArt("card", { fullArt: false }, true), false);
  assert.throws(
    () => resolveStudioFullArt("card", { fullArt: "yes" }, false),
    /fullArt debe ser booleano/u,
  );
});

test("Card Studio allows a per-card common header-fade override", () => {
  assert.equal(resolveStudioHeaderFade("card", {}, true), true);
  assert.equal(resolveStudioHeaderFade("card", { headerFade: true }, false), true);
  assert.equal(resolveStudioHeaderFade("card", { headerFade: false }, true), false);
  assert.throws(
    () => resolveStudioHeaderFade("card", { headerFade: "yes" }, true),
    /headerFade debe ser booleano/u,
  );
});

test("battlefield art framing is canonical, bounded and independent from print framing", () => {
  assert.deepEqual(BATTLEFIELD_ART_VIEWPORT, { width: 488, height: 434 });
  assert.equal(normalizeBattlefieldArtFrame("card", null), null);
  assert.equal(normalizeBattlefieldArtFrame("card", { zoom: 1, x: 0, y: 0 }), null);
  assert.deepEqual(
    normalizeBattlefieldArtFrame("card", { zoom: 1.25, x: 49, y: -24 }),
    { zoom: 1.25, x: 49, y: -24 },
  );
  assert.throws(
    () => normalizeBattlefieldArtFrame("card", { zoom: 4.01, x: 0, y: 0 }),
    /zoom debe estar entre 0\.2 y 4/u,
  );
  assert.throws(
    () => normalizeBattlefieldArtFrame("card", { zoom: 1, x: 489, y: 0 }),
    /x debe estar entre -488 y 488/u,
  );
  assert.deepEqual(
    battlefieldArtCssVariables({ zoom: 1.5, x: 48.8, y: -48.8 }),
    {
      "--battlefield-art-zoom": 1.5,
      "--battlefield-art-x": "10cqw",
      "--battlefield-art-y": "-10cqw",
    },
  );
  assert.deepEqual(
    battlefieldArtSourceCssVariables(600, 600),
    {
      "--battlefield-art-source-width": "100%",
      "--battlefield-art-source-height": `${(488 / 434) * 100}%`,
    },
    "zooming out a square battlefield image must reveal the complete source",
  );
  assert.deepEqual(
    battlefieldArtSourceCssVariables(1448, 1086),
    {
      "--battlefield-art-source-width": `${((1448 / 1086) / (488 / 434)) * 100}%`,
      "--battlefield-art-source-height": "100%",
    },
    "landscape battlefield art must start from a complete-image cover size",
  );

  const runtimeCards = [
    "pact_of_elarion",
    "uprising_of_the_graveless",
    "legion_of_varka",
    "court_of_the_crimson_eclipse",
  ].flatMap((deckId) => buildStudioCards(deckId));
  assert.equal(runtimeCards.length, 61);
  for (const card of runtimeCards) {
    const details = useCardDetails(card.id);
    assert.match(details.battlefieldArtUrl ?? "", /^\/cards\/.+\/art\//u);
    assert.match(details.imageUrl ?? "", /^\/cards\/.+\.png$/u);
  }

  const generated = JSON.parse(generatedGameArtData());
  assert.equal(Object.keys(generated.cards).length, 74);
  assert.match(studioGameArt("pact_of_elarion").veiled_dawn_flower.artUrl, /\/art\//u);

  for (const deckId of Object.keys(STUDIO_DECKS)) {
    const printSources = studioSourceFiles(deckId).map((source) => source.replaceAll("\\", "/"));
    assert.equal(printSources.some((source) => source.endsWith("/game-art.config.json")), false);
    assert.equal(
      printSources.some((source) => source.endsWith("/cardStudioGameArt.generated.json")),
      false,
    );
  }

  const battlefieldSource = fs.readFileSync(
    new URL("../src/components/Battlefield.tsx", import.meta.url),
    "utf8",
  );
  const cardSource = fs.readFileSync(
    new URL("../src/components/Card.tsx", import.meta.url),
    "utf8",
  );
  const runtimeCss = fs.readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  assert.match(
    battlefieldSource,
    /useBattlefieldArt=\{!compact && card\.kinds\.includes\("ECHO"\) && cropCreatureCards\}/u,
  );
  assert.match(
    cardSource,
    /requestedBattlefieldArtUrl\s*=\s*useBattlefieldArt\s*\? battlefieldArtUrl/u,
  );
  assert.match(
    cardSource,
    /requestedBattlefieldArtUrl && imageUrl && !failedImageUrls\.includes\(imageUrl\)/u,
    "a failed battlefield crop must fall back to the printed card instead of exposing a broken image",
  );
  assert.match(cardSource, /onError=\{\(event\) => \{/u);
  assert.match(cardSource, /card-battlefield-art-fallback/u);
  assert.match(cardSource, /battlefieldArtSourceCssVariables\(image\.naturalWidth, image\.naturalHeight\)/u);
  assert.match(
    cardSource,
    /\.\.\.\(usingBattlefieldArt \? battlefieldArtSourceStyle : \{\}\)/u,
    "the runtime crop must retain source geometry on the same container used by the Studio",
  );
  assert.doesNotMatch(
    cardSource,
    /image\.style\.setProperty/u,
    "React must own the runtime source geometry instead of mutating the image node imperatively",
  );
  assert.match(
    runtimeCss,
    /\.battlefield-row-overflow \.battlefield-card-slot\s*\{[^}]*height:\s*calc\(var\(--battlefield-card-width\) \* 0\.8893442623\);/u,
    "the runtime crop must use the exact 488x434 Studio viewport ratio",
  );
  assert.match(
    runtimeCss,
    /\.battlefield-row-overflow \.card-visual\.card-image-native-hd > \.card-stat-badge\s*\{[^}]*height:\s*31px;[^}]*min-width:\s*54px;[^}]*gap:\s*2\.4px;[^}]*padding:\s*0 5px;[^}]*background:\s*var\(--card-stat-ramp-background\);/u,
    "the cropped field badge must reuse the hover overlay proportions while retaining its field palette",
  );
  assert.match(
    runtimeCss,
    /--card-stat-ramp-background:[\s\S]*?linear-gradient\(180deg,\s*#305a38 0%,\s*#214329 54%,\s*#0a1c0e 100%\);/u,
    "the shared ramp palette must preserve the field badge tone",
  );
  assert.match(
    runtimeCss,
    /\.card-visual\.card-image-full > \.card-stat-badge,[\s\S]*?--card-stat-background:\s*var\(--card-stat-ramp-background\);/u,
    "hand and hover badges must inherit the field badge tone",
  );
  assert.match(
    runtimeCss,
    /\.card-battlefield-cropped:not\(\.card-battlefield-art-fallback\) > img\s*\{[^}]*clip-path:\s*none;/u,
    "the runtime crop must neutralize the full-card image clip used outside the battlefield",
  );
  assert.doesNotMatch(
    runtimeCss,
    /--card-cropped-title-gradient:[^;]*transparent/u,
    "cropped-card theme headers must not fade to transparency",
  );
  assert.doesNotMatch(
    runtimeCss,
    /\.card-cropped-title::(?:before|after)\s*\{[^}]*mask-image:/u,
    "the runtime cropped-card header layers must remain opaque across their full width",
  );
  assert.match(
    runtimeCss,
    /\.card-visual\.card-image-full\.card-layout-full-art\.card-theme-goblin > \.card-stat-badge:not\(\.is-damaged\):not\(\.is-buffed\),[\s\S]*?linear-gradient\(180deg,\s*#6f210f 0%,\s*#3a0e08 58%,\s*#211813 100%\);/u,
    "Legion full-art runtime stats must match the printed forged-red palette",
  );
});

test("Vampire studio cards stay aligned with the runtime deck", () => {
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL("../src/data/decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse.json", import.meta.url),
      "utf8",
    ),
  );
  const studioSources = [
    { label: "generated studio projection", cards: buildStudioCards("court_of_the_crimson_eclipse"), includesQuantity: true },
  ];
  const retiredStudioVocabulary = /(?:\b(?:Criaturas?|Conjuros?|Instantáneos?|Horda|Alcance|Vigilancia|vidas)\b|Robo de vida|Toque mortal|\{\{T\}\})/iu;
  const keywordLabels = {
    ALERT: "Alerta",
    DRAIN: "Drenar",
    FLYING: "Volar",
    LETHAL: "Letal",
    SKYGUARD: "Guardia aérea",
  };

  for (const runtimeCard of runtimeDeck.cards) {
    const rulesText = runtimeCard.gameText?.es === "Sin efecto adicional."
      ? []
      : [runtimeCard.gameText?.es];
    const keywordText = (runtimeCard.traits ?? []).map((keyword) => keywordLabels[keyword] ?? keyword);
    const expected = runtimeCard.id === "mirevna_countess_of_the_crimson_eclipse"
      ? [
          ...String(runtimeCard.gameText?.es ?? "").split("\n").slice(0, 1),
          `${keywordText.join(". ")}.`,
          ...String(runtimeCard.gameText?.es ?? "").split("\n").slice(1),
        ].filter(Boolean).join("\n")
      : [...keywordText, ...rulesText].filter(Boolean).join("\n");

    for (const source of studioSources) {
      const studioCard = source.cards.find((card) => card.id === runtimeCard.id);
      assert.ok(studioCard, `${source.label} is missing ${runtimeCard.id}`);
      assert.doesNotMatch(
        `${studioCard.tipo}\n${studioCard.desc}`,
        retiredStudioVocabulary,
        `${source.label} exposes retired vocabulary for ${runtimeCard.id}`,
      );
      assert.equal(studioCard.costo, runtimeCard.energyCost.amount, `${source.label} has a stale cost for ${runtimeCard.id}`);
      assert.equal(studioCard.atk, runtimeCard.power, `${source.label} has stale power for ${runtimeCard.id}`);
      assert.equal(studioCard.def, runtimeCard.endurance, `${source.label} has stale endurance for ${runtimeCard.id}`);
      if (source.includesQuantity) {
        assert.equal(studioCard.cantidad, runtimeCard.quantity, `${source.label} has a stale quantity for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "midnight_pact") {
        assert.equal(studioCard.tipo, "Hechizo", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "verdict_of_the_eclipse") {
        assert.equal(studioCard.tipo, "Hechizo · Rápido", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "mirevna_countess_of_the_crimson_eclipse") {
        assert.equal(studioCard.tipo, "Eco de Crónica — Vampiro Noble", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      assert.equal(
        normalizeVampireEffect(studioCard.desc),
        normalizeVampireEffect(expected),
        `${source.label} has stale rules for ${runtimeCard.id}`,
      );
    }
  }
});

test("El Pacto de Elarion studio cards use Hostfall vocabulary and stay aligned", () => {
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL(
        "../src/data/decks/player/pact_of_elarion/pact_of_elarion.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const studioSources = [
    { label: "generated studio projection", cards: buildStudioCards("pact_of_elarion") },
  ];
  const retiredStudioVocabulary = /(?:\b(?:Criaturas?|Conjuros?|Instantáneos?|Horda|Alcance|Agrega|entra|obtiene)\b|Robo de vida|Toque mortal|\{\{T\}\}|\{G\})/iu;
  const keywordLabels = {
    LETHAL: "Letal",
    SKYGUARD: "Guardia aérea",
  };

  for (const source of studioSources) {
    assert.equal(
      source.cards.length,
      runtimeDeck.cards.length,
      `${source.label} has a stale El Pacto de Elarion card count`,
    );
  }

  for (const runtimeCard of runtimeDeck.cards) {
    const rulesText = runtimeCard.gameText?.es === "Sin efecto adicional."
      ? []
      : [runtimeCard.gameText?.es];
    const keywordText = (runtimeCard.traits ?? [])
      .filter((trait) => trait !== "OVERFLOW" && !/^POISON_\d+$/u.test(trait))
      .map((keyword) => keywordLabels[keyword] ?? keyword);
    const poisonText = (runtimeCard.traits ?? [])
      .map((trait) => String(trait).match(/^POISON_(\d+)$/i)?.[1])
      .filter(Boolean)
      .map((amount) => `Veneno ${amount}`);
    const expectedRules = [...keywordText, ...poisonText, ...rulesText].filter(Boolean).join("\n");

    for (const source of studioSources) {
      const studioCard = source.cards.find((card) => card.id === runtimeCard.id);
      assert.ok(studioCard, `${source.label} is missing ${runtimeCard.id}`);
      assert.doesNotMatch(
        `${studioCard.tipo}\n${studioCard.desc}`,
        retiredStudioVocabulary,
        `${source.label} exposes retired vocabulary for ${runtimeCard.id}`,
      );
      assert.equal(
        studioCard.costo,
        runtimeCard.energyCost.amount,
        `${source.label} has a stale cost for ${runtimeCard.id}`,
      );
      assert.equal(
        studioCard.atk,
        runtimeCard.power,
        `${source.label} has stale power for ${runtimeCard.id}`,
      );
      assert.equal(
        studioCard.def,
        runtimeCard.endurance,
        `${source.label} has stale endurance for ${runtimeCard.id}`,
      );

      if (runtimeCard.kinds.includes("ECHO")) {
        assert.match(studioCard.tipo, /^Eco\b/u, `${source.label} has a stale type for ${runtimeCard.id}`);
      } else if (runtimeCard.kinds.includes("SPELL") && runtimeCard.modifiers?.includes("QUICK")) {
        assert.equal(studioCard.tipo, "Hechizo · Rápido", `${source.label} has a stale type for ${runtimeCard.id}`);
      } else if (runtimeCard.kinds.includes("SPELL")) {
        assert.equal(studioCard.tipo, "Hechizo", `${source.label} has a stale type for ${runtimeCard.id}`);
      } else if (runtimeCard.kinds.includes("SOURCE")) {
        assert.match(studioCard.tipo, /^Fuente\b/u, `${source.label} has a stale type for ${runtimeCard.id}`);
      }

      assert.equal(
        normalizePactOfElarionEffect(studioCard.desc),
        normalizePactOfElarionEffect(expectedRules),
        `${source.label} has stale rules for ${runtimeCard.id}`,
      );
    }
  }
});

test("El Alzamiento de los Sinsepulcro studio cards use Hostfall vocabulary and stay aligned", () => {
  const studioCards = buildStudioCards("uprising_of_the_graveless");
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL("../src/data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json", import.meta.url),
      "utf8",
    ),
  );
  const retiredStudioVocabulary = /(?:\b(?:Criaturas?|Conjuros?|Encantamientos?|Horda|Amenaza|cementerio|jugador|entra|obtiene|Zombies?)\b|Toque mortal|Escurridizo|se lance|\bcrea(?:r)?\b)/iu;
  const keywordLabels = {
    DAUNTING: "Imponente",
    FLYING: "Volar",
    FURTIVE: "Furtivo",
    LETHAL: "Letal",
  };

  assert.equal(studioCards.length, 17, "Zombie studio must keep its 17 card definitions");
  assert.equal(
    studioCards.length,
    runtimeDeck.cards.length,
    "Zombie studio and runtime deck have different card counts",
  );
  const studioCss = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.css", import.meta.url),
    "utf8",
  );
  assert.match(
    studioCss,
    /\.tcg-card--common \.tcg-type-icon\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/u,
    "Zombie cards must inherit the final shared type-icon geometry",
  );

  for (const runtimeCard of runtimeDeck.cards) {
    const rulesText = /^Sin efecto (?:activo )?adicional\.$/u.test(runtimeCard.gameText?.es ?? "")
      ? []
      : [runtimeCard.gameText?.es];
    const keywordText = (runtimeCard.traits ?? [])
      .map((keyword) => keywordLabels[keyword] ?? keyword);
    const expectedRules = [...keywordText, ...rulesText].filter(Boolean).join("\n");
    const studioCard = studioCards.find((card) => card.id === runtimeCard.id);

    assert.ok(studioCard, `Zombie studio is missing ${runtimeCard.id}`);
    assert.doesNotMatch(
      `${studioCard.tipo}\n${studioCard.desc}`,
      retiredStudioVocabulary,
      `Zombie studio exposes retired vocabulary for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.cantidad,
      runtimeCard.quantity,
      `Zombie studio has a stale quantity for ${runtimeCard.id}`,
    );
    if (!runtimeCard.kinds.includes("TOKEN")) {
      assert.equal(
        studioCard.costo,
        runtimeCard.energyCost.amount,
        `Zombie studio has a stale cost for ${runtimeCard.id}`,
      );
    }
    assert.equal(
      studioCard.atk ?? null,
      runtimeCard.power ?? null,
      `Zombie studio has stale power for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.def ?? null,
      runtimeCard.endurance ?? null,
      `Zombie studio has stale endurance for ${runtimeCard.id}`,
    );

    if (runtimeCard.kinds.includes("TOKEN")) {
      assert.match(
        studioCard.tipo,
        /^Eco · Ficha\b/u,
        `Zombie studio has a stale token type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("ECHO")) {
      assert.match(
        studioCard.tipo,
        /^Eco\b/u,
        `Zombie studio has a stale type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("SPELL")) {
      assert.equal(
        studioCard.tipo,
        "Hechizo",
        `Zombie studio has a stale type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("SUPPORT")) {
      assert.equal(
        studioCard.tipo,
        "Apoyo",
        `Zombie studio has a stale type for ${runtimeCard.id}`,
      );
    }

    assert.equal(
      normalizeZombieEffect(studioCard.desc),
      normalizeZombieEffect(expectedRules),
      `Zombie studio has stale rules for ${runtimeCard.id}`,
    );
  }
});

test("La Legión de Varka studio cards use Hostfall vocabulary and stay aligned", () => {
  const studioCards = buildStudioCards("legion_of_varka");
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL(
        "../src/data/decks/host/legion_of_varka/legion_of_varka.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const retiredStudioVocabulary = /(?:\b(?:Criaturas?|Instantáneos?|Encantamientos?|Horda|Amenaza|jugador|entra|obtiene|Goblins?)\b|Daña primero|bola de fuego|\bcrea(?:r)?\b)/iu;
  const keywordLabels = {
    FLYING: "Volar",
    REFLEX: "Reflejos",
  };

  assert.equal(studioCards.length, 17, "Goblin studio must keep its 17 card definitions");
  assert.equal(
    studioCards.length,
    runtimeDeck.cards.length,
    "Goblin studio and runtime deck have different card counts",
  );

  const studioCss = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.css", import.meta.url),
    "utf8",
  );
  assert.match(
    studioCss,
    /\.tcg-card--common \.tcg-type-icon\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/u,
    "Goblin cards must inherit the final shared type-icon geometry",
  );

  for (const runtimeCard of runtimeDeck.cards) {
    const rulesText = /^Sin efecto (?:activo )?adicional\.$/u.test(runtimeCard.gameText?.es ?? "")
      ? []
      : [runtimeCard.gameText?.es];
    const keywordText = (runtimeCard.traits ?? [])
      .map((keyword) => keywordLabels[keyword] ?? keyword);
    const expectedRules = [...keywordText, ...rulesText].filter(Boolean).join("\n");
    const studioCard = studioCards.find((card) => card.id === runtimeCard.id);

    assert.ok(studioCard, `Goblin studio is missing ${runtimeCard.id}`);
    assert.doesNotMatch(
      `${studioCard.tipo}\n${studioCard.desc}`,
      retiredStudioVocabulary,
      `Goblin studio exposes retired vocabulary for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.cantidad,
      runtimeCard.quantity,
      `Goblin studio has a stale quantity for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.costo,
      runtimeCard.energyCost.amount,
      `Goblin studio has a stale cost for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.atk ?? null,
      runtimeCard.power ?? null,
      `Goblin studio has stale power for ${runtimeCard.id}`,
    );
    assert.equal(
      studioCard.def ?? null,
      runtimeCard.endurance ?? null,
      `Goblin studio has stale endurance for ${runtimeCard.id}`,
    );

    if (runtimeCard.kinds.includes("TOKEN")) {
      assert.match(
        studioCard.tipo,
        /^Eco · Ficha\b/u,
        `Goblin studio has a stale token type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("ECHO")) {
      assert.match(
        studioCard.tipo,
        /^Eco\b/u,
        `Goblin studio has a stale type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("SPELL") && runtimeCard.modifiers?.includes("QUICK")) {
      assert.equal(
        studioCard.tipo,
        "Hechizo · Rápido",
        `Goblin studio has a stale type for ${runtimeCard.id}`,
      );
    } else if (runtimeCard.kinds.includes("SUPPORT")) {
      assert.equal(
        studioCard.tipo,
        "Apoyo",
        `Goblin studio has a stale type for ${runtimeCard.id}`,
      );
    }

    assert.equal(
      normalizeGoblinEffect(studioCard.desc),
      normalizeGoblinEffect(expectedRules),
      `Goblin studio has stale rules for ${runtimeCard.id}`,
    );
  }
});

test("Hunter preview sources use Hostfall vocabulary and stay aligned", () => {
  const indexUrl = new URL("../dev/tools/Decks/hunters/index.html", import.meta.url);
  const previewCards = buildStudioCards("hunters");
  const retiredStudioVocabulary = /(?:\b(?:Tierras?|Criaturas?|Instantáneos?|Conjuros?|Encantamientos?|Horda|Alcance|Menace|Defensor|monstruos?|obtiene|entra|Agrega|vidas)\b|\{\{T\}\})/iu;
  const expectedTypes = {
    territorio_de_caza: "Fuente — Territorio",
    trampa_de_mandibulas: "Eco — Trampa",
    red_de_garfios: "Eco — Trampa",
    rastreadora_de_huellas: "Eco — Cazador Rastreador",
    trampero_de_acero: "Eco — Cazador Trampero",
    lancero_de_la_marca: "Eco — Cazador Guerrero",
    lyra_ojo_de_la_caceria: "Eco de Crónica — Cazador",
    flecha_sedante: "Hechizo · Rápido",
    contra_tu_manada: "Hechizo · Rápido",
    rodear_a_la_presa: "Hechizo",
    trofeo_de_la_caceria: "Apoyo — Trofeo",
    la_gran_batida: "Hechizo",
    trampa_improvisada: "Eco · Ficha — Trampa",
  };

  assert.equal(previewCards.length, 13, "Hunter preview must keep its 13 definitions");
  assert.equal(
    previewCards.reduce((total, card) => total + card.cantidad, 0),
    40,
    "Hunter preview must keep its 40-card authored composition",
  );

  for (const card of previewCards) {
    assert.equal(card.tipo, expectedTypes[card.id], `Hunter preview has a stale type for ${card.id}`);
    assert.doesNotMatch(
      `${card.tipo}\n${card.desc}`,
      retiredStudioVocabulary,
      `Hunter preview exposes retired vocabulary for ${card.id}`,
    );
    assert.ok(
      fs.existsSync(new URL(card.art_crop, indexUrl)),
      `${card.id} points to missing Hunter art: ${card.art_crop}`,
    );
  }

  const hunterCss = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.css", import.meta.url),
    "utf8",
  );
  assert.match(
    hunterCss,
    /\.tcg-card--common \.tcg-type-icon\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/u,
    "Hunter cards must inherit the final shared type-icon geometry",
  );
});

test("authored rules use ally and enemy as compact Echo nouns", () => {
  const studioDecks = [
    ["El Pacto de Elarion", buildStudioCards("pact_of_elarion")],
    ["Vampires", buildStudioCards("court_of_the_crimson_eclipse")],
    ["Zombies", buildStudioCards("uprising_of_the_graveless")],
    ["Goblins", buildStudioCards("legion_of_varka")],
    ["Hunters", buildStudioCards("hunters")],
  ];
  const verboseEchoProse = /(?:\bCuando este Eco es invocad[oa]\b|\bEcos? aliad[oa]s?\b|\bEcos? enemig[oa]s?\b|\bEcos? de la Hueste\b)/iu;

  for (const [deckName, cards] of studioDecks) {
    for (const card of cards) {
      assert.doesNotMatch(
        card.desc ?? "",
        verboseEchoProse,
        `${deckName}/${card.id} uses a verbose Echo relation or Invoke trigger`,
      );
    }
  }

  const hunterCards = studioDecks.find(([deckName]) => deckName === "Hunters")[1];
  assert.equal(
    hunterCards.find((card) => card.id === "rastreadora_de_huellas").desc,
    "Al ser invocada, marca un enemigo.",
  );
  assert.match(
    hunterCards.find((card) => card.id === "lyra_ojo_de_la_caceria").desc,
    /^Al ser invocada, marca un enemigo\./u,
  );
});

test("Vampire gameplay cards use their full-image faction presentation", () => {
  for (const definitionId of [
    "sanctuary_of_the_red_moon",
    "blood_page",
    "herald_of_the_eclipse",
    "mirevna_countess_of_the_crimson_eclipse",
    "midnight_pact",
  ]) {
    assert.equal(shouldShowFullCardImage(definitionId), true);
    assert.equal(cardThemeForDefinition(definitionId), "vampire");
  }
});

function normalizeVampireEffect(text) {
  return String(text ?? "")
    .replaceAll("{{T}}", "Agota")
    .replace(/(?:\{E\})+/g, (icons) => `${icons.length / 3} Energía`)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function normalizePactOfElarionEffect(text) {
  return String(text ?? "")
    .replaceAll("{{T}}", "Agota")
    .replace(/(?:\{E\})+/g, (icons) => `${icons.length / 3} Energía`)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function normalizeZombieEffect(text) {
  const normalized = String(text ?? "").trim();
  if (/^Sin efecto (?:activo )?adicional\.$/iu.test(normalized)) return "";
  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function normalizeGoblinEffect(text) {
  const normalized = String(text ?? "").trim();
  if (/^Sin efecto (?:activo )?adicional\.$/iu.test(normalized)) return "";
  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}
