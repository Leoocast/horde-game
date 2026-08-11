# Plan de diseño e implementación de claridad en la UI

Estado: **en ejecución fase por fase; Fases 1 a 5 cerradas, Fase 6 en revisión global de UI**
Última actualización: 2026-08-11

## Objetivo

Discutir, aprobar e implementar cambios en la UI normal de Hostfall para que el jugador comprenda
estas reglas sin depender del futuro tutorial:

- la Preparación como una etapa distinta de los turnos normales;
- cómo se obtiene, conserva y consume la Reserva;
- cuándo se roba una o dos cartas;
- cómo devolver una Fuente al Archivo para robar una carta;
- que los ataques del Cronista se dirigen al Archivo de la Hueste;
- cómo la Fuerza atacante se convierte en cartas descartadas del Archivo.

El propósito principal de este documento no es ejecutar una lista técnica automáticamente. Es servir
como guion para **diseñar cada parte de la interfaz con el usuario y después implementarla**.

El tutorial obligatorio se diseñará en un trabajo posterior, cuando estas señales ya existan y hayan
sido probadas en partidas normales.

## Cómo debe utilizarse este documento en el otro chat

Cada fase sigue obligatoriamente este ciclo:

```text
DISCUTIR LA UI
      ↓
APROBAR O MODIFICAR LA PROPUESTA
      ↓
IMPLEMENTAR SÓLO ESA FASE
      ↓
VERIFICAR Y PROBAR
      ↓
DETENERSE ANTES DE LA SIGUIENTE FASE
```

La aprobación de una fase no autoriza las siguientes.

### Antes de implementar una fase

El agente debe presentar primero:

1. **Problema actual:** qué puede confundir al jugador.
2. **Propuesta visible:** qué elementos, textos, estados y acciones cambiarían.
3. **Beneficio para el jugador:** qué podrá entender o anticipar gracias al cambio.
4. **Decisiones para el usuario:** alternativas de layout, copy o interacción que todavía pueden
   modificarse.
5. **Boceto breve:** cuando cambie el layout, incluir un esquema textual o visual suficientemente
   concreto para imaginar el resultado.
6. **Límites de la fase:** qué no se modificará todavía.

Después debe preguntar si se aprueba la propuesta, si debe modificarse o si se descarta. **No debe
editar código antes de recibir esa respuesta.**

### Después de implementar una fase

El agente debe:

- resumir qué cambió para el jugador;
- informar cualquier diferencia respecto de la propuesta aprobada;
- ejecutar la verificación proporcional al cambio;
- indicar exactamente qué debe probar manualmente el usuario;
- esperar la revisión del usuario;
- presentar la fase siguiente únicamente cuando el usuario decida continuar.

## Límites generales

Este plan:

- no implementa el tutorial obligatorio;
- no diseña todavía la sección opcional de tutoriales;
- no cambia cartas, decks o modos futuros;
- no autoriza rebalancear reglas sin aprobación explícita;
- no debe convertir información de gameplay en paneles técnicos o diagnósticos;
- conserva el estilo dark-medieval y táctil del juego.

Las reglas reales permanecen en `src/engine/`. Cuando una propuesta visual necesite calcular próximo
robo, Reserva prevista o descarte del Archivo, debe extraerse una función pura y probarse dentro de la
misma fase aprobada. La preparación técnica no es una fase separada ni puede adelantarse al diseño.

## Fase 0 — Confirmar las reglas que la UI debe enseñar

Esta fase es sólo una conversación de reglas y vocabulario. No implementa UI.

### Problema que resuelve

Hay dos diferencias entre la descripción informal de las reglas y el comportamiento vigente. No se
puede diseñar una interfaz clara si todavía no se sabe cuál versión debe comunicar.

### Decisión 0.1 — Próximo robo

Comportamiento implementado actualmente:

- durante Preparación: roba 1;
- después de Preparación, en Fácil: roba 2 siempre;
- después de Preparación, en Normal o Difícil: roba 1;
- en Normal o Difícil, si la Mano está vacía al comenzar el robo: roba 2.

Propuesta inicial: conservar esta regla para no cambiar el balance ni la identidad de Fácil.

Alternativa para discutir: todas las dificultades roban 1 normalmente y sólo una Mano vacía roba 2.
Esta alternativa es un cambio de reglas y balance, no sólo de presentación.

### Decisión 0.2 — Devolver una Fuente

