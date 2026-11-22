// /config/www/leics/components/split-popups.js  (da elencare in site.yaml → components:)
// Un solo componente "split" con i pop-up di Timer AC, Temperature e soglie, Programmi, Stanze e Porte/finestre.
// Aperto da  tap: { popup: split, part: timer1 | timer2 | timer3 | temperature | programmi | stanza | contatti, room: … }
// La firma di wrap è quella del pannello: wrap(titolo, grande, sottotitolo, corpo). Il corpo usa i blocchi YAML
// (ctx.blocks) e la scheda termostato vera (ctx.ui.entityCard), quindi la grafica è quella di LEICS.

const TIMERS = {
  timer1: { title: "Timer 1", room: "Soggiorno", split: "input_select.ac_list", hvac: "input_select.lista_modalita_hvac", dur: "input_datetime.ac_timer", timer: "timer.timer_ac_soggiorno" },
  timer2: { title: "Timer 2", room: "Camera", split: "input_select.ac_list_2", hvac: "input_select.lista_modalita_hvac_lista_2", dur: "input_datetime.ac_timer_2", timer: "timer.timer_ac_camera" },
  timer3: { title: "Timer 3", room: "Cameretta", split: "input_select.ac_list_3", hvac: "input_select.lista_modalita_hvac_lista_3", dur: "input_datetime.ac_timer_3", timer: "timer.timer_ac_cameretta" },
};

const ROOMS = {
  soggiorno: { title: "Soggiorno", c: "climate.soggiorno", t: "sensor.stanza_temperatura", h: "sensor.stanza_umidita" },
  camera: { title: "Camera", c: "climate.camera", t: "sensor.stanza_temperatura_2", h: "sensor.sensore_rm4_mini_camera_humidity" },
  cameretta: { title: "Cameretta", c: "climate.studio", t: "sensor.sensore_rm4_mini_studio_temperature", h: "sensor.sensore_rm4_mini_studio_humidity" },
  bagno: { title: "Bagno", c: "climate.termostato_bagno", t: "sensor.stanza_temperatura_3", h: "sensor.stanza_umidita_3" },
};

const DOORS = [
  ["dc2b", "Porta balcone", "mdi:door"],
  ["919e", "Finestra bagno", "mdi:window-closed"],
  ["17a0", "Finestra cucina", "mdi:window-closed"],
  ["adb1", "Finestra camera", "mdi:window-closed"],
  ["2fb4", "Finestra cameretta", "mdi:window-closed"],
];

const SEASON = {
  inverno: { title: "Inverno", sw: "input_boolean.on_off_inverno", items: [
    { entity: "input_number.temperatura_target_inverno", name: "Temperatura target", sub: "obiettivo da raggiungere", icon: "mdi:target" },
    { entity: "input_number.temperatura_accensione_inverno", name: "Temperatura accensione", sub: "sotto questa soglia si accende", icon: "mdi:thermometer-chevron-down" },
    { entity: "input_number.impostazione_temperatura_inverno", name: "Temperatura impostata", sub: "valore inviato allo split", icon: "mdi:thermostat" },
  ] },
  estate: { title: "Estate", sw: "input_boolean.on_off_estate", items: [
    { entity: "input_number.temperatura_target_estate", name: "Temperatura target", sub: "obiettivo da raggiungere", icon: "mdi:target" },
    { entity: "input_number.temperatura_accensione_estate", name: "Temperatura accensione", sub: "sopra questa soglia si accende", icon: "mdi:thermometer-chevron-up" },
    { entity: "input_number.impostazione_temperatura_estate", name: "Temperatura impostata", sub: "valore inviato allo split", icon: "mdi:thermostat" },
  ] },
};

const TIMER_IT = { idle: "fermo", active: "in corso", paused: "in pausa" };
const off = (sw) => ({ entity: sw, state_not: "on" });
const on = (hass, id) => hass.states[id]?.state === "on";
const val = (hass, id, dec) => {
  const s = hass.states[id]; if (!s) return "–";
  const n = parseFloat(s.state); return Number.isFinite(n) ? n.toFixed(dec) : s.state;
};

// Riga con selettore data/ora per un input_datetime (usa has_date / has_time dell'entità). Stile delle righe LEICS.
const FIELD = "width:100%;min-width:0;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:rgba(0,0,0,.25);color:#fff;color-scheme:dark;font:inherit;font-size:13px;font-weight:600;box-sizing:border-box";
function dateTimeRow(c, id, name, sub, icon) {
  const { html, ui, hass } = c, s = hass.states[id];
  if (!s) return ui.row({ icon: "mdi:help-circle-outline", raw: true, name, sub: `entità non trovata: ${id}`, dim: true });
  const a = s.attributes, hasDate = a.has_date !== false, hasTime = a.has_time !== false;
  const kind = hasDate && hasTime ? "datetime-local" : hasDate ? "date" : "time";
  const st = String(s.state || ""), ok = !["unknown", "unavailable", ""].includes(st);
  const value = !ok ? "" : kind === "datetime-local" ? st.slice(0, 16).replace(" ", "T") : kind === "date" ? st.slice(0, 10) : st.slice(0, 5);
  const save = (e) => {
    const v = e.target.value; if (!v) return;
    const data = kind === "datetime-local" ? { datetime: `${v.replace("T", " ")}:00` } : kind === "date" ? { date: v } : { time: `${v}:00` };
    c.call("input_datetime", "set_datetime", { entity_id: id, ...data });
  };
  return html`<div class="srow lsel">${ui.anyIco(icon)}<div class="nm">${name}<small>${sub}</small></div>
    <input type=${kind} .value=${value} style=${FIELD} @change=${save}></div>`;
}

