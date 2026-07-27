import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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