Comportamiento implementado actualmente:

- sólo después de la Preparación;
- sólo durante la fase Principal del Cronista;
- sólo una vez por turno;
- jugar una Fuente y devolver una Fuente consumen la misma acción;
- la Fuente se coloca al fondo del Archivo y el Cronista roba 1 carta.

Propuesta inicial: conservar esta regla.

Alternativa para discutir: permitir devolverla literalmente “en cualquier momento”. Esto abriría
ventanas durante combate y el turno de la Hueste, por lo que requiere nuevas decisiones de timing y
balance.

### Decisión 0.3 — Vocabulario visible

Propuesta inicial:

- **Fuente:** la carta que produce Energía;
- **Energía:** el recurso usado para pagar costes;
- **Reserva:** Energía persistente, con límite 3;
- **Acción de Fuente:** la elección compartida entre jugar o devolver una Fuente;
- **Devolver Fuente:** acción visible;
- explicación: “Pon esta Fuente al fondo de tu Archivo. Roba 1 carta.”

### Resultado de la conversación

**Aprobada el 2026-08-10.**

- Se conserva el robo vigente: durante Preparación se roba 1; después de Preparación, Fácil roba 2;
  Normal y Difícil roban 1, o 2 si la Mano está vacía al comenzar el robo.
- Se conserva la devolución de Fuente vigente: sólo después de Preparación, durante la fase Principal
  del Cronista y una vez por turno, compartiendo la misma oportunidad con jugar una Fuente. La
  Fuente va al fondo del Archivo y el Cronista roba 1 carta.
- Se aprueba el vocabulario visible **Fuente**, **Energía**, **Reserva**, **Acción de Fuente** y
  **Devolver Fuente**, con la explicación “Pon esta Fuente al fondo de tu Archivo. Roba 1 carta.”
  **Acción de Fuente** nombra para el jugador el permiso compartido entre jugar y devolver; no exige
  renombrar el estado interno `energyActionUsedThisTurn`.

Estas decisiones cierran la Fase 0 y autorizan presentar, pero no implementar sin una nueva
aprobación, la Fase 1.

## Fase 1 — Rediseñar la presentación de Preparación

### Problema actual

La UI mezcla **Preparación** con expresiones propias de turnos normales:

- “quedan N turnos del jugador”;
- “Turno adicional”;
- “Último turno adicional”;
- “Siguiente turno”;
- “Terminar turno”.

Esto hace razonable que el jugador espere robo, Reserva y alternancia normales durante esos pasos.

### Propuesta inicial para discutir

Presentar Preparación como una etapa con progreso propio:

```text
PREPARACIÓN
Paso 1 de 3
● ○ ○
```

La cantidad debe reflejar la dificultad elegida; nunca se fijará visualmente en tres.

Cambiar las acciones principales:

- pasos intermedios: **Siguiente preparación**;
- último paso: **Despertar a la Hueste**.

Durante esta etapa, la Reserva aparece cerrada o latente:

```text
RESERVA
Se activa cuando la Hueste despierte
```

### Beneficio para el jugador

Entiende que está construyendo su posición antes de comenzar la alternancia real. Ya no necesita
deducir por qué no apareció Reserva después de un paso temprano.

### Decisiones que deben discutirse antes de implementar

- ubicación exacta del progreso `Paso/total`;
- puntos, números, runas u otro motivo visual para el progreso;
- copy definitivo de los dos botones;
- si la Reserva se muestra bloqueada, apagada o parcialmente oculta;
- cuánto énfasis visual recibe el despertar de la Hueste.

### Límites de la fase

- no cambia cuántas preparaciones concede cada dificultad;
- no añade tutorial, diálogos ni coach marks;
- no implementa todavía la Reserva prevista.

### Implementación después de aprobar el diseño

Los consumidores probables son `TurnPhaseHud`, `GameStatusBadge`, `PhaseBanner`, `PhaseOrb`, las
traducciones y sus estilos. Si el progreso necesita conocer el total original, su representación debe
respetar resume y persistencia.

### Condición para cerrar la fase

El jugador siempre puede distinguir Preparación de un turno normal, saber en qué paso se encuentra y
entender que la acción final despertará a la Hueste.

### Estado de implementación

**Cerrada el 2026-08-10 tras QA visual del usuario.**

- El HUD superior sustituye durante Preparación el turno, la fase normal y la cuenta de Oleada por
  el rótulo compacto **Preparación X/N**.
