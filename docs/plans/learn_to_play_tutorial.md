# Aprender a jugar — diseño vivo del onboarding

Estado: **diseño del prólogo abierto; derrota y handoff hacia la primera Visión Canon fijados e
implementados. La experiencia posterior tiene un plan propio aprobado**.

Última actualización: **2026-09-01**.

## Propósito del documento

Este es el documento vivo para diseñar el prólogo principal **Aprender a jugar** hasta que
**Contemplar otro futuro** entrega la partida normal. Su objetivo es conservar las decisiones
pedagógicas, narrativas y de partida de ese tramo con suficiente precisión para analizar el
framework y planear su implementación.

No es todavía una receta de `src/guidance/`, un desglose técnico ni una autorización para cambiar
código. Las decisiones marcadas como abiertas no se deben completar por inferencia durante la
implementación.

La auditoría de los sistemas existentes y el plan incremental correspondiente viven en
[`learn_to_play_implementation_plan.md`](learn_to_play_implementation_plan.md). Este documento sigue
siendo la fuente de verdad del contenido; el otro gobierna arquitectura, riesgos y fases.

La Mano, el mulligan, la Preparación mental y las ayudas contextuales dentro de la Visión normal
`HF1-ELA-GRV-082-QC5` pertenecen a
[`first_canon_vision_plan.md`](first_canon_vision_plan.md). Este documento termina en el handoff y
no debe volver a declarar decisiones de esa partida posterior.

El recorrido guiado que existe actualmente no se elimina. La intención de producto es conservarlo
como un tutorial específico llamado **Preparación**. El nuevo recorrido principal será **Aprender a
jugar**. Los nombres, menús y registros actuales continúan sin cambios hasta que se apruebe una fase
de implementación.

## Decisiones globales ya fijadas

- **Aprender a jugar** será el tutorial obligatorio y también podrá repetirse desde **Cómo jugar**.
  **Preparación** conservará el contenido guiado actual, pero será un tutorial opcional.
- Si el jugador abandona el recorrido iniciado antes de completarlo, no se guarda un paso intermedio:
  la próxima vez empieza otra vez desde el cold open.
- El tutorial no ofrece libertad total. Presenta una partida authored y determinista, con cartas,
  estados y órdenes preparados para que todas las decisiones permitidas sean conocidas y puedan ser
  contempladas por el diseño.
- Esa libertad acotada debe seguir sintiéndose como una partida. No se autoriza una secuencia
  permanente de «haz clic aquí → ahora aquí».
- Algunas intervenciones sí pueden usar el comportamiento guiado actual cuando una acción básica
  necesita aprenderse de forma inequívoca, por ejemplo Jugar una Fuente, Invocar un Eco o asignar
  un defensor.
- Las demás explicaciones aparecen cuando la mecánica sucede por primera vez o cuando el jugador
  intenta una acción cuya restricción todavía no conoce.
- Completar el recorrido no exige haber provocado todos los tutoriales contextuales. Cada
  concepto conserva su propio estado; lo que no ocurrió permanece como `no visto` y puede enseñarse
  en una partida posterior cuando por fin exista la situación adecuada.
- **No volver a mostrar explicaciones ya vistas** es una preferencia global. Suprimir repeticiones
  nunca suprime el primer encuentro de un concepto: toda ayuda con estado `no visto` aparece una vez
  cuando finalmente ocurre su contexto. Estará activa por defecto; un concepto cuenta como visto al
  cerrar/aceptar su ayuda y, si se permiten repeticiones, aparece como máximo una vez por partida.
- Una regla oculta que puede cambiar una decisión irreversible se explica **antes** de confirmar esa
  decisión. Una consecuencia visible y recuperable puede explicarse después de ocurrir.
- El prólogo terminará más adelante en una derrota predeterminada. Debe sentirse como un futuro que
  ya estaba perdido, no como un castigo por jugar mal el tutorial.
- La derrota ocurre en el primer ataque de cierre. Antes de revelar esa última fuerza, el escenario
  calcula el mejor resultado defensivo que todavía puede conseguir el jugador e Invoca un Titán y
  tantos Soldados Sinsepulcro como sean necesarios para que ningún resultado legal evite la muerte.
- Esta Invocación terminal es un evento authored del futuro perdido, no una ampliación de la regla
  general de Estampida. La Estampida normal se habrá enseñado antes con sus revelados reales.
- Tres Soldados reales dentro del Archivo protegen al Titán terminal de los tres descartes opcionales
  máximos. Choque de Ecos conserva su ventana legal después de ver la fuerza terminal, y la posición
  del Titán puede variar como consecuencia de los descartes anteriores.
- El CTA único de salida se llama **Contemplar otro futuro**. Activarlo completa el tutorial y,
  mediante el vórtice, inicia la Inscripción Canon aprobada `HF1-ELA-GRV-082-QC5`: **El Pacto de Elarion**
  contra **El Alzamiento de los Sinsepulcro**, dificultad Normal y tres turnos de Preparación.
