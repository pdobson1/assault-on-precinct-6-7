# Assault on Precinct 6-7

A 16-bit style scrolling beat 'em up in the vein of Final Fight and Streets of Rage. Pick PC Sutton or PC Shearer, British bobbies in hi-vis, and clear a police station of goons who keep doing the 6-7.

Open `index.html` in a browser to play. It's a single self-contained file, so it also works on GitHub Pages.

## Officers

- **PC Sutton** wears the custodian helmet and hits harder.
- **PC Shearer** wears the bowler hat with the checked band and moves and punches faster.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys or WASD |
| Punch (land hits for a 3-hit combo) | Z or J |
| Jump (punch mid-air to flying-kick) | X, K or Space |
| Baton spin (costs a little health) | C or L |
| Start / pause | Enter |
| Mute | M |

Gamepads work too (Xbox, PlayStation and most standard pads): left stick or d-pad to move, X / Square to punch, A / Cross to jump, B / Circle or Y / Triangle for the baton spin, Start to pause.

On touch screens an on-screen pad and buttons appear.

## The station

Fight through four areas: outside the nick, the front desk, the CID office and the custody suite, where Silly Sausage is waiting. Catch a goon mid 6-7 for double damage and a BUSTED bonus. Smash bins, boxes and filing cabinets for a brew or a chip barm.

## Editing

The source lives in `src/`:

- `game.js`: the game (canvas rendering, sprites, AI, audio, music)
- `shell.html`: the page around the canvas
- `six-seven.wav`: the 6-7 voice clip

After editing, rebuild `index.html` with:

```
python3 build.py
```