- El total original procede de `setupTurns`, que ya se conserva en el guardado de reanudación; la
  derivación pura vive en `src/components/setupPresentation.ts` y cubre una partida reanudada.
- Los banners de “Fase principal”, “Turno adicional” y “Último turno adicional” se sustituyen por
  **Preparación X/N**. Al pasar de la última Preparación a la Hueste aparece **La Hueste despierta**.
- El contador `X/N` del banner usa una tipografía de interfaz con cifras tabulares, separada del
  título ornamental, para que los números sean legibles y no cambien de ancho entre pasos.
- El banner general de fases usa una placa de hierro sin pictogramas que crece con el texto y
  conserva margen lateral constante. Preparación y Principal armonizan en oliva, Defensa en azul
  acero y Batalla/Hueste mantienen acentos cálidos; banner y botón comparten familia sin repetir
  exactamente el mismo color.
- Durante Preparación, el indicador inferior derecho reemplaza `Principal · Batalla · Final` por un
  rombo para cada paso (`Prep. 1`, `Prep. 2`, etc.), conservando estados actual, completado y
  pendiente. El número de rombos procede de la dificultad y no está fijado en tres.
- La acción principal conserva el lenguaje de turnos solicitado en QA: **Turno extra** en los pasos
  intermedios y **Terminar turno** en el último.
- La pista de Reserva permanece visible y utilizable durante Preparación: los efectos de carta pueden
  llenarla y esa Energía puede gastarse de inmediato. La fila amarilla no añade iconos ni mensajes
  permanentes; durante Preparación su tooltip explica solamente que la Energía de Fuentes sin usar
  se guarda cuando termina la Preparación. No se usa candado ni apagado de orbes, porque sólo se
  retrasa esa conversión, no la Reserva.
- La presentación equivalente existe en ES y EN. No se modificaron reglas, dificultad, robo, Reserva
  ni balance.
- El componente de estado legado ya no conserva el antiguo mensaje de “turnos del jugador” y el
  banner elimina su movimiento cuando el sistema solicita movimiento reducido.

La implementación pasó typecheck, la suite completa y el build web. El QA visual confirmó
legibilidad, ubicación y transición final; el banner también respeta movimiento reducido.

## Fase 2 — Mostrar el Archivo del Cronista y anticipar el robo

### Problema actual

El jugador ve su Mano, pero no dispone de una indicación clara y permanente de:

- cuántas cartas quedan en su Archivo;
- cuántas robará al comenzar su próximo turno;
- que una Mano vacía puede conceder un segundo robo.

### Propuesta inicial para discutir

Añadir un indicador cerca de la Mano o del grupo de zonas del Cronista:

```text
ARCHIVO             22
PRÓXIMO ROBO         1
```

Cuando la Mano vacía sea la causa del robo adicional:

```text
MANO VACÍA
PRÓXIMO ROBO         2
```

El indicador se actualiza al jugar o perder la última carta. Durante el robo real, un feedback breve
puede mostrar:

> Mano vacía: +1 carta

No debe atribuirse esa causa cuando la dificultad Fácil ya roba 2 por su regla normal.

### Beneficio para el jugador

Puede planear si vaciar su Mano y entiende el origen de la carta adicional cuando ocurre. El Archivo
propio también se convierte en el destino lógico de la acción **Devolver Fuente** de la fase siguiente.

### Decisiones que deben discutirse antes de implementar

- posición y tamaño del Archivo del Cronista;
- si “Próximo robo” es permanente o gana énfasis sólo cuando cambia;
- tratamiento visual de **Mano vacía**;
- forma de distinguir el robo por dificultad del robo adicional por Mano vacía;
- origen y trayectoria de la animación de robo.

### Boceto inicial

```text
┌──────────────────────┐
│ Archivo          22  │
│ Próximo robo      1  │
└──────────────────────┘
            ↓
      [ MANO DEL JUGADOR ]
```

### Límites de la fase

- no permite inspeccionar cartas ocultas;
- no cambia tamaño máximo de Mano;
- no implementa todavía la devolución de Fuente.

### Implementación después de aprobar el diseño

La cantidad del próximo robo debe proceder de la misma función pura que usa la resolución real. No
se duplicarán reglas dentro de `DuelHud` o `Hand`.

### Condición para cerrar la fase

La previsión coincide con el robo real en Preparación, Fácil, Normal, Difícil, Mano vacía y Mano no
vacía.

