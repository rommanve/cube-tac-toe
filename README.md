# Cube Tac Toe

Tic-tac-toe played on the 54 stickers of a 3×3 Rubik's Cube. Marks are painted
onto stickers, and every turn ends with a cube move — so the board you are
playing on scrambles itself underneath you.

Black cube body, all-white stickers, fully rotatable by dragging.

## Running it

No dependencies and no build step. Open `index.html` in any modern browser:

```bash
open index.html
```

Or serve the folder if you prefer a local server:

```bash
python3 -m http.server 4173
```

…then visit <http://localhost:4173>.

## Rules

1. **Player 1 is X, Player 2 is O.**
2. On your turn you first **place your mark on any empty sticker** — any of the
   54, on any face. Spin the cube to reach the ones facing away.
3. You must then **make exactly one standard quarter turn** of the cube. The
   turn is mandatory; the turn ends your turn.
4. **Three of your marks in a row, column or diagonal on a single face wins** —
   8 lines per face, 48 across the cube.
5. **Victory is checked only after the turn completes**, never at the moment a
   mark is placed. Completing a line and then making a move that breaks it
   scores nothing. A move can equally hand the win to your opponent by
   completing *their* line — if a turn completes lines for both players, the
   player who just moved takes it.
6. If all 54 stickers are marked with no line anywhere, the game is a draw.

## Controls

| Action | How |
| --- | --- |
| Inspect the cube | Drag the background — the cube orbits freely, all six sides reachable |
| Place a mark | Click an empty white sticker |
| Make a move | Click a move button, press its letter key, or drag across a face of the cube |
| Counter-clockwise move | The `'` buttons, or hold <kbd>Shift</kbd> with the letter key |

The 18 legal moves are the quarter turns `U D L R F B` and the slice turns
`M E S`, each clockwise or counter-clockwise (`U`, `U'`, …). Standard cube
notation: `M` follows `L`, `E` follows `D`, `S` follows `F`. Whole-cube
rotations are not moves — they do not change the position.

While it is your turn to place, dragging anywhere orbits the view. Once you
have placed and owe a move, dragging *a face* turns that layer and dragging the
background still orbits.

## Project layout

| File | What's in it |
| --- | --- |
| `index.html` | Markup: stage, cube root, side panel, win overlay |
| `styles.css` | Cube geometry, black plates and white stickers, UI chrome |
| `src/cube.js` | Cube state, the 18 moves, win/draw detection |
| `src/render.js` | CSS 3D rendering, layer-turn animation, view orbiting |
| `src/game.js` | Turn state machine, input routing, UI, self-tests |

The cube is plain DOM under CSS 3D transforms — no WebGL, no libraries. Each of
the 26 cubies carries a position and an integer orientation matrix; a sticker is
attached to a *local* face of its cubie, which is why marks travel with the cube
when it turns. A move rotates the positions and orientations of one layer;
win detection reads each of the six world faces back out of that model.

## Self-tests

The model ships with its own consistency checks. Open the page and run this in
the browser console:

```js
Game.selfTest()
```

It verifies the cube has 54 stickers and 26 cubies, that every move applied four
times is the identity, that each move undoes its own prime, that `(R U R' U')`
×6 returns to the start, that a scramble unwinds exactly, that no two cubies
ever occupy the same position, that all six faces resolve nine stickers in a
scrambled state, and that a completed line is detected and survives an unrelated
turn.
