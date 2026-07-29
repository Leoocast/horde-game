import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { cardThemeForDefinition, shouldShowFullCardImage } from "../src/utils/cardImages";

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
  const raidBombardment = formatEffectText(
    "Cada Trasgo atacante con fuerza 2 o menos agrega 1 de daño a la salva.",
  );
  const lifeCost = formatEffectText(
    "Coste adicional: Paga 5 vidas.\nRoba 2 cartas.",
  );
  const fractionalLifeCost = formatEffectText(
    "Coste adicional: Paga la mitad de tu vida.",
  );
  const inlineKeywords = formatEffectText(
    "Volar. Robo de vida. Vigilancia.\nCoste adicional: Paga la mitad de tu vida.",
  );
  const acolyteCost = formatEffectText(
    "{{T}}: Paga 5 vidas. Genera 1 de Energía.",
    { tapIconHtml: '<span class="tap-icon"></span>' },
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

  assert.match(raidBombardment, /class="effect-danger">fuerza 2 o menos<\/strong>/);
  assert.match(raidBombardment, /class="effect-danger">1 de daño<\/strong>/);
  assert.match(lifeCost, /class="effect-life-cost">Paga 5 vidas\.<\/strong>/);
  assert.match(lifeCost, /Coste adicional: <strong class="effect-life-cost">Paga 5 vidas\.<\/strong>/);
  assert.equal((lifeCost.match(/class="effect-paragraph"/g) ?? []).length, 2);
  assert.match(
    fractionalLifeCost,
    /Coste adicional: <strong class="effect-life-cost">Paga la mitad de tu vida\.<\/strong>/,
  );
  assert.match(
    inlineKeywords,
    /class="effect-keyword">Volar<\/strong>\. <strong class="effect-keyword">Robo de vida<\/strong>\. <strong class="effect-keyword">Vigilancia<\/strong>\./,
  );
  assert.equal((inlineKeywords.match(/class="effect-paragraph"/g) ?? []).length, 2);
  assert.match(acolyteCost, /<span class="tap-icon"><\/span>: <strong class="effect-life-cost">Paga 5 vidas\.<\/strong>/);
  assert.equal((acolyteCost.match(/class="effect-paragraph"/g) ?? []).length, 2);
});

test("local Vampire studio art paths resolve to real files", () => {
  const indexUrl = new URL("../dev/tools/Decks/vampires/index.html", import.meta.url);
  const indexHtml = fs.readFileSync(indexUrl, "utf8");
  const embeddedJson = indexHtml.match(
    /<script id="deck-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(embeddedJson, "Vampire index must contain its embedded deck JSON");

  const sources = [
    JSON.parse(embeddedJson),
    JSON.parse(
      fs.readFileSync(
        new URL("../dev/tools/Decks/vampires/vampires.json", import.meta.url),
        "utf8",
      ),
    ),
  ];

  for (const cards of sources) {
    for (const card of cards) {
      if (/^https?:/i.test(card.art_crop)) continue;
      assert.ok(
        fs.existsSync(new URL(card.art_crop, indexUrl)),
        `${card.id} points to missing art: ${card.art_crop}`,
      );
    }
  }
});

test("Vampire studio cards stay aligned with the runtime deck", () => {
  const indexUrl = new URL("../dev/tools/Decks/vampires/index.html", import.meta.url);
  const indexHtml = fs.readFileSync(indexUrl, "utf8");
  const embeddedJson = indexHtml.match(
    /<script id="deck-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(embeddedJson, "Vampire index must contain its embedded deck JSON");

  const runtimeDeck = JSON.parse(
    fs.readFileSync(
      new URL("../src/data/decks/player/vampire_preview/vampire_preview.json", import.meta.url),
      "utf8",
    ),
  );
  const studioSources = [
    { label: "embedded index", cards: JSON.parse(embeddedJson), includesQuantity: true },
    {
      label: "vampires.json",
      cards: JSON.parse(
        fs.readFileSync(
          new URL("../dev/tools/Decks/vampires/vampires.json", import.meta.url),
          "utf8",
        ),
      ),
    },
  ];
  const keywordLabels = {
    DEATHTOUCH: "Toque mortal",
    FLYING: "Volar",
    LIFESTEAL: "Robo de vida",
    REACH: "Alcance",
    VIGILANCE: "Vigilancia",
  };

  for (const runtimeCard of runtimeDeck.cards) {
    const rulesText = runtimeCard.gameText?.es === "Sin efecto adicional."
      ? []
      : [runtimeCard.gameText?.es];
    const keywordText = (runtimeCard.keywords ?? []).map((keyword) => keywordLabels[keyword] ?? keyword);
    const expected = runtimeCard.id === "eternal_feast_countess"
      ? [`${keywordText.join(". ")}.`, ...rulesText].filter(Boolean).join("\n")
      : [...keywordText, ...rulesText].filter(Boolean).join("\n");

    for (const source of studioSources) {
      const studioCard = source.cards.find((card) => card.id === runtimeCard.id);
      assert.ok(studioCard, `${source.label} is missing ${runtimeCard.id}`);
      assert.equal(studioCard.costo, runtimeCard.manaValue, `${source.label} has a stale cost for ${runtimeCard.id}`);
      assert.equal(studioCard.atk, runtimeCard.power, `${source.label} has stale power for ${runtimeCard.id}`);
      assert.equal(studioCard.def, runtimeCard.toughness, `${source.label} has stale toughness for ${runtimeCard.id}`);
      if (source.includesQuantity) {
        assert.equal(studioCard.cantidad, runtimeCard.quantity, `${source.label} has a stale quantity for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "blood_pact") {
        assert.equal(studioCard.tipo, "Conjuro", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      if (runtimeCard.id === "final_banquet") {
        assert.equal(studioCard.tipo, "Instantáneo", `${source.label} has a stale type for ${runtimeCard.id}`);
      }
      assert.equal(
        normalizeVampireEffect(studioCard.desc),
        normalizeVampireEffect(expected),
        `${source.label} has stale rules for ${runtimeCard.id}`,
      );
    }
  }
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
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}