### Estado de implementación

**Cerrada el 2026-08-11 tras QA visual del usuario.**

- Una banda compacta sobre el panel de Vida muestra permanentemente **Archivo** y **Próximo robo**
  sin invadir Fuentes/Reserva ni permitir inspeccionar cartas ocultas.
- **Fácil** y **Caos** se identifican dentro del indicador cuando explican el robo. El bono de Mano
  vacía conserva el `2` limpio y explica **Mano vacía: +1 carta** mediante tooltip sobre la cifra.
- `playerDrawForecast` es la única fuente de verdad para la previsión y la resolución real. Limita
  la cifra por las cartas disponibles en el Archivo, distingue Preparación de las reglas de robo 2
  y proyecta correctamente que el robo posterior a la última Preparación ya ocurre tras la Hueste.
- Las cartas añadidas después de la Mano inicial entran visualmente desde el lado del Archivo.
- La presentación existe en ES y EN y respeta movimiento reducido.

**Revisión de presentación aprobada el 2026-08-11.** La banda apilada sobre la Vida confundía el
Archivo con la Vida, porque compartía la gramática de un panel de vitals y porque la Hueste sí
muestra su Archivo como barra de vida. Maquetas en `dev/mockups/player-archive-vs-life.html` y
`dev/mockups/player-vitals-row.html`.

- La esquina es ahora una sola fila `[Memoria][Archivo][Vida]` de altura común. Memoria y Archivo
  comparten silueta de caja de cartas y sólo cambian de color; la Vida es el único panel de vitals
  y ocupa la esquina de la pantalla.
- Cada caja imprime su nombre —**Memoria**, **Archivo**— en la base y lleva una tapa en su canto
  superior. La tapa vive dentro del marco: la fila de la Hueste se apoya en el borde superior de la
  pantalla y cualquier adorno que sobresalga se corta ahí.
- La Memoria de la Hueste usa la misma caja, en fila con su panel. El botón que asomaba por detrás
  del marco queda retirado en ambos bandos.
- **Próximo robo** deja de mostrarse de forma permanente: el robo normal es una regla que se aprende
  una vez. Sólo cuando `playerDrawForecast` supera una carta aparece una insignia `+1` sobre el
  Archivo, con la razón (Fácil, Caos) o el tooltip de Mano vacía.
- La previsión sigue saliendo de `playerDrawForecast`; sólo cambió cuándo se pinta.

## Fase 3 — Hacer visible la acción Devolver Fuente

### Problema actual

La acción depende de descubrir un arrastre hacia una zona lateral asociada visualmente al panel de
Vida. La ayuda aparece cuando el jugador ya ha comenzado el gesto, por lo que muchos jugadores pueden
no descubrir nunca esta regla.

También resulta poco visible que jugar y devolver una Fuente consumen la misma acción del turno.

### Propuesta inicial para discutir

Al seleccionar o mantener el cursor sobre una Fuente de la Mano:

```text
[JUGAR FUENTE]   [DEVOLVER · ROBAR 1]
```

Mostrar cerca de la Mano:

```text
ACCIÓN DE FUENTE
Disponible
```

Después de usar cualquiera de las dos opciones:

```text
ACCIÓN DE FUENTE
Usada este turno
```

Los botones desactivados permanecen visibles y explican el motivo:

- disponible después de la Preparación;
- sólo durante la fase Principal;
- Acción de Fuente ya utilizada.

El arrastre puede conservarse como atajo, pero su destino pasa a ser el Archivo del Cronista. La
animación muestra la Fuente entrando al fondo del Archivo y otra carta saliendo de la parte superior
hacia la Mano.

### Beneficio para el jugador

Descubre una herramienta central para corregir manos con demasiadas Fuentes y entiende el coste de
oportunidad entre jugar una Fuente o cambiarla por otra carta.

### Decisiones que deben discutirse antes de implementar

- botones sobre la carta, debajo de la Mano o en un panel contextual;
- si el estado de Acción de Fuente es permanente o sólo aparece cuando hay una Fuente en Mano;
- apariencia del destino de arrastre;
- copy visible: **Devolver**, **Cambiar** u otra opción compatible con el vocabulario aprobado;
- comportamiento con ratón, teclado y movimiento reducido.

### Límites de la fase

- no cambia timing, frecuencia ni balance aprobados en la Fase 0;
- no permite elegir la carta robada;
- no rediseña todas las interacciones de la Mano.