- En esa partida real y en las siguientes, las ayudas pendientes serán contextuales. La experiencia
  exacta de la primera Visión y su política de repetición están fijadas en
  `first_canon_vision_plan.md`.
- En el código actual **Continuar** permanece deshabilitado. El objetivo aprobado para la demo es
  ocultarlo y apagar resume mediante la capability descrita en el plan de historial de Semillas,
  conservando su implementación para Early Access.
- El primer corte de implementación termina cuando **Contemplar otro futuro** registra la
  finalización, ejecuta el vórtice y carga `HF1-ELA-GRV-082-QC5` como partida normal.
- La introducción cinematográfica, las voces y las líneas narrativas finales quedan fuera de la
  implementación actual. El documento sólo conserva su intención y copy provisional.

## Principio pedagógico

La unidad del tutorial no es el clic: es la **situación de juego**.

El ritmo buscado es:

`el jugador decide → la regla produce una consecuencia real → la ayuda aparece sólo si hace falta → la partida continúa`

Hay cuatro clases de intervención:

| Clase | Cuándo se usa | Ejemplo de esta fase |
| --- | --- | --- |
| Guiada | La acción básica debe realizarse para construir el escenario siguiente. | Jugar la cuarta Fuente e Invocar a Aelyra. |
| Preventiva | Una regla no evidente puede cambiar una decisión que está por confirmarse. | La Hueste resuelve sus ataques de izquierda a derecha. |
| Reactiva | El jugador intenta algo inválido o provoca por primera vez una consecuencia relevante. | Intentar defender un Volador con Aelyra o recibir daño en la Vida. |
| Observada | La propia interfaz y la animación ya explican suficientemente el resultado. | Aelyra coloca su contador +1/+1; la Cosechadora crece al morir Zombis. |

No debe abrirse un cuadro para repetir información que ya comunican el texto de la carta, las
flechas de objetivos, el brillo de los candidatos y el cambio visible de estadísticas.

---

## Fase 1 — El futuro perdido antes de la Estampida

### Alcance

Esta fase comienza después del único párrafo de Evy que abre el recorrido y termina cuando comienza
la Estampida y se presenta su explicación independiente.

Incluye:

- dos turnos del Cronista dentro de una partida avanzada;
- un turno ordinario de revelado, ataque y defensa de la Hueste;
- Fuente, Energía, Reserva y preparación de Fuentes;
- Invocación, elección de objetivo, Volar, Guardia aérea y Estabilizándose;
- orden de ataque de la Hueste;
- una primera lectura de Vida si el jugador recibe daño;
- la entrada de Vaelor y la cadena de la Cosechadora;
- inspección ampliada de una carta;
- el intento de enseñar el ataque al Archivo antes de la Estampida.

No incluye todavía:

- las cartas reveladas por la Estampida;
- el camino desde la Estampida hasta la derrota;
- los valores finales de Vida y del Archivo de la Hueste;
- la escena de derrota, el CTA **Contemplar otro futuro** o el mulligan;
- la partida real posterior al prólogo.

### Cold open

La antesala temporal implementada usa un solo modal localizado. Evy es la única voz; el Cronista no
responde ni aparece como speaker:

> Evy: «¡Cronista, ayuda! Contuve a la Hueste cuanto pude, pero esta Visión ya está en marcha. Dejé
> tres Fuentes preparadas y Maela aún resiste; continúa desde aquí antes de que la Hueste vuelva a
> avanzar.»

El launcher permanece en **Cómo jugar** mientras este modal está abierto. Cerrarlo vuelve al mismo
panel; el único CTA **Continuar la Visión** inicia el lifecycle y carga la partida avanzada. No hay
contador de diálogos, beats intermedios ni parlamentos del Cronista.

Al llegar al tablero, el indicador comunica que faltan dos turnos para la Estampida. El narrador
advierte que la Hueste está cerca de fortalecerse. El copy exacto de esa advertencia sigue abierto.

### Estado exacto de entrada

#### Cronista

Campo:

- **Maela, Vigía de las Alturas** preparada.
- Tres **Ríos de Elarion** preparados.

Mano:

- Un **Río de Elarion**.
- **Aelyra, Heredera de Elarion**.
- **Vaelor, Guardián Esmeralda**.

Próxima carta del Archivo:

- **Flor del Alba**.

#### Hueste

El orden authored inicial, de izquierda a derecha, es:

1. **Retorno a la Memoria**, 2/1.
2. **Acechador Alado de la Cripta**, 2/1 con Volar.
3. **Engendro de Alas Cosidas**, 3/1 con Volar.
4. **Cosechadora de los Caídos** con dos contadores +1/+1: 4/6.

La primera carta preparada para el siguiente revelado es la segunda copia de **Acechador Alado de
la Cripta**. Al ser un Eco no Ficha, detiene el revelado normal de esta Hueste. No entra ningún
Infestado de Esporas en el recorrido fijado: quedó fuera tanto del Campo inicial como de la primera
Estampida y del cierre terminal.