function seasonBlocks() {
  const { inverno, estate } = SEASON;
  const list = (x, visible) => ({ type: "list", title: x.title, items: x.items, visible });
  return [
    { type: "pills", items: [
      { entity: estate.sw, name: "Estate", icon: "mdi:weather-sunny" },
      { entity: inverno.sw, name: "Inverno", icon: "mdi:snowflake" },
    ] },
    list(inverno, { entity: inverno.sw, state: "on" }),            // stagione attiva: solo le sue soglie
    list(estate, { entity: estate.sw, state: "on" }),
    list(inverno, [off(estate.sw), off(inverno.sw)]),               // nessuna stagione (manuale): entrambe
    list(estate, [off(estate.sw), off(inverno.sw)]),
    { type: "list", title: "Diagnostica", items: [
      { entity: "input_boolean.debug_climate_logs", name: "Log climatizzazione", icon: "mdi:bug-outline" },
    ] },
  ];
}

function parts(props, c) {
  const { hass, html, ui } = c, part = props.part;

  if (TIMERS[part]) {
    const x = TIMERS[part], st = hass.states[x.timer]?.state;
    return {
      head: "Timer AC", big: x.title, sub: `${x.room} · ${TIMER_IT[st] || st || "–"}`,
      body: c.blocks([
        { type: "list", title: "Impostazioni", items: [
          { entity: x.split, name: "Split", icon: "mdi:air-conditioner" },
          { entity: x.hvac, name: "Modalità", icon: "mdi:tune-variant" },
          { entity: x.dur, name: "Durata", icon: "mdi:timer-cog-outline" },
        ] },
        { type: "list", title: "Timer", items: [
          { entity: x.timer, name: "Stato timer", icon: "mdi:timer-outline", tap: "more-info" },
        ] },
      ]),
    };
  }

  if (part === "temperature") {
    const e = on(hass, SEASON.estate.sw), i = on(hass, SEASON.inverno.sw);
    return { head: "Clima", big: "Temperature e soglie", sub: e && i ? "Estate + Inverno" : e ? "Estate" : i ? "Inverno" : "Manuale", body: c.blocks(seasonBlocks()) };
  }

  if (part === "programmi") {
    const n = ["soggiorno", "camera", "studio"].filter((k) => on(hass, `input_boolean.automazioni_${k}`)).length;
    return {
      head: "Clima", big: "Programmi e automazioni", sub: `${n} / 3 stanze attive`,
      body: html`${c.blocks([
        { type: "list", title: "Automazioni stanze", items: [
          { entity: "input_boolean.automazioni_soggiorno", name: "Soggiorno", icon: "mdi:sofa" },
          { entity: "input_boolean.automazioni_camera", name: "Camera", icon: "mdi:bed" },
          { entity: "input_boolean.automazioni_studio", name: "Cameretta", icon: "mdi:teddy-bear" },
        ] },
        { type: "list", title: "Schedulazione", items: [
          { entity: "input_boolean.automazione_schedulazione_attiva", name: "Schedulazione automazioni", icon: "mdi:calendar-check" },
          { entity: "schedule.programmazione", name: "Calendario", sub: "tocca per i dettagli", icon: "mdi:calendar-clock" },
        ] },
      ])}<div class="sblks" style="margin-top:6px">${ui.block("Partenza e arrivo", [
        dateTimeRow(c, "input_datetime.accensione_automazioni_split", "Partenza", "accensione automazioni split", "mdi:calendar-arrow-right"),
        dateTimeRow(c, "input_datetime.spegnimento_split", "Arrivo", "spegnimento split", "mdi:calendar-arrow-left"),
      ])}</div>`,
    };
  }

  if (part === "stanza") {
    const r = ROOMS[props.room] || ROOMS.soggiorno;
    // La scheda termostato vera, a grandezza piena: fuori dalla griglia .cgrid (che la schiaccia a 150 px e fa
    // sovrapporre nome e pulsanti), dentro un contenitore normale prende l'altezza standard delle schede.
    return {
      head: "Ambienti", big: r.title, sub: `${val(hass, r.t, 1)}° · ${val(hass, r.h, 0)}% umidità`,
      body: html`<div style="display:flex;justify-content:center;margin-top:14px">${ui.entityCard(r.c)}</div>${c.blocks([
        { type: "list", title: "Sensori", items: [
          { entity: r.t, name: "Temperatura", icon: "mdi:thermometer" },
          { entity: r.h, name: "Umidità", icon: "mdi:water-percent" },
        ] },
      ])}`,
    };
  }

  if (part === "contatti") {
    const open = DOORS.filter(([id]) => on(hass, `binary_sensor.shelly_blu_door_window_${id}_window`)).length;
    return {
      head: "Ambienti", big: "Porte e finestre", sub: `${open} aperte`,
      body: c.blocks([{
        type: "list", title: "Stato e batteria",
        items: DOORS.map(([id, name, icon]) => ({
          entity: `binary_sensor.shelly_blu_door_window_${id}_window`, name, icon,
          sub: `batteria [[ sensor.shelly_blu_door_window_${id}_battery | 0 ]]%`,
          value: `{{ 'Aperta' if is_state('binary_sensor.shelly_blu_door_window_${id}_window', 'on') else 'Chiusa' }}`,
          highlight: { state: "on" },
        })),
      }]),
    };
  }

  return { head: "Split", big: "Split", sub: "", body: html`` };
}

export default {
  name: "split",
  // Il componente vive solo nei pop-up: nella pagina non disegna nulla.
  render(props, { nothing }) { return nothing; },
  popup(pop, c, wrap) {
    const x = parts(pop.props || {}, c);
    return wrap(x.head, x.big, x.sub, x.body);
  },
};
