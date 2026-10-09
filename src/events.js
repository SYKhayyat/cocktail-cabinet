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

export function installEvents(model) {
  model.events = [];
  model.emit = (id) => { model.events.push(id); };
  model.drainEvents = () => {
    if (!model.events.length) return NO_EVENTS;
    const drained = model.events;
    model.events = [];
    return drained;
  };
  model.clearEvents = () => { model.events.length = 0; };
  return model;
}