La Cosechadora debe resolver su ataque después de varios Zombis, aunque una nueva llegada pueda
ocupar una posición posterior. La experiencia depende de que muertes anteriores puedan fortalecerla
antes de su propio combate. Antes de implementar habrá que validar que el orden visual, el orden
authored y el orden real de resolución sigan comunicando la misma cronología incluso cuando dos
copias se agrupen visualmente.

### Turno 1 del Cronista

Antes de señalar la carta, Evy entrega el siguiente tramo:

> Evy: «Has llegado. Preparemos una Fuente más antes de que la Hueste vuelva a avanzar. Será la
> cuarta; con ella llenaremos por completo el contenedor de Energía.»

Al continuar aparece la instrucción actual **Juega Río de Elarion**.

Objetivos requeridos:

1. Jugar el cuarto Río de Elarion.
2. Invocar a Aelyra usando una Energía.

El jugador elige libremente si Aelyra se da el contador +1/+1 a sí misma o se lo da a Maela. La UI
normal muestra la flecha, ilumina objetivos válidos y actualiza las estadísticas; no aparece una
explicación adicional sobre qué hace un contador.

Después de la Invocación quedan tres Fuentes preparadas. El jugador termina el turno y la Energía
de esas tres Fuentes queda pendiente para convertirse en Reserva tras el turno de la Hueste.

No hace falta añadir otro turno previo sólo para explicar que las Fuentes vuelven a prepararse: la
repetición real y su animación durante este mismo tramo aportan el contexto suficiente.

### Turno intermedio de la Hueste

La Hueste revela e Invoca el segundo Acechador Alado de la Cripta. Después ataca con todos sus Ecos
capaces, siguiendo sus reglas normales.

Antes de que el jugador confirme defensores se deben comunicar dos ideas:

1. cómo asignar un Eco para defender contra un atacante;
2. que los ataques de la Hueste se resuelven de izquierda a derecha y que lo ocurrido primero puede
   modificar los combates siguientes.

La segunda idea no puede dejarse sólo a la intuición. El jugador podría interpretar la secuencia
visual como una animación sin relevancia mecánica. Presentación provisional:

**El orden importa**

> Los ataques de la Hueste se resuelven de izquierda a derecha. Lo que ocurra en un combate puede
> cambiar los siguientes.

Debe acompañarse con una lectura visual de izquierda a derecha, pero no recomendar bloqueadores ni
resolver la decisión por el jugador. Las dos ideas no necesitan convertirse en dos modales
consecutivos; la forma exacta de integrarlas se decidirá al diseñar la presentación.

Intervenciones reactivas:

- Si intenta defender contra un Eco con Volar usando a Aelyra, se explica que sólo Volar o Guardia
  aérea puede hacerlo y se señala que Maela posee Guardia aérea.
- Si un ataque sin defender daña al Cronista, se explica la Vida cuando el impacto ya es visible.
- Si algún Eco sobrevive con daño, la ayuda evita describir estados internos y enseña únicamente:
  **«Al final de cada turno, los Ecos supervivientes recuperan todo su Aguante»**.
- No se explican anticipadamente todas las palabras clave presentes en el tablero.

La asignación de defensores debe conservar decisiones reales. La Cosechadora comienza como 4/6 para
que Maela y Aelyra juntas no puedan destruirla: su Fuerza combinada máxima en este escenario es 5.
Si muere uno de los otros Zombis antes de que llegue el combate de la Cosechadora, ella recibe el
contador antes de atacar y demuestra por qué importa el orden de izquierda a derecha.

### Último turno antes de la Estampida

Justo antes de habilitar **Mi Turno**, la recuperación del Aguante es la última ayuda pendiente si
hubo Ecos supervivientes dañados. Su cuadro aparece por encima del botón de acción para no tapar
las cartas, mientras los Ecos afectados siguen señalados. Al confirmar el cambio de turno, la guía
presenta **Ahora es tu turno** y pide mirar lo que sucede con la Energía.

Al aceptar esa explicación, la presentación normal deja visibles y completa primero estos
movimientos:

- las cuatro Fuentes vuelven a estar preparadas;
- la Energía de las tres Fuentes que quedaron sin usar llega a la Reserva;

Durante ese movimiento **Flor del Alba** ya puede estar comprometida por las reglas, pero permanece
retenida fuera de la Mano. Cuando la transferencia termina aparece **Conserva la Energía que no
uses**. Sólo al cerrar ese cuadro el Cronista roba visualmente **Flor del Alba**, con su sonido, y el
contenedor de Reserva ya está lleno y estable.

Sólo después de asentarse la entrada de Flor aparece **Usa tu Energía para Invocar nuevos Ecos**. La
explicación previa de Reserva cubre que:

- hasta tres Fuentes sin usar pueden conservar su Energía en la Reserva;
- las Fuentes se preparan otra vez para el nuevo turno;
- el consumo automático usa primero la Reserva y después Agota sólo las Fuentes necesarias.

El estado disponible es exactamente:

