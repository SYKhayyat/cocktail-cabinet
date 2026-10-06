import test from "node:test";
import assert from "node:assert/strict";
import { Announcements } from "../src/announcements.js";

test("focused announcements deduplicate frames and prefer detailed events over generic status", async () => {
  const mutations = [];
  const region = { get textContent() { return mutations.at(-1) || ""; }, set textContent(text) { mutations.push(text); } };
  const announcements = new Announcements(region);
  for (let frame = 0; frame < 1200; frame++) announcements.publish("status", "paused", "Paused");
  await Promise.resolve();
  assert.deepEqual(mutations, ["Paused"]);
  announcements.publish("status", "connected", "Two players are connected");
  announcements.publish("chat", "connection", "System: Another player found. You can chat now.");
  await Promise.resolve();
  assert.deepEqual(mutations, ["Paused", "System: Another player found. You can chat now."]);
  announcements.publish("chat", "connection", "System: Another player found. You can chat now.");
  await Promise.resolve();
  assert.equal(mutations.length, 2);
  announcements.publish("status", "old", "Old lifecycle");
  announcements.publish("status", "ended", "YOU WIN. Press New game to play again.");
  await Promise.resolve();
  assert.equal(mutations.at(-1), "YOU WIN. Press New game to play again.");
  announcements.reset();
  announcements.publish("notice", "error", "Connection failed");
  announcements.publish("notice", "error", "Connection failed");
  await Promise.resolve();
  assert.equal(mutations.at(-1), "Connection failed");
  assert.equal(mutations.length, 4);
});
