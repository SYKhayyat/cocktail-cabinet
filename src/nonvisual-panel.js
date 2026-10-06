import { semanticState, performSemanticAction } from "./nonvisual.js";

export class NonvisualPanel {
  constructor(engine, { announce = () => {} } = {}) {
    this.engine = engine;
    this.announce = announce;
    this.root = document.querySelector("#nonvisualPanel");
    this.toggle = document.querySelector("#nonvisualEnabled");
    this.action = document.querySelector("#nonvisualAction");
    this.target = document.querySelector("#nonvisualTarget");
    this.form = document.querySelector("#nonvisualForm");
    this.feedback = document.querySelector("#nonvisualFeedback");
    this.toggle.addEventListener("change", () => {
      engine.setAssistance(this.toggle.checked);
      this.showFeedback(this.toggle.checked ? "Step-by-step assistance enabled. Arcade time is frozen until you perform an action." : "Visual real-time play resumed.");
      this.refresh();
    });
    document.querySelector("#nonvisualRefresh").addEventListener("click", () => this.refresh());
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      engine.assistanceOutcome = "";
      const feedback = performSemanticAction(engine, {
        action: this.action.value, target: this.target.value,
        x: document.querySelector("#nonvisualX").value,
        y: document.querySelector("#nonvisualY").value,
        seconds: document.querySelector("#nonvisualDuration").value
      });
      this.refresh();
      this.showFeedback(`${feedback}${engine.assistanceOutcome ? ` ${engine.assistanceOutcome}` : ""}`);
    });
  }

  showFeedback(text) {
    this.feedback.textContent = text;
    this.announce(text);
  }

  options(select, values) {
    const previous = select.value;
    select.replaceChildren(...values.map(({ id, label }) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      return option;
    }));
    if (values.some((item) => item.id === previous)) select.value = previous;
  }

  refresh() {
    const game = this.engine.game;
    if (!game) return;
    const nativeChat = game.id === "imitation";
    // Imitation's networking/model timers and native controls remain live.
    if (nativeChat && this.engine.assistance) this.engine.setAssistance(false);
    this.toggle.checked = this.engine.assistance;
    this.toggle.disabled = nativeChat;
    this.form.hidden = nativeChat || !this.engine.assistance;
    const state = semanticState(game, this.engine);
    document.querySelector("#nonvisualMode").textContent = state.mode;
    document.querySelector("#nonvisualObjective").textContent = state.objective;
    document.querySelector("#nonvisualCoordinates").textContent = state.coordinates;
    document.querySelector("#nonvisualOutcome").textContent = state.outcome;
    for (const [key, id] of [["players", "nonvisualPlayers"], ["hazards", "nonvisualHazards"], ["targets", "nonvisualTargets"]]) {
      const list = document.querySelector(`#${id}`);
      list.replaceChildren(...(state[key].length ? state[key] : [{ text: "None currently." }]).map((item) => {
        const row = document.createElement("li");
        row.textContent = item.text;
        return row;
      }));
    }
    this.options(this.action, state.actions);
    this.options(this.target, [{ id: "", label: "Use entered coordinates (no named target)" }, ...state.targets]);
    document.querySelector("#nonvisualDuration").disabled = game.id === "snake";
  }

  changedGame() {
    this.feedback.textContent = "";
    this.action.replaceChildren();
    this.target.replaceChildren();
    this.refresh();
  }
}
