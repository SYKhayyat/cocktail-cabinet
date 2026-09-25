# Gameplay reference notes

Research date: 2026-09-24. These are reference points, not copied assets or code.

## Comparison

| Game | Reference behavior | Our current target |
| --- | --- | --- |
| Snake | The snake never stops, grows after food, avoids walls/body, and gets faster over time. Classic versions use a single life, but our cabinet uses configurable lives. | Grid movement, apple growth, speed ramp, optional wrap, board size, starting length, and configurable lives. |
| Breakout | A paddle at the bottom returns one ball into a brick wall; paddle contact changes the angle; missed balls cost a turn; speed and brick value increase. | Normal mode is bottom paddle plus a bouncing ball. Setup mode lets the human drag the wall while the computer controls the paddle. No top paddle. |
| Splat! | The reference game is a top-down maze/action game with hazards, collectibles, scrolling levels, and life loss on contact with walls or hazards. | Our original game is a readable vertical platform challenge: the climber jumps automatically and the human chooses the landing column. The flipped mode makes the computer climb a human-built route. |
| Asteroids | A triangular ship rotates, thrusts with inertia, fires forward, and uses screen wrapping. Large rocks break into smaller faster rocks; lives are a core mechanic. | Varied outlined rocks, rotation, thrust, forward fire, wrapping, a mouse deadzone to prevent tremor, and configurable lives. |
| Missile Command | Red enemy missiles fall from the sky toward ground targets. A crosshair selects an explosion point; blue interceptors fly from batteries and can miss. The game is about surviving increasingly dense waves. | Red missiles visibly fall from the top toward labeled cities, blue interceptors are aimed with the mouse and launched with Space, and the computer attacks or intercepts in the flipped mode. |
| Imitation | The reference is a conversational human-vs-machine test, not a canned arcade exchange. The interesting mechanic is live dialogue and the inability to reliably identify the machine. | A single visible chat transcript, real local Llama responses, delayed replies, same-browser tabs, and manual WebRTC connections between separate browsers. The model is loaded only when the AI side is used. |
| Starfall | Falling-object games use clear object silhouettes, direct pointer movement, visible hazards, score, and speed increases over time. | Red X hazards, blue collectibles, a mouse/keyboard runner, visible score, faster falling objects, and a flipped mode where the human sends hazards. |

## Sources

- Snake genre and Snake Byte description: https://en.wikipedia.org/wiki/Snake_(video_game_genre)
- Breakout rules, brick scoring, paddle, and speed changes: https://en.wikipedia.org/wiki/Breakout_(arcade_game)
- Atari Breakout controls and ball behavior: https://atari.com/pages/breakout
- Splat! maze/action reference: https://en.wikipedia.org/wiki/Splat!_(video_game)
- Asteroids mechanics, wrapping, fragmentation, lives, and controls: https://en.wikipedia.org/wiki/Asteroids_(video_game)
- Atari Asteroids manual reference: https://atari.365indies.com/manuals/asteroids/asteroids-usa.pdf
- Missile Command mechanics and crosshair/interceptor behavior: https://en.wikipedia.org/wiki/Missile_Command
- Atari Missile Command manual and strategy reference: https://atari.com/pages/missilecommand
- Imitation/Turing test conversational reference: https://en.wikipedia.org/wiki/Imitation_Game_(Turing_test)
- Pointer-first falling-star reference: https://cesarmolto.github.io/project-starfall.html
