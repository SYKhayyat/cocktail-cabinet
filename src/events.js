// Sound events as plain data.
//
// A model records that something happened -- a coin, a life, a wave -- and the
// facade turns that into a sound. The split matters twice over: the models stay
// free of AudioContext, which the boundary check rightly forbids, and the events
// become assertable in a headless test with no audio hardware anywhere.
//
// Models own nothing here beyond the queue itself; the recipes live in
// src/audio.js and the mapping from event to sound is the facade's one line.

const NO_EVENTS = Object.freeze([]);

// The nonvisual panel steps the model directly and never goes through the
// facade, so on a long assisted session nothing drains the queue. It is capped
// rather than trimmed on read, because a caller that never reads should still not
// be able to grow an array without limit.
const MAX_QUEUED = 256;

export function installEvents(model) {
  model.events = [];
  model.emit = (id) => {
    model.events.push(id);
    if (model.events.length > MAX_QUEUED) model.events.splice(0, model.events.length - MAX_QUEUED);
  };
  model.drainEvents = () => {
    if (!model.events.length) return NO_EVENTS;
    const drained = model.events;
    model.events = [];
    return drained;
  };
  model.clearEvents = () => { model.events.length = 0; };
  return model;
}