- 3 de Energía en la Reserva;
- 4 Fuentes preparadas;
- 7 de Energía total.

### Flor del Alba y Vaelor

Vaelor es la Invocación estructural del turno. La jugada natural usa también la Energía restante
para Invocar **Flor del Alba**, pero el flujo tolera que el jugador la deje en Mano. Si Invoca
ambos, elige el orden; no se prescribe una secuencia de clics.

- Flor primero consume 1 de Reserva; quedan 2 de Reserva y 4 Fuentes para Vaelor.
- Vaelor primero consume 3 de Reserva y 3 Fuentes; la Fuente restante permite Invocar la Flor.

En ambos órdenes se usan las 7 Energías y las cuatro Fuentes terminan Agotadas. Si el jugador deja
Flor en Mano, Vaelor consume 6 y una Fuente queda sin usar. La Flor Invocada está Estabilizándose,
por lo que no puede usar en ese mismo turno su Acción de Agotar para agregar Energía. Si el jugador
lo intenta, se explica Estabilizándose como respuesta al intento.

**Elixir de la Primera Hoja** queda descartado para este robo. Aunque también cuesta 1, puede dar
+3/+3 a un enemigo antes de Vaelor y permitir que sobreviva a la limpieza; además, al ser Rápido,
abre una rama adicional durante la defensa de la Estampida.

### Entrada de Vaelor

Al ser Invocado, Vaelor coloca un contador -1/-1 sobre cada enemigo. Todos los enemigos de Aguante
1 que sigan en el Campo mueren:

- Retorno a la Memoria;
- las dos copias de Acechador Alado de la Cripta;
- Engendro de Alas Cosidas.

Si alguno murió durante la defensa anterior, la Cosechadora ya recibió ese contador +1/+1 y Vaelor
sólo destruye los restantes. En todos los caminos permitidos, los otros cuatro Zombis habrán muerto
al terminar la cadena.

La Cosechadora:

- empezó con dos contadores +1/+1 y estadísticas 4/6;
- recibe cuatro contadores +1/+1 en total por esas muertes;
- recibe también el contador -1/-1 de Vaelor;
- termina como **7/9**.

La cifra 7/9 corrige el cálculo preliminar de 8/10: Vaelor también afecta a la Cosechadora.

No se abre un tutorial para contar las activaciones. Se deja que la Cosechadora se ilumine y crezca
con cada muerte. Cuando termina la cadena, se pide una vez abrir sus detalles ampliados con clic
derecho. La inspección permite relacionar el texto de la carta con lo que acaba de ocurrir.

Retorno a la Memoria descarta dos cartas del Archivo de la Hueste al morir. No se enseña todavía,
pero su efecto es real y el futuro orden del Archivo debe contemplarlo.

### Batalla del Cronista

La intención es introducir el ataque sin reunir todas las explicaciones en un solo cuadro:

- al entrar a Batalla, se enseña cómo elegir atacantes;
- se aclara que el Cronista ataca el Archivo de la Hueste, no a sus Ecos;
- en el primer cuadro sobre el Archivo se explica que cada 3 de daño de ataque hacen que se descarte
  una carta del Archivo de la Hueste a su Memoria;
- los Ecos enemigos se enfrentan cuando el Cronista defiende contra sus ataques;
- si intenta atacar con Vaelor o con la Flor, se explica que siguen Estabilizándose;
- cuando Maela o Aelyra ataque por primera vez, se explica que atacar Agota ese Eco y que no podrá
  defender durante el próximo turno de la Hueste.

El jugador elige libremente qué Ecos estabilizados atacan.

Esta enseñanza es **oportunista, no un requisito de la fase**. La defensa anterior puede matar tanto
a Maela como a Aelyra; si ocurre, Vaelor y Flor estarán Estabilizándose y no existirá un atacante
legal. El flujo continúa normalmente hacia la Estampida. Los conceptos «atacar el Archivo» y «atacar
Agota al Eco» permanecen como `no vistos` y se presentan la próxima vez que el jugador intente un
ataque válido, ya sea durante el prólogo o en cualquier partida real posterior.

No se restringen las defensas ni se altera el escenario sólo para garantizar esta explicación.

### Progreso contextual durante el prólogo

Vida, Volar/Guardia aérea, Estabilizándose y ataque son aprendizajes independientes. Que uno no se
active no bloquea el prólogo ni marca los demás como completados.

Mientras el recorrido siga incompleto, los conceptos vistos pertenecen únicamente al
intento actual. Si el jugador abandona, el prólogo se reconstruye desde el cold open y no persiste
nada de ese intento. Al completar el recorrido, se conservan sólo los conceptos que
realmente aparecieron; los demás siguen en `no visto` y pueden surgir contextualmente después. Si
la preferencia global de no repetir está activa, sólo se aplica a ese conjunto ya mostrado.

### Comienzo de la Estampida

