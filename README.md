# Assault on Precinct 6-7

A 16-bit style scrolling beat 'em up in the vein of Final Fight and Streets of Rage. You're PC Dixon, a British bobby in hi-vis, clearing a police station of goons who keep doing the 6-7.

Open `index.html` in a browser to play. It's a single self-contained file, so it also works on GitHub Pages.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys or WASD |
| Punch (land hits for a 3-hit combo) | Z or J |
| Jump (punch mid-air to flying-kick) | X, K or Space |
| Baton spin (costs a little health) | C or L |
| Start / pause | Enter |
| Mute | M |

On touch screens an on-screen pad and buttons appear.

## The station

Fight through four areas: outside the nick, the front desk, the CID office and the custody suite, where Silly Sausage is waiting. Catch a goon mid 6-7 for double damage and a BUSTED bonus. Smash bins, boxes and filing cabinets for a cuppa or a chip barm.

## Editing

The source lives in `src/`:

- `game.js`: the game (canvas rendering, sprites, AI, audio, music)
- `shell.html`: the page around the canvas
- `six-seven.wav`: the 6-7 voice clip

After editing, rebuild `index.html` with:

```
python3 build.py
```
