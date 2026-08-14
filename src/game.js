/* Cube Tac Toe — turn state machine, input routing and UI wiring. */
(function (global) {
  'use strict';

  var DRAG_THRESHOLD = 9; // px of travel before a press counts as a drag

  var els = {};
  var cube = null;
  var renderer = null;
  var state = null;

  function newState() {
    return {
      phase: 'place',      // 'place' | 'move' | 'busy' | 'over'
      player: 'X',
      history: [],
      result: null         // { type: 'win'|'draw', mark, lines }
    };
  }

  function other(mark) {
    return mark === 'X' ? 'O' : 'X';
  }

  function playerName(mark) {
    return mark === 'X' ? 'Player 1' : 'Player 2';
  }

  // ------------------------------------------------------------- gameplay ---

  function placeMark(sticker) {
    if (state.phase !== 'place' || sticker.mark) return false;
    sticker.mark = state.player;
    renderer.setMark(sticker);
    renderer.flashSticker(sticker);
    state.phase = 'move';
    updateUI();
    return true;
  }

  function playMove(name) {
    if (state.phase !== 'move' || renderer.animating) return false;
    state.phase = 'busy';
    updateUI();
    renderer.animateMove(name, function () {
      state.history.push({ player: state.player, move: name });
      resolveTurn();
    });
    return true;
  }

  function resolveTurn() {
    var lines = global.Cube.findLines(cube);
    var mine = lines.filter(function (l) { return l.mark === state.player; });
    var theirs = lines.filter(function (l) { return l.mark !== state.player; });

    if (mine.length || theirs.length) {
      // The mover wins ties: if the completed turn produces lines for both
      // players, the player who just moved takes it.
      var won = mine.length ? mine : theirs;
      state.result = { type: 'win', mark: won[0].mark, lines: won };
      state.phase = 'over';
      renderer.highlight(flattenStickers(won));
    } else if (global.Cube.markCount(cube) >= cube.stickers.length) {
      state.result = { type: 'draw' };
      state.phase = 'over';
    } else {
      state.player = other(state.player);
      state.phase = 'place';
    }
    updateUI();
  }

  function flattenStickers(lines) {
    var out = [];
    lines.forEach(function (l) {
      l.stickers.forEach(function (s) {
        if (out.indexOf(s) === -1) out.push(s);
      });
    });
    return out;
  }

  function newGame() {
    cube = global.Cube.create();
    state = newState();
    renderer.cube = cube;
    renderer.build();
    renderer.syncTransforms();
    renderer.syncMarks();
    updateUI();
  }

  // ------------------------------------------------------ drag -> the move ---

  /* Work out which layer turn a drag across a face represents. */
  function moveFromDrag(sticker, dx, dy) {
    var cubie = sticker.cubie;
    var n = global.Cube.stickerWorldDir(cubie, sticker.local);
    var axes = ['X', 'Y', 'Z'];
    var best = null;

    for (var i = 0; i < axes.length; i++) {
      var a = global.Cube.AXIS_VEC[axes[i]];
      if (Math.abs(global.Cube.dot(a, n)) === 1) continue; // out of the face plane
      var s = renderer.projectDir(a);
      var score = s.x * dx + s.y * dy;   // unnormalised: axes pointing at the
      if (!best || Math.abs(score) > Math.abs(best.score)) {   // camera score low
        best = { axis: a, score: score };
      }
    }
    if (!best || best.score === 0) return null;

    // Drag direction in the face plane, then the angular velocity that carries
    // the face that way: omega = n x t (right-handed).
    var sign = best.score > 0 ? 1 : -1;
    var t = [best.axis[0] * sign, best.axis[1] * sign, best.axis[2] * sign];
    var r = global.Cube.cross(n, t);

    var axisName = null, axisSign = 0;
    for (var k = 0; k < axes.length; k++) {
      var c = global.Cube.axisComponent(r, axes[k]);
      if (c !== 0) { axisName = axes[k]; axisSign = c > 0 ? 1 : -1; }
    }
    if (!axisName) return null;

    // A right-handed turn about +A is counter-clockwise seen from +A, which is
    // dir -1 in the move table.
    var dir = -axisSign;
    var layer = global.Cube.axisComponent(cubie.pos, axisName);

    var moves = global.Cube.MOVES;
    for (var name in moves) {
      if (!Object.prototype.hasOwnProperty.call(moves, name)) continue;
      var m = moves[name];
      if (m.axis === axisName && m.layer === layer && m.dir === dir) return name;
    }
    return null;
  }

  // ----------------------------------------------------------------- input ---

  var drag = null;

  function stickerFromEvent(ev) {
    var el = ev.target.closest ? ev.target.closest('.sticker') : null;
    if (!el) return null;
    var id = Number(el.dataset.sid);
    for (var i = 0; i < cube.stickers.length; i++) {
      if (cube.stickers[i].id === id) return cube.stickers[i];
    }
    return null;
  }

  function onPointerDown(ev) {
    // A finished game still allows orbiting, so the winning line can be found
    // wherever it ended up.
    if (renderer.animating) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    drag = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      sticker: stickerFromEvent(ev),
      mode: null
    };
    try { els.stage.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ }
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var dx = ev.clientX - drag.lastX;
    var dy = ev.clientY - drag.lastY;
    drag.lastX = ev.clientX;
    drag.lastY = ev.clientY;

    var totalX = ev.clientX - drag.startX;
    var totalY = ev.clientY - drag.startY;

    if (drag.mode === null) {
      if (Math.abs(totalX) + Math.abs(totalY) < DRAG_THRESHOLD) return;
      if (state.phase === 'move' && drag.sticker) {
        var move = moveFromDrag(drag.sticker, totalX, totalY);
        drag.mode = 'spent';
        if (move) { playMove(move); return; }
        drag.mode = 'orbit';
      } else {
        drag.mode = 'orbit';
      }
    }

    if (drag.mode === 'orbit') renderer.orbit(dx, dy);
  }

  function onPointerUp(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var wasClick = drag.mode === null;
    var sticker = drag.sticker;
    drag = null;
    try {
      if (els.stage.hasPointerCapture(ev.pointerId)) {
        els.stage.releasePointerCapture(ev.pointerId);
      }
    } catch (e) { /* nothing to release */ }
    if (!wasClick || !sticker || state.phase === 'over') return;

    if (state.phase === 'move') {
      hint('Mark placed — now make a cube move.');
    } else if (sticker.mark) {
      hint('That sticker is already taken.');
    } else {
      placeMark(sticker);
    }
  }

  var hintTimer = null;
  function hint(text) {
    els.hint.textContent = text;
    els.hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      els.hint.classList.remove('show');
    }, 1800);
  }

  // -------------------------------------------------------------------- UI ---

  function buildMoveButtons() {
    function group(container, names) {
      names.forEach(function (name) {
        var b = document.createElement('button');
        b.className = 'move-btn';
        b.textContent = name;
        b.dataset.move = name;
        b.addEventListener('click', function () { playMove(name); });
        container.appendChild(b);
      });
    }
    group(els.faceMoves, global.Cube.FACE_MOVES);
    group(els.sliceMoves, global.Cube.SLICE_MOVES);
  }

  function updateUI() {
    var over = state.phase === 'over';
    document.body.dataset.player = state.player;
    document.body.dataset.phase = state.phase;

    els.badge.textContent = state.player;
    els.badge.className = 'badge ' + (state.player === 'X' ? 'badge-x' : 'badge-o');

    if (over) {
      els.turnLabel.textContent = state.result.type === 'draw'
        ? 'Game over'
        : playerName(state.result.mark) + ' wins';
      els.phaseLabel.textContent = state.result.type === 'draw'
        ? 'All 54 stickers filled — draw.'
        : 'Three in a row on the ' + state.result.lines[0].face + ' face.';
    } else {
      els.turnLabel.textContent = playerName(state.player) + ' (' + state.player + ')';
      els.phaseLabel.textContent = state.phase === 'place'
        ? 'Place your mark on any empty sticker.'
        : state.phase === 'move'
          ? 'Now make one cube move — drag a face or use a button.'
          : 'Turning…';
    }

    var enabled = state.phase === 'move';
    var buttons = document.querySelectorAll('.move-btn');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = !enabled;

    var counts = { X: 0, O: 0 };
    for (var s = 0; s < cube.stickers.length; s++) {
      if (cube.stickers[s].mark) counts[cube.stickers[s].mark]++;
    }
    els.countX.textContent = counts.X;
    els.countO.textContent = counts.O;

    els.history.textContent = state.history.length
      ? state.history.slice(-16).map(function (h) { return h.move; }).join(' ')
      : '—';
    els.lastMove.textContent = state.history.length
      ? state.history[state.history.length - 1].move
      : '–';

    els.overlay.classList.toggle('show', over);
    if (over) {
      els.overlayTitle.textContent = state.result.type === 'draw'
        ? 'Draw'
        : playerName(state.result.mark) + ' wins!';
      els.overlaySub.textContent = state.result.type === 'draw'
        ? 'Every sticker is marked and nobody made a line.'
        : state.result.mark + ' completed a line on the ' +
          state.result.lines[0].face + ' face after ' + state.history.length +
          (state.history.length === 1 ? ' move.' : ' moves.');
    }
  }

  // ------------------------------------------------------------ self-tests ---

  function selfTest() {
    var results = [];
    function check(name, ok, detail) {
      results.push({ name: name, ok: !!ok, detail: detail || '' });
    }

    var c = global.Cube.create();
    check('54 stickers', c.stickers.length === 54, c.stickers.length);
    check('26 cubies', c.cubies.length === 26, c.cubies.length);

    var solved = global.Cube.serialize(c);
    var allFour = true;
    global.Cube.MOVE_NAMES.forEach(function (m) {
      var t = global.Cube.create();
      for (var i = 0; i < 4; i++) global.Cube.applyMove(t, m);
      if (global.Cube.serialize(t) !== solved) allFour = false;
    });
    check('every move^4 = identity', allFour);

    var invOk = true;
    global.Cube.MOVE_NAMES.forEach(function (m) {
      var t = global.Cube.create();
      global.Cube.applyMove(t, m);
      global.Cube.applyMove(t, global.Cube.invertMove(m));
      if (global.Cube.serialize(t) !== solved) invOk = false;
    });
    check('move then inverse = identity', invOk);

    var sexy = global.Cube.create();
    for (var i = 0; i < 6; i++) {
      ['R', 'U', "R'", "U'"].forEach(function (m) { global.Cube.applyMove(sexy, m); });
    }
    check('(R U R\' U\')x6 = identity', global.Cube.serialize(sexy) === solved);

    var scrambled = global.Cube.create();
    var seq = ['R', 'U', "F'", 'M', 'D', "B'", 'E', "S'", 'L', "U'"];
    seq.forEach(function (m) { global.Cube.applyMove(scrambled, m); });
    var seen = {}, unique = true, stickerTotal = 0;
    scrambled.cubies.forEach(function (cu) {
      var k = cu.pos.join(',');
      if (seen[k]) unique = false;
      seen[k] = true;
    });
    check('no two cubies share a position', unique);

    global.Cube.FACE_NORMALS.forEach(function (f) {
      var grid = global.Cube.faceStickers(scrambled, f.n);
      var filled = grid.filter(Boolean).length;
      stickerTotal += filled;
      check('face ' + f.key + ' resolves 9 stickers', filled === 9, filled);
    });
    check('scrambled cube exposes 54 face stickers', stickerTotal === 54, stickerTotal);

    var undo = global.Cube.create();
    seq.forEach(function (m) { global.Cube.applyMove(undo, m); });
    seq.slice().reverse().forEach(function (m) {
      global.Cube.applyMove(undo, global.Cube.invertMove(m));
    });
    check('scramble then unwind = identity', global.Cube.serialize(undo) === solved);

    // A line placed on the U face must be detected there.
    var lineCube = global.Cube.create();
    var top = global.Cube.faceStickers(lineCube, [0, 1, 0]);
    [0, 1, 2].forEach(function (i) { top[i].mark = 'X'; });
    var found = global.Cube.findLines(lineCube);
    check('row of three detected', found.length === 1 && found[0].mark === 'X',
      JSON.stringify(found.map(function (f) { return f.face; })));

    // ...and must survive a turn that does not disturb it.
    global.Cube.applyMove(lineCube, 'D');
    check('line survives an unrelated turn', global.Cube.findLines(lineCube).length === 1);

    var failed = results.filter(function (r) { return !r.ok; });
    return { passed: results.length - failed.length, failed: failed, results: results };
  }

  // ------------------------------------------------------------------ init ---

  function init() {
    els = {
      stage: document.getElementById('stage'),
      cube: document.getElementById('cube'),
      badge: document.getElementById('badge'),
      turnLabel: document.getElementById('turn-label'),
      phaseLabel: document.getElementById('phase-label'),
      faceMoves: document.getElementById('face-moves'),
      sliceMoves: document.getElementById('slice-moves'),
      history: document.getElementById('history'),
      lastMove: document.getElementById('last-move'),
      countX: document.getElementById('count-x'),
      countO: document.getElementById('count-o'),
      hint: document.getElementById('hint'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub')
    };

    cube = global.Cube.create();
    state = newState();
    renderer = new global.Renderer(cube, els.cube);

    buildMoveButtons();

    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
    els.stage.addEventListener('pointerup', onPointerUp);
    els.stage.addEventListener('pointercancel', onPointerUp);
    els.stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.getElementById('new-game').addEventListener('click', newGame);
    document.getElementById('play-again').addEventListener('click', newGame);
    document.getElementById('reset-view').addEventListener('click', function () {
      renderer.setView(-24, -32);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var letter = ev.key.toUpperCase();
      if ('UDLRFBMES'.indexOf(letter) === -1 || letter.length !== 1) return;
      var name = ev.shiftKey ? letter + "'" : letter;
      if (global.Cube.MOVES[name]) {
        ev.preventDefault();
        playMove(name);
      }
    });

    updateUI();

    global.Game = {
      state: function () { return state; },
      cube: function () { return cube; },
      renderer: function () { return renderer; },
      place: placeMark,
      placeById: function (id) {
        for (var i = 0; i < cube.stickers.length; i++) {
          if (cube.stickers[i].id === id) return placeMark(cube.stickers[i]);
        }
        return false;
      },
      move: playMove,
      newGame: newGame,
      selfTest: selfTest,
      moveFromDrag: moveFromDrag
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