El Cronista termina el turno y comienza la animación de Estampida. Cuando esa animación termina, el
turno de la Hueste ya ha cruzado el umbral, pero todavía no revela ningún Eco. En esa pausa aparece
la explicación: **«A partir de este turno, la Hueste desata todo su poder e Invoca más Ecos con cada
avance.»** Sólo después de aceptarla comienzan el revelado normal y los revelados adicionales.

La primera explicación pertenece exclusivamente a la Estampida: qué cambió y por qué la Hueste acaba
de volverse más peligrosa. El orden visual es un contrato: **animación → explicación → revelados**.

La Fase 1 termina en ese punto. La composición y continuación pertenecen a la Fase 2.

---

## Fase 2 — De la primera Estampida al futuro perdido

### Propósito

Esta fase enseña la Estampida, vacía la Mano mediante una consecuencia real, presenta el robo adicional
por Mano vacía y obliga a descubrir la acción **Devolver Fuente**. Después retira las instrucciones,
construye una fuerza terminal según el estado real alcanzado y termina con la derrota normal.

El jugador conserva libertad en sus defensas, en el uso de Choque de Ecos, en la Invocación del Eco
de la Ciudad Olvidada y en cualquier ataque legal al Archivo. El cierre no exige que esas ramas
lleguen al mismo tablero: calcula la fuerza necesaria después de observar cuál ocurrió.

### Archivo robusto para la primera Estampida

La muerte de Retorno a la Memoria ya habrá descartado siempre dos cartas. Después, el ataque
opcional previo a la Estampida puede descartar cero o una carta adicional. A partir del punto al que
llega ese desplazamiento, el segmento relevante es:

1. **Ladrón de Memorias A**.
2. **Ladrón de Memorias B**.
3. **Titán Sinsepulcro**.
4. **Soldado Sinsepulcro**.

Esto produce dos ramas equivalentes:

| Descarte opcional por ataque | Revelado normal | Dos revelados adicionales | Resultado nuevo |
| ---: | --- | --- | --- |
| 0 | Ladrón A | Ladrón B + Titán | dos Zombis 3/2 y un Zombi 6/5 |
| 1 | Ladrón B | Titán + Soldado | dos Zombis 3/2 y un Zombi 6/5 |

El Titán y el Soldado son Fichas, por lo que no detienen el revelado normal; el Ladrón sí lo detiene.
En ambas ramas aparece al menos un Ladrón de Memorias y la presión de combate es la misma.

### Primera Estampida

Antes de esta Estampida, la Cosechadora está en 7/9. La bonificación continua de la Estampida le da
+1/+0 y la presenta como 8/9 mientras esa bonificación permanezca activa.

Los dos cuerpos pequeños de la rama son 3/2 y el cuerpo grande es 6/5. Junto a la Cosechadora, la
Fuerza total de este ataque es 20 antes de cualquier cambio producido por el propio combate.

La ruta prevista Invoca a Vaelor y Flor del Alba y llega a la Estampida con la Mano vacía. Si el
jugador dejó Flor del Alba sin Invocar, el primer Ladrón de Memorias la descarta y produce el mismo
estado. Si aparece el segundo Ladrón, su Reacción ya encuentra la Mano vacía. El descarte debe verse
como una consecuencia de la carta, no como una instrucción arbitraria del tutorial.

Después se asignan defensores con libertad. No se exige una solución concreta y pueden morir tanto
Ecos del Cronista como miembros nuevos de la Hueste. La Cosechadora conserva todas las Reacciones
reales que produzcan esas muertes.

### Turno posterior: Mano vacía y robo adicional

Cuando comienza el siguiente turno del Cronista, las cuatro Fuentes vuelven a prepararse. Como la
Mano está vacía, la regla real de robo entrega dos cartas:

1. un **Río de Elarion**;
2. **Choque de Ecos**.

La ayuda contextual explica el robo adicional después de que ambas cartas hayan llegado y la
presentación se haya asentado: **«Si comienzas tu turno sin Ecos o Fuentes en la Mano, robas 2
cartas en lugar de 1.»** El cuadro aparece centrado sin resaltar la Mano; las dos cartas recién
robadas ya hacen evidente el área relevante. Mientras el cuadro está visible, bloquea todo el
tablero: no se pueden mover, jugar ni activar cartas. No se altera la regla de robo para el tutorial.

El jugador dispone inicialmente de cuatro Fuentes preparadas. Su Energía adicional depende de la
rama anterior:

- si Invocó Flor, las 7 Energías se consumieron y no llegó nada a la Reserva; si Flor sobrevivió,
  ya está estabilizada y su Acción puede agregar 1;
- si dejó Flor en Mano, el Ladrón la descartó y la Fuente que no usó liberó 1 de Energía a la
  Reserva;
- si Invocó Flor y después murió defendiendo, no tiene Flor ni Reserva adicional.

Puede:

- lanzar Choque de Ecos si conserva un aliado y existe un objetivo legal;
- intentar Jugar el quinto Río;
- Devolver el Río por iniciativa propia;
- intentar terminar el turno;
- usar la Acción de Flor del Alba si sigue en el Campo;
- realizar después cualquier ataque legal.