### Implementación después de aprobar el diseño

Los consumidores probables son `Hand`, el indicador del Archivo del Cronista, `EnergyRecycleAnimator`,
el store y traducciones. La regla sigue resolviéndose en el engine.

### Condición para cerrar la fase

Un jugador puede descubrir y ejecutar ambas opciones sin conocer previamente un gesto secreto. La
UI comunica que ambas consumen la misma acción.

### Estado de implementación

**Cerrada el 2026-08-11 tras QA visual del usuario.**

- Únicamente mientras se arrastra una Fuente que `canPlayerRecycleEnergy` permite devolver, el
  indicador existente del Archivo crece hacia la izquierda hasta convertirse en una caja amplia.
- La expansión del Archivo anima el cambio completo de tamaño; conserva sólo su marco exterior y
  usa tono y resplandor para comunicar el destino, sin un segundo rectángulo punteado interior.
- Antes de alcanzar la zona válida comunica **Devolver Fuente · Arrastra a la derecha · Roba 1**.
  Al entrar en ella cambia a **Suelta para devolver · Al Archivo · Roba 1** y refuerza su brillo.
- Al alcanzar esa región reaparecen el feedback original de devolución: línea punteada con flecha,
  etiqueta flotante y círculo pulsante centrado sobre la caja expandida del Archivo.
- Se conserva el gesto anterior: desplazamiento horizontal mínimo y liberación en la región amplia
  superior derecha de la pantalla. No se exige acertar con precisión en el panel del Archivo.
- El Archivo no cambia al pasar el cursor, seleccionar o enfocar una Fuente, y no incorpora una
  acción de clic. Jugar conserva exactamente su gesto normal hacia el Campo.
- El vuelo final termina en el indicador del Archivo del Cronista. La devolución sigue resolviéndose
  mediante `recycleEnergy`; la presentación no duplica sus reglas de disponibilidad.
- Jugar o devolver sigue consumiendo el mismo permiso. No cambió timing, frecuencia, balance ni la
  carta robada.

**Revisión de presentación aprobada el 2026-08-11.** Con el Archivo convertido en caja de cartas, la
expansión a una caja amplia con texto propio se retira: durante un arrastre válido la caja se
enciende y crece (`scale(1.06)`, y `scale(1.12)` al entrar en la región de destino). El gesto, sus
condiciones y el feedback flotante —línea punteada, etiqueta **Devolver Fuente · Suelta para
devolver** y círculo pulsante— no cambian; el Archivo ya no repite ese texto en un panel propio.

## Fase 4 — Clarificar Reserva actual, Reserva prevista y orden de pago

### Problema actual

Las pistas de orbes muestran valores, pero no explican suficientemente:

- qué representa cada pista;
- cuándo aparecerá nueva Reserva;
- por qué pasos tempranos de Preparación no la conservan;
- por qué al pagar se consume Reserva antes de agotar Fuentes.

### Propuesta inicial para discutir

Etiquetar de forma compacta el núcleo de Energía:

```text
FUENTES LISTAS       2
RESERVA            1 / 3
AL VOLVER            +2
```

`Al volver` significa: Reserva que estará disponible después del próximo turno de la Hueste.

- No aparece en Preparaciones tempranas que conducen directamente a otro paso del Cronista.
- Puede aparecer en la última Preparación porque después actuará la Hueste.
- Durante el turno enemigo, los puntos pendientes pueden permanecer translúcidos.
- Al regresar al Cronista, se vuelven sólidos mediante la animación existente o una evolución de ella.

Al pagar una carta, la secuencia visible es:

1. se consume Reserva;
2. se agotan sólo las Fuentes necesarias;
3. las Fuentes restantes alimentan la nueva previsión.

### Beneficio para el jugador

Puede decidir cuánto gastar, cuánto reservar y qué sucederá al terminar la ronda. El orden de pago
deja de parecer arbitrario.

### Decisiones que deben discutirse antes de implementar

- nombres definitivos de las dos pistas;
- ubicación de `Al volver`;
- orbes translúcidos, cifra `+N` o ambos;
- cuánto dura el feedback del orden de pago;
- comportamiento cuando la Reserva ya está llena.

### Límites de la fase

- no cambia el límite 3;
- no cambia el orden automático de pago;
- no conserva Energía de Preparaciones tempranas;
- no añade selección manual de Fuentes para pagar.

