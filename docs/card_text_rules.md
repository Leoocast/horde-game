# Redacción normativa de cartas

Estado: **normativa v1**

Este documento define cómo se redactan las reglas impresas de Hostfall. Su propósito es que cada
verbo, signo de puntuación y conector describa una operación concreta del juego. El JSON runtime
sigue siendo la fuente de verdad mecánica: el texto nunca sustituye a los efectos estructurados,
pero debe describirlos exactamente.

Esta gramática pertenece a Hostfall y no presupone reglas, prioridades ni ventanas de otros juegos.

## Estructura canónica

Una habilidad puede tener hasta tres partes:

```text
[Condición o ventana]: [Costes y elecciones]; [resolución].
```

Se omiten las partes vacías y su signo correspondiente.

- `Al ser invocada: elige un aliado; pon un contador +1/+1 sobre ese aliado.`
- `Agota esta carta; agrega {E}.`
- `Elige un aliado y un enemigo; el aliado inflige al enemigo daño igual a su Fuerza.`

El texto se resuelve de izquierda a derecha. Español e inglés deben conservar los mismos objetivos,
cantidades, restricciones, orden y dependencias.

## Signos de puntuación

### Dos puntos (`:`)

Separan una condición, evento, frecuencia o ventana de lo que la habilidad hace. Lo anterior a los
dos puntos no es un coste.

- `Al ser invocada: ...`
- `La primera vez que otro aliado sea invocado durante tu turno: ...`
- `Cuando este Eco muera: ...`

No usar `Agota:`: Agotar es un coste y corresponde antes de punto y coma.

### Punto y coma (`;`)

Separa costes y elecciones de la resolución. Al confirmar la habilidad, primero se pagan todos sus
costes y se eligen todos sus objetivos; después se ejecuta el texto situado a la derecha.

- `Agota esta carta y paga 5 de Vida; agrega {E}.`
- `Elige un aliado; el aliado gana +2/+2 hasta el final del turno.`
- `Elige un Apoyo enemigo o un Eco enemigo con Volar; destrúyelo.`

Si no pueden pagarse todos los costes o no existen todas las elecciones obligatorias, la habilidad
no puede iniciarse. Una elección válida al iniciarse no garantiza que el objetivo siga presente al
resolverse.

### Punto (`.`)

Cierra una instrucción. Una oración posterior es un paso posterior y observa el estado producido
por la anterior. El punto por sí solo no crea una dependencia causal: esa relación se declara con
un conector normativo.

### Saltos de línea y listas

Un salto de línea separa habilidades independientes o párrafos de reglas; no significa «después».
Las viñetas se reservan para modos realmente distintos encabezados por `Elige uno:`. No se usan
para expresar distintas clases de objetivo de una misma acción.

## Elecciones y referencias

`Elige` es el verbo normativo para fijar objetivos. `Selecciona` se reserva para instrucciones de
interfaz y no se imprime en cartas.

- `aliado` significa un Eco controlado por el mismo bando que la fuente.
- `enemigo` significa un Eco controlado por el bando contrario.
- Otros permanentes se nombran con su tipo y relación: `un Apoyo enemigo`, `una Fuente aliada`.
- Tras elegir varios objetos, se reutiliza el mismo papel: `ese aliado`, `ese enemigo`, `el Apoyo
  elegido`. Evitar pronombres ambiguos como `este`, `otro` o `él` si pueden referirse a más de un
  objeto.

Las restricciones impresas deben coincidir con `controller`, `zone`, `kinds`, `traits` y los demás
filtros authored. `Elige un enemigo` nunca puede estar respaldado por `controller: "ANY"`.

## Conectores normativos

| Conector | Orden | Dependencia |
| --- | --- | --- |
| `y` | Una misma instrucción. Se intenta cada parte en el orden escrito. | Ninguna por sí sola. |
| `Después,` | La segunda instrucción ocurre después de completar la primera. | La segunda requiere que la primera haya podido aplicarse. |
| `Si lo haces,` | La consecuencia se aplica sólo si se realizó la instrucción indicada. | Causal explícita. |
| `Además,` | Añade una instrucción separada. | Se intenta aunque la anterior no haya producido resultado. |
| `a la vez` | Los resultados se aplican como un solo evento simultáneo. | Ninguna parte ocurre antes que la otra. |

Usar `Después,` en vez de alternar entre `después` y `luego`. Si dos efectos deben ser simultáneos,
deben decir `a la vez` y estar implementados como una secuencia simultánea.

## Verbos normativos

| Verbo | Uso |
| --- | --- |
| `elige` | Fija uno o más objetivos. |
| `agota` | Cambia una carta preparada a Agotada, normalmente como coste. |
| `agrega` | Aumenta la Energía disponible o almacenada. |
| `gana` | Aumenta Vida o concede stats/Rasgos durante una duración. |
| `pon` | Coloca contadores sobre una carta. |
| `inflige` | Hace una cantidad de daño a un objetivo. |
| `destruye` | Mueve un permanente del Campo a la Memoria por destrucción. |
| `invoca` | Pone el Eco indicado en el Campo. |
| `roba` | Mueve la carta superior del Archivo a la Mano. |
| `descarta` | Mueve la carta indicada a la Memoria. |
| `destierra` | Mueve una carta al Olvido. |

`Lucha` significa: los dos Ecos se infligen a la vez daño igual a su Fuerza actual. Es daño que no
es de combate. La redacción canónica es `ese aliado lucha contra ese enemigo`.

## Elecciones modales

Usar `Elige uno:` seguido de viñetas sólo cuando cada opción sea un efecto distinto.

```text
Elige uno:
- Roba dos cartas.
- Destruye un Apoyo enemigo.
```

Si cambia únicamente qué objeto puede recibir el mismo efecto, se escribe una sola elección:

```text
Elige un Apoyo enemigo o un Eco enemigo con Volar; destrúyelo.
```

## Plantillas preferidas

- Energía: `Agota esta carta; agrega {E}.`
- Coste combinado: `Agota esta carta y paga 5 de Vida; agrega {E}.`
- Daño por Fuerza: `Elige un aliado y un enemigo; el aliado inflige al enemigo daño igual a su
  Fuerza.`
- Mejora y lucha: `Elige un aliado y un enemigo; el aliado gana +1/+2 hasta el final del turno.
  Después, ese aliado lucha contra ese enemigo.`
- Destrucción con clases alternativas: `Elige un Apoyo enemigo o un Eco enemigo con Volar;
  destrúyelo.`

## Lista de revisión

Antes de aprobar una carta:

1. El texto nombra todos los objetivos y restricciones que exige el JSON.
2. Los costes están antes de `;`, no antes de `:`.
3. Las condiciones y ventanas están antes de `:`.
4. El orden de las oraciones coincide con el orden de los efectos.
5. Toda dependencia usa un conector normativo.
6. Toda simultaneidad se declara y está implementada como tal.
7. No hay pronombres ambiguos.
8. `Agrega` se usa para Energía y `gana` para Vida, stats o Rasgos.
9. La versión inglesa conserva exactamente la misma mecánica.
10. Los tests de targets y el deck lint cubren cualquier restricción que cambie el resultado.
