// A single, focused polite channel. Frame-driven state can call publish often;
// only a changed semantic key mutates the live region. Chat/notices take
// precedence over generic status in the same turn (e.g. a connection + its
// System message), without repeating the transcript or download percentages.
export class Announcements {
  constructor(region) {
    this.region = region;
    this.keys = new Map();
    this.pending = new Map();
    this.scheduled = false;
  }
  reset() {
    this.keys.clear();
    this.pending.clear();
  }
  publish(channel, key, text) {
    if (!text || this.keys.get(channel) === key) return;
    this.keys.set(channel, key);
    const entries = this.pending.get(channel) || [];
    if (channel === "status") entries.length = 0;
    entries.push(text);
    this.pending.set(channel, entries);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }
  flush() {
    this.scheduled = false;
    const detailed = ["notice", "chat"].flatMap((channel) => this.pending.get(channel) || []);
    const entries = detailed.length ? detailed : this.pending.get("status") || [];
    const text = [...new Set(entries)].join(" ");
    this.pending.clear();
    if (text && this.region.textContent !== text) this.region.textContent = text;
  }
}