Si intenta Jugar el quinto Río, se explica que el límite es cuatro y se presenta **Devolver
Fuente**. Si intenta terminar el turno sin haber usado esa acción, se presenta la misma ayuda antes
de confirmar el fin. No se obliga a lanzar Choque ni a elegir un objetivo específico.

Devolver el Río:

- consume la Acción de Fuente del turno;
- coloca ese Río al fondo del Archivo;
- roba **Eco de la Ciudad Olvidada**.

El Eco de la Ciudad Olvidada cuesta 4. Puede Invocarse directamente con las cuatro Fuentes. La Flor
del Alba no es necesaria; si sobrevivió, su Acción permite aportar una Energía y conservar una
Fuente sin Agotar. La rama sin Flor puede hacer lo mismo con la Energía que llegó a la Reserva. En
el mejor caso existen 5 Energías: si Choque de Ecos ya consumió 2, quedan sólo 3 para ese Eco. Por
tanto Choque y Ciudad son caminos mutuamente excluyentes durante este turno.

Después de Devolver la Fuente, el jugador puede Invocar la Ciudad, lanzar Choque si aún no lo hizo,
usar la Flor, atacar o simplemente terminar el turno. No aparece otra orden paso a paso. Cualquier
concepto contextual que no ocurra permanece como no visto para partidas posteriores.

### Ataque opcional al Archivo antes del cierre

El jugador puede atacar el Archivo durante este último turno. Ese ataque no se bloquea y no debe
eliminar la posibilidad del desenlace. Las copias que puedan descartarse en esta ventana son
Soldados Sinsepulcro de relleno; al ser copias idénticas, no importa cuál `instanceId` concreto se
consuma. El Titán reservado para el cierre no pertenece a ese conjunto descartable.

Esta reserva es una propiedad authored del escenario, no una nueva regla general sobre cómo se
descarta un Archivo. El análisis técnico posterior deberá decidir cómo representarla sin enseñar
que una partida normal elige cartas convenientes desde el interior del Archivo.

### Cálculo terminal e Invocación letal

Cuando el jugador confirma el fin de este turno y todas las presentaciones quedan estables, el
escenario toma una fotografía semántica del estado real. El cierre siempre incluye:

- un **Titán Sinsepulcro**;
- tantos **Soldados Sinsepulcro** como sean necesarios.

No existe un número fijo de Soldados. Se añade una copia y se vuelve a evaluar hasta que no exista
ninguna secuencia legal del jugador que sobreviva al ataque. La condición de parada es:

> Entre todas las defensas y Reacciones legales, la mayor Vida final posible del Cronista es 0 o
> menos.

El cálculo debe considerar al menos:

- Vida actual del Cronista;
- todos los atacantes que ya conserva la Hueste y sus estadísticas reales;
- bonificación activa de Estampida;
- todos los defensores preparados y sus restricciones, incluidas Volar y Guardia aérea;
- Estabilizándose y Agotado;
- el orden real de ataque de izquierda a derecha;
- crecimiento de la Cosechadora y cualquier muerte durante los combates;
- Energía disponible y Choque de Ecos si todavía puede lanzarse como Rápido;
- cualquier otra Reacción legal alcanzable desde esa rama.

No basta comparar Fuerza total con Vida. La evaluación debe reutilizar las reglas reales de combate
o una función pura equivalente que explore el mejor resultado para el jugador. Todas las ramas
alcanzables del escenario deberán validarse antes de release y la receta debe contener suficientes
copias para que el cálculo nunca se quede sin Soldados.

La secuencia terminal puede superar los cinco revelados ordinarios de un turno de Estampida. Debe
presentarse como el colapso authored de este futuro perdido, no como una segunda explicación de la
regla de Estampida ni como una regla que continuará en partidas normales.

Una vez alcanzada la condición letal, la Hueste ataca normalmente. No existe otro turno del
Cronista: la Vida llega a 0 y comienza la presentación normal de derrota.

### Vida inicial

La Vida ya no necesita calibrarse para morir en una cantidad fija de ataques; el cierre adaptativo
se ocupa de eso. Sólo debe garantizar que incluso la rama menos defensiva alcance el turno de Mano
vacía y Devolver Fuente.

La auditoría del motor confirmó que el mínimo analítico es 31:

`31 + 3 de Aelyra - 13 del primer ataque - 20 de la primera Estampida = 1`

No defender es el peor caso. Cada Zombi anterior que muera defendido evita al menos 2 de daño y sólo
agrega 1 de Fuerza a la Cosechadora; durante la Estampida, la Cosechadora ataca antes que los cuerpos
recién llegados. Con 30, la rama sin defensas pierde antes del turno pedagógico. La receta final debe
conservar un test exhaustivo que certifique esta prueba y detecte futuros cambios de cartas/reglas.

---

## Fase 3 — Derrota y CTA hacia otro futuro

### Presentación de derrota