### Implementación después de aprobar el diseño

La previsión debe derivarse mediante una función pura compartida con las reglas. `Battlefield` y los
animadores sólo presentan la cantidad ya resuelta o prevista.

### Condición para cerrar la fase

La UI nunca promete Reserva que después se pierde y el jugador puede observar claramente Reserva
primero, Fuentes después.

### Estado de implementación

**Cerrada el 2026-08-11 tras QA visual del usuario.**

- Se conserva el lenguaje actual de dos pistas y sus orbes; no se añadieron etiquetas, cifras ni
  paneles permanentes.
- La pista azul distingue sus tres estados por material y volumen, no sólo por luminosidad: una
  Fuente lista es una esfera encendida, una Fuente gastada conserva una esfera de vidrio azul oscuro
  sin líquido y una Fuente todavía no jugada deja visible únicamente el socket.
- Durante la Hueste, `pendingStoredEnergy` permanece pendiente y no se presenta todavía como un orbe
  amarillo. La transferencia comienza únicamente cuando termina la Hueste y regresa el Cronista.
- Cuando `releasePendingStoredEnergy` convierte esa cantidad en Reserva real, el mismo orbe sale de
  su socket azul, viaja al primer socket amarillo libre y adopta el acabado dorado cerca del destino.
  La transferencia reutiliza el lenguaje del flujo de Energía de las cartas: una corriente dorada con
  motas conduce una semilla por una curva orgánica; al impactar, el orbe real —incluidos su líquido,
  reflejo y anillo interior— crece, brilla y se asienta en el socket. La Fuente azul se regenera con el
  mismo pulso al concluir la conversión.
- El socket azul queda libre durante el vuelo y recupera su orbe al terminar, mientras el orbe
  transformado permanece en la pista amarilla como Reserva disponible.
- La cantidad y los destinos se derivan de la reducción pendiente y del aumento de Reserva ya
  resueltos por el engine; por ello
  Preparaciones tempranas, Fuentes usadas y espacios fuera del límite de tres no producen vuelos.
- La liberación se limita además por las Fuentes que continúan presentes y listas al terminar la
  Hueste. Una Fuente destruida —por ejemplo, mediante Tributo de los Cuatro Pesares— no conserva
  una Reserva pendiente fantasma.
- Varias transferencias se escalonan brevemente. Con movimiento reducido, la transformación usa un
  fundido en el socket de destino sin recorrido espacial.
- No cambió la regla de Reserva, el límite de tres ni el orden automático de pago.

## Fase 5 — Hacer inequívoco el ataque al Archivo de la Hueste

Estado: **cerrada el 2026-08-11 tras QA visual del usuario.**

### Problema actual

La convención habitual de otros juegos hace pensar que los Ecos atacan a los Ecos enemigos. El panel
superior representa a la Hueste, pero no insiste en que su Archivo es el objetivo del ataque y su
condición de derrota.

La fórmula actual `daño / umbral = -cartas` exige interpretar división, redondeo y resta al mismo
tiempo.

### Diseño aprobado e implementado

Se compararon cuatro variantes en `dev/mockups/host-archive-combat-options.html`. El usuario eligió
la opción 4, **Cartas que caerán**:

- el panel se identifica permanentemente como **Archivo de la Hueste**;
- al seleccionar atacantes, el conteo anticipa `actual → restante`;
- una placa contigua usa hasta tres siluetas como símbolo de las cartas que irán a Memoria; las
  siluetas nunca intentan repetir o desglosar el total numérico;
- la placa no lleva copy: las siluetas comunican “cartas” y `N` es el único total visible;
- al seleccionar atacantes, esa placa emerge unida al borde izquierdo como una extensión del
  Archivo —sin margen ni doble borde— y desplaza la caja de Memoria todavía más a la izquierda;
- la matemática vive en un tooltip titulado **Cálculo del ataque**, con la forma compacta
  `7 ÷ 3 → 2`; no repite “Fuerza”, “cartas” ni “Memoria”;
- se usa una flecha y no una igualdad porque la conversión descarta cualquier sobrante;
- al confirmar, cada carta de combate nace en el área numérica de la placa y viaja hacia Memoria;
  cada salida reduce `N` y Memoria suma la carta sólo al aterrizar;
- durante el último vuelo la placa conserva `1`; al aterrizar, se retrae dentro del Archivo sin
  mostrar `0`, mientras Memoria vuelve a su posición normal;
