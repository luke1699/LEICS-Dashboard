// /config/www/leics/components/split-calendario.js  (da elencare in site.yaml → components:)
// Editor del calendario settimanale (helper "schedule"): fasce orarie per giorno, aggiungi / togli / salva.
// Usa i comandi WebSocket di Home Assistant schedule/list e schedule/update: serve un utente amministratore.
// Pop-up:  tap: { popup: split-calendario }   (oppure inline nella pagina:  - { type: split-calendario })

const DAYS = [
  ["monday", "Lunedì"], ["tuesday", "Martedì"], ["wednesday", "Mercoledì"], ["thursday", "Giovedì"],
  ["friday", "Venerdì"], ["saturday", "Sabato"], ["sunday", "Domenica"],
];

const hassOf = (el) => el?._hass || document.querySelector("home-assistant")?.hass;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hhmm = (t) => (t === "24:00:00" ? "23:59" : String(t || "").slice(0, 5));
const full = (t) => (t.length === 5 ? `${t}:00` : t);
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const CSS = `
:host{display:block;color:inherit}
*{box-sizing:border-box}
.box{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:16px;background:color-mix(in srgb,currentColor 7%,transparent);overflow:hidden}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.title{font-size:.78rem;letter-spacing:.2em;text-transform:uppercase;opacity:.75}
.day{display:flex;gap:14px;align-items:flex-start;padding:12px 22px;border-bottom:1px solid color-mix(in srgb,currentColor 9%,transparent)}
.dn{width:96px;flex:none;padding-top:8px;font-weight:600}
.rg{flex:1;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 6%,transparent)}
.chip span{opacity:.6}
input[type=time]{color:inherit;background:transparent;border:0;font:inherit;color-scheme:dark light;width:5.6em;padding:4px 2px}
button{font:inherit;color:inherit;cursor:pointer;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:color-mix(in srgb,currentColor 8%,transparent);padding:6px 14px}
button:hover{background:color-mix(in srgb,currentColor 16%,transparent)}
button.x{padding:2px 9px;border:0;background:transparent;opacity:.7}
button.add{opacity:.8}
button.go{background:color-mix(in srgb,currentColor 22%,transparent);font-weight:600}
button:disabled{opacity:.4;cursor:default}
.none{opacity:.5;padding-top:8px}
.foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 22px}
.msg{flex:1;min-width:140px;opacity:.8}
.msg.err{color:var(--error-color,#ff6b6b);opacity:1}
@media(max-width:620px){.day{flex-direction:column;gap:6px}.dn{width:auto;padding-top:0}}
`;

class LeicsScheduleEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entity = null; this._title = "Calendario settimanale";
    this._item = null; this._draft = null; this._orig = "";
    this._msg = ""; this._err = false; this._busy = false; this._bare = false;
    this.shadowRoot.addEventListener("click", (e) => this._click(e));
    this.shadowRoot.addEventListener("change", (e) => this._change(e));
  }
  set entity(v) { if (v === this._entity) return; this._entity = v; if (this.isConnected) this._load(); }
  get entity() { return this._entity; }
  set heading(v) { if (v && v !== this._title) { this._title = v; this._draw(); } }
  set hass(v) { this._hass = v; }
  set bare(v) { v = !!v; if (v !== this._bare) { this._bare = v; this._draw(); } }
  connectedCallback() { if (this._entity && !this._item && !this._busy) this._load(); else this._draw(); }

  async _load(msg = "Carico…") {
    this._busy = true; this._msg = msg; this._err = false; this._draw();
    try {
      const hass = hassOf(this);
      if (!hass) throw new Error("Home Assistant non raggiungibile");
      const list = await hass.callWS({ type: "schedule/list" });
      const id = String(this._entity).split(".")[1];
      const item = list.find((x) => x.id === id) || list.find((x) => `schedule.${slug(x.name)}` === this._entity);
      if (!item) throw new Error("Calendario non trovato (serve un utente amministratore)");
      this._item = item;
      this._draft = {};
      for (const [k] of DAYS) this._draft[k] = (item[k] || []).map((r) => ({ ...r }));
      this._orig = JSON.stringify(this._draft);
      this._msg = ""; 
    } catch (e) {
      this._msg = e?.message || String(e); this._err = true;
    }
    this._busy = false; this._draw();
  }

  _dirty() { return this._draft && JSON.stringify(this._draft) !== this._orig; }

  _click(e) {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    const { act, day, i } = b.dataset;
    if (act === "add") this._draft[day].push({ from: "08:00:00", to: "20:00:00" });
    else if (act === "del") this._draft[day].splice(Number(i), 1);
    else if (act === "reset") { this._load(""); return; }
    else if (act === "save") { this._save(); return; }
    this._msg = ""; this._draw();
  }

  _change(e) {
    const el = e.target.closest("input[data-day]");
    if (!el || !el.value) return;
    this._draft[el.dataset.day][Number(el.dataset.i)][el.dataset.k] = full(el.value);
    this._msg = ""; this._draw();
  }

  async _save() {
    for (const [k, label] of DAYS) {
      for (const r of this._draft[k]) {
        if (r.from >= r.to) { this._msg = `${label}: l'inizio deve essere prima della fine`; this._err = true; this._draw(); return; }
      }
    }
    this._busy = true; this._msg = "Salvo…"; this._err = false; this._draw();
    try {
      const msg = { type: "schedule/update", schedule_id: this._item.id, name: this._item.name };
      if (this._item.icon) msg.icon = this._item.icon;
      for (const [k] of DAYS) msg[k] = this._draft[k].map((r) => ({ ...r })).sort((a, b) => a.from.localeCompare(b.from));
      await hassOf(this).callWS(msg);
      await this._load("");
      this._msg = "Calendario salvato";
    } catch (e) {
      this._busy = false; this._msg = e?.message || String(e); this._err = true;
    }
    this._draw();
  }

  _draw() {
    const d = this._draft, dirty = this._dirty(), busy = this._busy;
    let body = "";
    if (d) {
      body = DAYS.map(([k, label]) => {
        const rows = d[k].map((r, i) => `
          <div class="chip">
            <input type="time" data-day="${k}" data-i="${i}" data-k="from" value="${esc(hhmm(r.from))}">
            <span>→</span>
            <input type="time" data-day="${k}" data-i="${i}" data-k="to" value="${esc(hhmm(r.to))}">
            <button class="x" data-act="del" data-day="${k}" data-i="${i}" title="Elimina fascia">✕</button>
          </div>`).join("");
        return `<div class="day"><div class="dn">${label}</div><div class="rg">${rows || '<span class="none">nessuna fascia</span>'}<button class="add" data-act="add" data-day="${k}">+ fascia</button></div></div>`;
      }).join("");
    }
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
      <div class="box">
        ${this._bare ? "" : `<div class="head"><div class="title">${esc(this._title)}</div></div>`}
        ${body}
        <div class="foot">
          <div class="msg ${this._err ? "err" : ""}">${esc(this._msg || (dirty ? "Modifiche non salvate" : ""))}</div>
          <button data-act="reset" ${busy || !d ? "disabled" : ""}>${dirty ? "Annulla" : "Ricarica"}</button>
          <button class="go" data-act="save" ${busy || !dirty ? "disabled" : ""}>Salva</button>
        </div>
      </div>`;
  }
}

if (!customElements.get("leics-schedule-editor")) customElements.define("leics-schedule-editor", LeicsScheduleEditor);

export default {
  name: "split-calendario",
  kind: "block",
  render(props, c) {
    const { html } = c;
    return html`<leics-schedule-editor .hass=${c.hass} .heading=${props.title || "Calendario settimanale"} .entity=${props.entity || "schedule.programmazione"}></leics-schedule-editor>`;
  },

  // Pop-up del calendario: wrap(titolo, grande, sottotitolo, corpo), come gli altri pop-up di LEICS.
  popup(pop, c, wrap) {
    const props = pop.props || {}, id = props.entity || "schedule.programmazione", s = c.hass.states[id];
    return wrap("Clima", "Calendario settimanale", s ? (s.state === "on" ? "programmazione attiva" : "programmazione ferma") : "", c.html`<div style="margin-top:14px"><leics-schedule-editor .bare=${true} .hass=${c.hass} .entity=${id}></leics-schedule-editor></div>`);
  },
};