Al llegar a 0 de Vida se reproduce completa la cinemática normal de quiebre y aparece la pantalla
normal de derrota. La derrota no usa copy que sugiera error del jugador.

La intención vigente del narrador es comunicar tres ideas: el Cronista llegó demasiado tarde, ese
futuro ya estaba perdido y ahora debe contemplarse otro. El borrador recomendado, todavía sujeto a
aprobación de copy, es:

> «Cronista… llegamos demasiado tarde. Este futuro está perdido. Debemos contemplar otro.»

Se evita «esta Crónica está perdida» porque **Crónica** ya denomina el deck del Cronista y podría
confundir el objeto narrativo que acaba de fracasar.

### Acción de salida

Este desenlace no reiniciará la misma seed condenada: conducirá a un Futuro distinto. La presentación
reutiliza la escena visual de derrota, pero ofrece un único CTA narrativo sin la elección normal
entre Reescribir y Contemplar. Su nombre visible confirmado es **Contemplar otro futuro**.

El clic es el acto que completa **Aprender a jugar**. Su activación ejecuta el vórtice y carga la
primera Visión Canon aprobada. La durabilidad si la aplicación se cierra durante la transición se
implementará mediante el lifecycle recuperable fijado en `first_canon_vision_plan.md`.

### Primera Visión Canon: frontera de este documento

La seed determinista está fijada como `HF1-ELA-GRV-082-QC5`. Su primera Mano, el mulligan real que
entrega seis cartas, los cuadros de Evy, la Preparación mental y las ayudas posteriores ya no son una
decisión abierta de este prólogo: pertenecen a
[`first_canon_vision_plan.md`](first_canon_vision_plan.md).

El prólogo no se considera completado sólo por llegar a 0 de Vida. Activar **Contemplar otro
futuro** registra la finalización, ejecuta el vórtice y carga la Visión normal. Cerrar antes de ese
clic reinicia desde el cold open. La recuperación durante el vórtice forma parte del lifecycle
técnico del plan posterior mediante un marcador acotado; la demo conserva resume y checkpointing
apagados.

---

## Libertades y resultados conocidos

| Decisión del jugador | Libertad aprobada | Consecuencia que el diseño debe soportar |
| --- | --- | --- |
| Objetivo de Aelyra | Puede elegir a Aelyra o Maela. | Cambian sus estadísticas, no la supervivencia garantizada de la Cosechadora. |
| Asignación de defensores | Puede realizar cualquier defensa legal. | Pueden morir Zombis antes de Vaelor y también Maela o Aelyra. |
| Intentar una defensa aérea inválida | Permitido como intento; las reglas lo rechazan. | Aparece la explicación contextual de Volar y Guardia aérea. |
| Orden Flor/Vaelor | Libre si Invoca ambas. | Ambos órdenes consumen exactamente 7 de Energía y llegan al mismo estado de Fuentes. |
| Dejar Flor en Mano | Permitido. | El Ladrón la descarta; una Fuente no usada libera 1 a la Reserva y la Mano queda igualmente vacía. |
| Intentar actuar con un Eco recién Invocado | Permitido como intento; las reglas lo rechazan. | Aparece una única explicación contextual de Estabilizándose. |
| Atacantes estabilizados | Libre si existe alguno. | El daño puede descartar cero o una carta adicional del Archivo; si no existe ninguno, la enseñanza queda `no vista`. |
| Defensa durante la primera Estampida | Cualquier asignación legal. | Cambian Vida, supervivientes y crecimiento de la Cosechadora; no puede impedir el turno posterior. |
| Uso de Choque de Ecos | Puede lanzarlo o conservarlo. | Puede eliminar una amenaza, pero consume 2 de Energía y excluye Invocar la Ciudad ese turno. |
| Devolver Fuente | Es el único aprendizaje requerido del turno posterior. | Puede descubrirlo al intentar Jugar el quinto Río o al intentar terminar el turno. |
| Uso de Flor del Alba | Opcional. | Permite Invocar la Ciudad conservando una Fuente preparada, pero no vuelve compatible Ciudad con Choque. |
| Eco de la Ciudad Olvidada | Puede Invocarlo o no. | Añade un defensor; el cálculo terminal absorbe ambas ramas. |
| Ataque final al Archivo | Libre si existen atacantes. | Consume Soldados de relleno y ocurre antes de calcular la fuerza terminal. |
| Defensas del ataque terminal | Completamente libres. | La fuerza ya fue dimensionada contra el mejor resultado legal y todas terminan en derrota. |

La muerte de Retorno a la Memoria desplaza siempre dos cartas del Archivo. Un ataque del Cronista
puede desplazar una tercera. La pareja de Ladrones seguida por Titán y Soldado hace equivalentes
ambas ramas de la primera Estampida. Los ataques posteriores consumen Soldados de relleno antes de que
el escenario construya la fuerza terminal.

## Observables que el futuro análisis técnico deberá encontrar o añadir

Esta lista describe información semántica necesaria, no nombres de APIs definitivos:

