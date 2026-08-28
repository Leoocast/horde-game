import type { AppLanguage } from "../i18n/translations";

/**
 * Fixture histórico del laboratorio de Semillas del Destino.
 *
 * No tiene imports desde el producto ni participa en persistencia, replay o
 * resume. Se conserva únicamente como referencia visual/dev del mockup aprobado;
 * `SeedsOfDestinyScreen` consume el historial real.
 *
 * Las semillas son Canon Seeds `HF1` válidas, así que el código de Futuro y la
 * dificultad se derivan de ellas con el codec real.
 */

type Localized = Readonly<Record<AppLanguage, string>>;

export type SeedFutureState = "preserved" | "lost";

export type SeedAttemptFixture = Readonly<{
  verdict: "victory" | "defeat";
  turn: number;
  body: Localized;
  marks: readonly Localized[];
}>;

export type SeedFutureFixture = Readonly<{
  seed: string;
  chronicleDeckId: string;
  hostDeckId: string;
  state: SeedFutureState;
  attempts: readonly SeedAttemptFixture[];
}>;

export const SEEDS_OF_DESTINY_FIXTURE: readonly SeedFutureFixture[] = [
  {
    seed: "HF1-ELA-GRV-082-QC5",
    chronicleDeckId: "pact_of_elarion",
    hostDeckId: "uprising_of_the_graveless",
    state: "preserved",
    attempts: [
      {
        verdict: "defeat",
        turn: 6,
        body: {
          es: "La Preparación terminó con dos Fuentes y ningún Eco en el Campo. Cuando la primera Estampida cruzó la línea, no había nada que ponerle delante.",
          en: "Setup ended with two Sources and no Echo on the Field. When the first Surge crossed the line, there was nothing to put in front of it.",
        },
        marks: [
          {
            es: "Vaelor, Guardián Esmeralda se quedó en la Mano los seis turnos.",
            en: "Vaelor, Emerald Guardian stayed in Hand for all six turns.",
          },
          {
            es: "Tres Soldados Sinsepulcro atacaron sin defensor en el turno 5.",
            en: "Three Graveless Soldiers attacked with no defender on turn 5.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 8,
        body: {
          es: "Liora sostuvo la arboleda dos turnos más de lo que nadie esperaba, pero el Titán Sinsepulcro llegó antes que la cuarta Fuente.",
          en: "Liora held the grove two turns longer than anyone expected, but the Graveless Titan arrived before the fourth Source.",
        },
        marks: [
          {
            es: "Escudo de la Heredera salvó a Maela y mató al Acechador Alado de la Cripta.",
            en: "Shield of the Heir saved Maela and killed the Winged Stalker of the Crypt.",
          },
          {
            es: "El Archivo de la Hueste todavía guardaba nueve cartas al terminar.",
            en: "The Host Archive still held nine cards at the end.",
          },
        ],
      },
      {
        verdict: "victory",
        turn: 9,
        body: {
          es: "Vaelor entró en el turno 6 y su descarga esmeralda dejó a la Hueste sin frente. El ataque del turno 9 vació lo que quedaba de su Archivo.",
          en: "Vaelor entered on turn 6 and his emerald volley left the Host with no front line. The turn 9 attack emptied what was left of its Archive.",
        },
        marks: [
          {
            es: "Vaelor, Guardián Esmeralda puso un contador -1/-1 sobre cinco enemigos al ser Invocado.",
            en: "Vaelor, Emerald Guardian placed a -1/-1 counter on five enemies when Summoned.",
          },
          {
            es: "El Juicio de Elarion retiró El Santuario Quebrado antes de la última Estampida.",
            en: "The Judgment of Elarion removed The Broken Headstone before the last Surge.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-CEC-VRK-3M3-R7J",
    chronicleDeckId: "court_of_the_crimson_eclipse",
    hostDeckId: "legion_of_varka",
    state: "lost",
    attempts: [
      {
        verdict: "defeat",
        turn: 7,
        body: {
          es: "Varka atacó con sus dos bolas de fuego dos turnos seguidos y el frente carmesí no llegó a formarse.",
          en: "Varka attacked with both fireballs two turns running and the crimson front never formed.",
        },
        marks: [
          {
            es: "Mirevna, Condesa del Eclipse Carmesí pagó la mitad de la Vida y no alcanzó el turno siguiente.",
            en: "Mirevna, Countess of the Crimson Eclipse paid half her Life and did not reach the next turn.",
          },
          {
            es: "Todos contra uno retiró a la Guardiana del Umbral Nocturno en el turno 5.",
            en: "All Against One removed the Guardian of the Night Threshold on turn 5.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 9,
        body: {
          es: "La segunda vez la Corte llegó al turno 9 con Mirevna todavía en pie, pero la Reserva no alcanzó para el Veredicto y Varka volvió a abrir el frente.",
          en: "The second time the Court reached turn 9 with Mirevna still standing, but the Reserve fell short of the Verdict and Varka broke the front open again.",
        },
        marks: [
          {
            es: "Mirevna, Condesa del Eclipse Carmesí sobrevivió cuatro turnos en el Campo.",
            en: "Mirevna, Countess of the Crimson Eclipse survived four turns on the Field.",
          },
          {
            es: "Veredicto del Eclipse se quedó sin canalizar con 2 de Energía en la Reserva.",
            en: "Verdict of the Eclipse went unchanneled with 2 Energy in Reserve.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-ELA-GRV-TV3-X3L",
    chronicleDeckId: "pact_of_elarion",
    hostDeckId: "uprising_of_the_graveless",
    state: "lost",
    attempts: [
      {
        verdict: "defeat",
        turn: 5,
        body: {
          es: "La Hueste reveló un Rompemuros del Túmulo en su primer turno y ya no hubo cómo pararlo.",
          en: "The Host revealed a Barrow Wallbreaker on its first turn and there was no stopping it after that.",
        },
        marks: [
          {
            es: "El Cronista jugó una sola Fuente antes de la primera Estampida.",
            en: "The Chronicler played a single Source before the first Surge.",
          },
          {
            es: "Rompemuros del Túmulo atacó tres turnos seguidos sin defensor.",
            en: "Barrow Wallbreaker attacked with no defender three turns running.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 6,
        body: {
          es: "Liora llegó a tiempo esta vez, pero cayó frente a Nerezh, Matriarca Sinsepulcro antes de estabilizarse.",
          en: "Liora arrived in time this time, but fell to Nerezh, Graveless Matriarch before stabilizing.",
        },
        marks: [
          {
            es: "Nerezh, Matriarca Sinsepulcro mató a Liora con su Rasgo Letal.",
            en: "Nerezh, Graveless Matriarch killed Liora with her Lethal Trait.",
          },
          {
            es: "La Mano terminó con dos Hechizos que nunca pudieron canalizarse.",
            en: "The Hand ended with two Spells that could never be channeled.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 6,
        body: {
          es: "El mismo turno, otra caída. El Cronista guardó Energía en la Reserva para el Juicio y la Estampida llegó un turno antes de lo previsto.",
          en: "The same turn, another fall. The Chronicler saved Energy in Reserve for the Judgment and the Surge came a turn earlier than expected.",
        },
        marks: [
          {
            es: "La Reserva terminó con 3 de Energía sin usar.",
            en: "The Reserve ended with 3 unspent Energy.",
          },
          {
            es: "El Juicio de Elarion se quedó en la Mano.",
            en: "The Judgment of Elarion stayed in Hand.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 9,
        body: {
          es: "La Visión más larga. Maela sostuvo las alturas cuatro turnos y el Archivo de la Hueste bajó hasta cinco cartas antes de que la última Estampida cerrara la historia.",
          en: "The longest Vision. Maela held the heights for four turns and the Host Archive dropped to five cards before the last Surge closed the story.",
        },
        marks: [
          {
            es: "Maela, Vigía de las Alturas defendió cuatro turnos seguidos.",
            en: "Maela, Watcher of the Heights defended four turns running.",
          },
          {
            es: "El Archivo de la Hueste llegó a quedarse en cinco cartas.",
            en: "The Host Archive got down to five cards.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-ELA-VRK-QW1-B8N",
    chronicleDeckId: "pact_of_elarion",
    hostDeckId: "legion_of_varka",
    state: "preserved",
    attempts: [
      {
        verdict: "victory",
        turn: 11,
        body: {
          es: "La arboleda se levantó entera. Vaelor y Kaelor se repartieron el cielo y la Legión nunca volvió a tener frente.",
          en: "The whole grove rose. Vaelor and Kaelor split the sky between them and the Legion never held a front again.",
        },
        marks: [
          {
            es: "Kaelor, Convocador de Tormentas creció con cada Invocación aliada del turno 8.",
            en: "Kaelor, Stormcaller grew with every allied Summon on turn 8.",
          },
          {
            es: "Varka, Matriarca Infernal cayó por Reflejos contra Vaelor, Guardián Esmeralda.",
            en: "Varka, Infernal Matriarch fell to Reflex against Vaelor, Emerald Guardian.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-CEC-GRV-H52-K9Q",
    chronicleDeckId: "court_of_the_crimson_eclipse",
    hostDeckId: "uprising_of_the_graveless",
    state: "lost",
    attempts: [
      {
        verdict: "defeat",
        turn: 4,
        body: {
          es: "La caída más rápida entre estas Visiones. La Mano no llegó a nada: tres Hechizos y una sola Fuente.",
          en: "The fastest fall among these Visions. The Hand came to nothing: three Spells and a single Source.",
        },
        marks: [
          {
            es: "La primera Estampida llegó con el Campo del Cronista vacío.",
            en: "The first Surge arrived with the Chronicler Field empty.",
          },
          {
            es: "Tributo de los Cuatro Pesares se resolvió sin oposición.",
            en: "Tribute of the Four Sorrows resolved unopposed.",
          },
        ],
      },
      {
        verdict: "defeat",
        turn: 7,
        body: {
          es: "El Santuario se levantó a tiempo y la Corte pudo drenar dos veces, pero Nerezh volvió del Osario más rápido de lo que la Corte podía sangrar.",
          en: "The Sanctuary rose in time and the Court drained twice, but Nerezh came back from the Ossuary faster than the Court could bleed.",
        },
        marks: [
          {
            es: "Drenar la Esencia devolvió 6 de Vida en el turno 5.",
            en: "Drain Essence returned 6 Life on turn 5.",
          },
          {
            es: "El Archivo de la Hueste terminó con catorce cartas.",
            en: "The Host Archive ended with fourteen cards.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-CEC-VRK-NF1-D6W",
    chronicleDeckId: "court_of_the_crimson_eclipse",
    hostDeckId: "legion_of_varka",
    state: "preserved",
    attempts: [
      {
        verdict: "defeat",
        turn: 8,
        body: {
          es: "La Corte llegó al turno 8 con ventaja y perdió el frente entero contra una sola descarga de la Legión.",
          en: "The Court reached turn 8 ahead and lost its entire front to a single Legion volley.",
        },
        marks: [
          {
            es: "¡Liberen a la Legión! devolvió tres Ecos al Campo de una vez.",
            en: "Unleash the Legion! returned three Echoes to the Field at once.",
          },
          {
            es: "Mirevna murió con la Vida del Cronista en 11.",
            en: "Mirevna died with the Chronicler at 11 Life.",
          },
        ],
      },
      {
        verdict: "victory",
        turn: 12,
        body: {
          es: "La Visión más larga de las Semillas del Destino. El Duelista del Eclipse aguantó la Estabilización y desde el turno 6 la Corte no volvió a perder un intercambio.",
          en: "The longest Vision in Seeds of Destiny. The Duelist of the Eclipse held through Stabilizing and from turn 6 the Court never lost another exchange.",
        },
        marks: [
          {
            es: "Duelista del Eclipse ganó cinco combates seguidos.",
            en: "Duelist of the Eclipse won five fights in a row.",
          },
          {
            es: "Cacería Bajo la Luna Roja abrió el turno 12 y vació el Archivo de la Hueste.",
            en: "Hunt Beneath the Red Moon opened turn 12 and emptied the Host Archive.",
          },
        ],
      },
    ],
  },
  {
    seed: "HF1-CEC-GRV-4J3-L0R",
    chronicleDeckId: "court_of_the_crimson_eclipse",
    hostDeckId: "uprising_of_the_graveless",
    state: "lost",
    attempts: [
      {
        verdict: "defeat",
        turn: 5,
        body: {
          es: "Un Futuro apenas contemplado. La Hueste reveló dos Ecos con Volar y la Corte no tenía con qué alcanzarlos.",
          en: "A Future barely contemplated. The Host revealed two Echoes with Flying and the Court had nothing that could reach them.",
        },
        marks: [
          {
            es: "Jinete del Osario y Engendro de Alas Cosidas atacaron por el aire cuatro turnos.",
            en: "Ossuary Rider and Stitched-Wing Spawn attacked through the air for four turns.",
          },
          {
            es: "Ningún Eco de la Corte pudo declararse defensor.",
            en: "No Court Echo could be declared a defender.",
          },
        ],
      },
    ],
  },
];
