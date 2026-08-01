import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { cardThemeForDefinition, shouldShowFullCardImage } from "../src/utils/cardImages";
import {
  STUDIO_DECKS,
  buildStudioCards,
  generatedStudioData,
  loadStudioConfig,
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
  const noosegraf = formatEffectText(
    "Siempre que se lance una carta que no sea ficha, quita un contador +1/+1 de esta criatura y crea un Zombie 2/2.",
  );
  const invokedToken = formatEffectText("Invoca un Eco Ficha Zombi 2/2.");
  const variableTokenWave = formatEffectText(
    "Luego Invoca tantos Ecos Ficha Trasgo 1/1 atacando como su Fuerza.",
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

  assert.match(noosegraf, /y <strong class="effect-token">crea un Zombie 2\/2<\/strong>/);
  assert.equal((noosegraf.match(/class="effect-paragraph"/g) ?? []).length, 1);
  assert.match(
    invokedToken,
    /class="effect-token">Invoca un Eco Ficha Zombi 2\/2<\/strong>/,
  );
  assert.match(
    variableTokenWave,
    /class="effect-token">Invoca tantos Ecos Ficha Trasgo 1\/1 atacando<\/strong>/,
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
  const indexUrl = new URL("../dev/tools/Decks/vampires/index.html", import.meta.url);
  for (const card of buildStudioCards("vampires")) {
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
    }
  }

  for (const retiredMirror of [
    "../dev/tools/Decks/monogreen/mono-green.json",
    "../dev/tools/Decks/vampires/vampires.json",
    "../dev/tools/Decks/hunters/hunters.json",
    "../src/data/decks/player/mono_green_ramp/mono_green_ramp_card_generator.json",
  ]) {
    assert.equal(fs.existsSync(new URL(retiredMirror, import.meta.url)), false, `${retiredMirror} survived`);
  }
});

test("migrated deck studios use the same minimal header presentation", () => {
  const monoGreenIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/monogreen/index.html", import.meta.url),
    "utf8",
  );
  const vampireIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/vampires/index.html", import.meta.url),
    "utf8",
  );
  const zombieIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/zombies/index.html", import.meta.url),
    "utf8",
  );
  const goblinIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/goblins/index.html", import.meta.url),
    "utf8",
  );
  const hunterIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/hunters/index.html", import.meta.url),
    "utf8",
  );
  const retiredHeaderUi = /(?:studio-kicker|studio-toolbar|studio-status|export-btn|exportación HD|Cartas HD|alta resolución|976×1360|Preview visual|antes de exportar)/iu;

  for (const [label, indexHtml] of [
    ["Mono Green", monoGreenIndex],
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

test("card generators print the Hostfall copyright footer", () => {
  const sharedStudio = fs.readFileSync(
    new URL("../dev/tools/Decks/deck-card-studio.js", import.meta.url),
    "utf8",
  );
  const monoGreenIndex = fs.readFileSync(
    new URL("../dev/tools/Decks/monogreen/index.html", import.meta.url),
    "utf8",
  );

  for (const [label, source] of [
    ["shared studio", sharedStudio],
    ["Mono Green studio", monoGreenIndex],
  ]) {
    assert.match(source, /© HOSTFALL 2026/u, `${label} is missing the copyright footer`);
    assert.doesNotMatch(source, /Hostfall TCG/iu, `${label} still prints the retired footer`);
  }
});

test("Vampire studio cards stay aligned with the runtime deck", () => {
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL("../src/data/decks/player/vampire_preview/vampire_preview.json", import.meta.url),
      "utf8",
    ),
  );
  const studioSources = [
    { label: "generated studio projection", cards: buildStudioCards("vampires"), includesQuantity: true },
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
    const expected = runtimeCard.id === "eternal_feast_countess"
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
      if (runtimeCard.id === "blood_pact") {
        assert.equal(studioCard.tipo, "Hechizo", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "final_banquet") {
        assert.equal(studioCard.tipo, "Hechizo · Rápido", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "eternal_feast_countess") {
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

test("Mono Green studio cards use Hostfall vocabulary and stay aligned", () => {
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL(
        "../src/data/decks/player/mono_green_ramp/mono_green_ramp.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const studioSources = [
    { label: "generated studio projection", cards: buildStudioCards("monogreen") },
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
      `${source.label} has a stale Mono Green card count`,
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
        normalizeMonoGreenEffect(studioCard.desc),
        normalizeMonoGreenEffect(expectedRules),
        `${source.label} has stale rules for ${runtimeCard.id}`,
      );
    }
  }
});

test("Zombie Host studio cards use Hostfall vocabulary and stay aligned", () => {
  const studioCards = buildStudioCards("zombies");
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL("../src/data/decks/horde/zombies/horde-zombies.json", import.meta.url),
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
    /body\[data-theme="zombies"\] \.tcg-type-icon \.tcg-echo-icon\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;/u,
    "Zombie Echo glyph must use the same doubled size as the migrated player decks",
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

test("Goblin Host studio cards use Hostfall vocabulary and stay aligned", () => {
  const studioCards = buildStudioCards("goblins");
  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL(
        "../src/data/decks/horde/goblins/goblin_assault_horde.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const retiredStudioVocabulary = /(?:\b(?:Criaturas?|Instantáneos?|Encantamientos?|Horda|Amenaza|jugador|entra|obtiene|Goblins?)\b|Daña primero|bola de fuego|\bcrea(?:r)?\b)/iu;
  const keywordLabels = {
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
    /body\[data-theme="goblins"\] \.tcg-type-icon \.tcg-echo-icon\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;/u,
    "Goblin Echo glyph must use the same doubled size as the other migrated decks",
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
    new URL("../dev/tools/Decks/hunters/hunters.css", import.meta.url),
    "utf8",
  );
  assert.match(
    hunterCss,
    /body\[data-theme="hunters"\] \.tcg-type-icon \.tcg-echo-icon\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;/u,
    "Hunter Echo glyph must use the shared doubled size",
  );
});

test("authored rules use ally and enemy as compact Echo nouns", () => {
  const studioDecks = [
    ["Mono Green", buildStudioCards("monogreen")],
    ["Vampires", buildStudioCards("vampires")],
    ["Zombies", buildStudioCards("zombies")],
    ["Goblins", buildStudioCards("goblins")],
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
    "crimson_energy",
    "blood_page",
    "crimson_bat",
    "eternal_feast_countess",
    "blood_pact",
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

function normalizeMonoGreenEffect(text) {
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