- entrada y reinicio completo del prólogo;
- Fuente jugada e Invocación completada con su objetivo real;
- fin del turno del Cronista;
- revelado e Invocación de la Hueste asentados;
- atacantes de la Hueste declarados en su orden real;
- intento de defensa rechazado y motivo tipado, especialmente Volar;
- defensores confirmados;
- pérdida de Vida causada por un atacante;
- Fuentes preparadas y cantidad exacta liberada a Reserva;
- robo exacto de Flor del Alba;
- Vaelor Invocado, y Flor Invocada en cualquier orden o conservada en Mano;
- intento de Acción o ataque rechazado por Estabilizándose;
- cadena de contadores -1/-1, muertes y Reacciones de Cosechadora completamente asentada;
- apertura real de los detalles ampliados de una carta;
- inicio de Batalla, selección y confirmación de atacantes;
- Eco Agotado como consecuencia de atacar;
- comienzo efectivo de la Estampida y aplicación de su bonificación;
- Ladrón de Memorias resuelto y carta exacta descartada;
- comienzo de turno con Mano vacía y robo real de dos cartas;
- intento rechazado de Jugar una quinta Fuente;
- intento de terminar el turno sin Devolver Fuente;
- Fuente devuelta al fondo del Archivo, Acción de Fuente consumida y robo de Ciudad asentado;
- Choque de Ecos lanzado o conservado y Energía restante;
- Acción de Flor del Alba y estado final de Fuentes;
- Invocación opcional de Eco de la Ciudad Olvidada;
- daño final opcional al Archivo y cantidad de Soldados de relleno consumidos;
- estado completamente asentado antes del cálculo terminal;
- resultado de supervivencia óptima para un conjunto candidato de atacantes;
- Titán y cantidad adaptativa de Soldados Invocados;
- ataque terminal resuelto y Vida en 0;
- presentación normal de derrota asentada;
- CTA **Contemplar otro futuro** presentado.

La activación del CTA, el commit de recorrido/conceptos, el vórtice y el nuevo `GameState` real ya
forman parte del handoff. La recuperación ante un cierre durante la transición permanece pendiente.

El análisis futuro deberá distinguir qué observables ya existen como intents, receipts, eventos o
estado estable y cuáles requieren una señal nueva. No debe deducir progreso leyendo strings del log,
texto visible, tiempos de animación o nombres de cartas.

## Necesidades técnicas registradas para la implementación

- Forma declarativa de representar un `GameState` de mitad de partida con turnos, contadores,
  Fuentes, Reserva y orden de Campo exactos.
- Política de acciones para un tutorial semi-guiado: acciones requeridas, acciones libres,
  intentos inválidos explicables y ramas equivalentes.
- Disparadores contextuales por concepto, progreso independiente del recorrido principal y
  confirmación diferida de ese progreso para no recordar un intento abandonado.
- Garantía de que el orden visual izquierda→derecha coincide con la resolución real cuando existen
  copias agrupadas y nuevas Invocaciones.
- Orden completo de ambos Archivos alrededor de los segmentos ya fijados, incluidas las cartas de
  relleno que consume Retorno a la Memoria, los tres Soldados de guardia, el Titán terminal y su
  reserva posterior de Soldados.
- Evaluador puro de letalidad que contemple defensa, Reacciones y orden real de combate sin ejecutar
  ni mutar el `GameState` mientras prueba candidatos.
- Validación exhaustiva del mínimo preliminar de 31 de Vida y del máximo de Soldados que puede pedir
  cualquier rama alcanzable.
- Representación narrativa y técnica de la Invocación terminal para no confundirla con el límite
  ordinario de revelados de la Estampida.
- Integración de la derrota normal, el CTA único **Contemplar otro futuro** y la carga directa de
  `HF1-ELA-GRV-082-QC5`. La apertura de Mano y la recuperación ante cierres continúan en
  `first_canon_vision_plan.md`.
- Separación de progreso entre el prólogo, el tutorial específico **Preparación** y las
  ayudas contextuales que continúan en partidas normales.

La auditoría de estas necesidades y sus fases está en
[`learn_to_play_implementation_plan.md`](learn_to_play_implementation_plan.md). No se deben mover
escenas aisladas a código fuera de la fase aprobada.

## Decisiones abiertas del prólogo al terminar esta actualización

1. Copy del narrador al entrar y antes de la Estampida.
2. Copy definitivo de la derrota; el borrador actual usa «llegamos demasiado tarde» y «contemplar
   otro futuro».
3. Certificación automatizada de 31 como Vida inicial y cantidad máxima de Soldados necesaria en
   todas las ramas.
4. Lore previo del Cronista.

La Mano, el mulligan, su apertura, las preferencias contextuales y la persistencia del
vórtice dejaron de estar abiertas en este documento: su contrato y fases viven en
`first_canon_vision_plan.md`.

La llegada terminal no está abierta: todas las cartas se presentan una por una con el revelado
normal y sin agrupación visual. Esto no cambia que el evento terminal sea authored y pueda superar
el número ordinario de revelados de una Estampida.