- **A batalla**, **Confirmar** y **No atacar** pasan a **Elegir atacantes**,
  **Atacar el Archivo** y **Pasar el combate** respectivamente.

El modelo de presentación usa `hostRules.damagePerArchiveDiscard`, limita el resultado a las cartas
que realmente quedan en el Archivo y cubre cero, una, varias y más de tres cartas.

### Beneficio para el jugador

Comprende dónde debe atacar, cómo progresa hacia la victoria y qué conseguirá antes de confirmar el
combate.

### Decisiones cerradas en esta iteración

- el panel nombra el Archivo también fuera del combate;
- no se utiliza medidor de bloques;
- la placa muestra el resultado incluso cuando es cero;
- la explicación secundaria es puramente matemática;
- los tres botones de combate nombran la acción concreta.

### Límites de la fase

- no permite ataques normales contra Ecos enemigos;
- no cambia el umbral autorizado por el deck;
- no acumula Fuerza sobrante entre combates;
- no rediseña Veneno.

### Implementación después de aprobar el diseño

El preview usará `hostRules.damagePerArchiveDiscard`; nunca se codificará el número 3 en la UI. Debe
probarse con umbrales alternativos aunque los decks actuales compartan el mismo valor.

### Condición para cerrar la fase

Preview, CTA, trayectorias, animación y descarte real identifican al Archivo y coinciden para cero,
una y varias cartas.

## Fase 6 — Revisar el conjunto antes de diseñar el tutorial

### Problema que resuelve

Cada cambio puede funcionar por separado y aun así producir una pantalla demasiado cargada. Esta
fase revisa la jerarquía completa con el usuario antes de declarar estable el nuevo lenguaje visual.

### Conversación inicial

El agente debe presentar un inventario visual de lo implementado:

- progreso de Preparación;
- Archivo y próximo robo;
- Acción de Fuente;
- Fuentes listas, Reserva y previsión;
- objetivo y conversión del ataque.

Debe explicar qué información es permanente, cuál aparece sólo en contexto y cuál se oculta cuando no
es relevante. El usuario puede pedir simplificación, movimiento o eliminación antes del pase final.

### Revisión propuesta

- legibilidad en ES y EN;
- Mano pequeña, grande y vacía;
- Preparación Fácil, Normal y Difícil;
- Reserva vacía, parcial y llena;
- uso con ratón y teclado;
- movimiento reducido;
- ataques por debajo, en y por encima del umbral;
- animaciones y overlays que puedan tapar indicadores;
- transiciones de la Mano al robar, Invocar, jugar o devolver una Fuente: la carta nueva debe salir
  del Archivo y las cartas restantes deben reorganizarse sin saltos;
- estados que no dependan sólo de color.

### QA manual mínimo del usuario

1. Un paso temprano de Preparación no promete Reserva.
2. La última Preparación anticipa correctamente lo que llegará después de la Hueste.
3. Mano vacía y no vacía muestran el próximo robo correcto según dificultad.
4. Jugar una Fuente bloquea devolver otra durante el mismo turno y viceversa.
5. Devolver una Fuente comunica fondo del Archivo y robo de una carta.
6. Un pago mixto consume Reserva primero y sólo las Fuentes necesarias.
7. El jugador reconoce que el ataque se dirige al Archivo.
8. Ataques con distintos totales anticipan exactamente cuántas cartas se descartarán.

### Cierre

Después de los ajustes aprobados, actualizar `CLAUDE.md` y `docs/guides/testing.md` con los contratos finales.
Esta fase no implementa el tutorial.

## Verificación automática durante la implementación

Después de cada fase con cambios de código:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

Según los archivos modificados, añadir pruebas específicas de presentación. El agente no debe
levantar un servidor ni jugar el juego; el usuario realiza el QA interactivo.

## Cuándo regresar al diseño del tutorial

El diseño del tutorial obligatorio puede retomarse cuando:

- las decisiones de la Fase 0 estén registradas;
- el usuario haya aprobado e implementado las Fases 1 a 5;
- la revisión conjunta de la Fase 6 esté cerrada;
- la UI normal permita anticipar Preparación, robo, Acción de Fuente, Reserva y ataque sin depender de
  texto exclusivo del tutorial.

En ese momento el tutorial podrá concentrarse en hacer que el jugador realice esas acciones en una
Primera Semilla guiada, utilizando la misma interfaz que encontrará después.
