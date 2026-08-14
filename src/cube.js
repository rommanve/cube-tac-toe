/* Cube Tac Toe — cube model, moves and win detection.
 *
 * Coordinate system (model space): +X right, +Y up, +Z toward the viewer.
 * A cubie knows its position and its orientation matrix; each sticker is
 * attached to a *local* face of its cubie, so marks travel with the cube.
 */
(function (global) {
  'use strict';

  var LOCAL_DIRS = {
    '+X': [1, 0, 0],
    '-X': [-1, 0, 0],
    '+Y': [0, 1, 0],
    '-Y': [0, -1, 0],
    '+Z': [0, 0, 1],
    '-Z': [0, 0, -1]
  };

  var DIR_KEYS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

  var AXIS_VEC = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

  /* Clockwise quarter turn seen from the positive end of the axis. */
  var CW = {
    X: [[1, 0, 0], [0, 0, 1], [0, -1, 0]],   // (x,y,z) -> (x, z, -y)
    Y: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],   // (x,y,z) -> (-z, y, x)
    Z: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]    // (x,y,z) -> (y, -x, z)
  };

  var IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  /* Every legal move: axis, which layer along that axis, and whether the turn
   * is clockwise (+1) or counter-clockwise (-1) seen from the positive axis. */
  var MOVES = {
    U: { axis: 'Y', layer: 1, dir: 1 }, "U'": { axis: 'Y', layer: 1, dir: -1 },
    D: { axis: 'Y', layer: -1, dir: -1 }, "D'": { axis: 'Y', layer: -1, dir: 1 },
    E: { axis: 'Y', layer: 0, dir: -1 }, "E'": { axis: 'Y', layer: 0, dir: 1 },
    R: { axis: 'X', layer: 1, dir: 1 }, "R'": { axis: 'X', layer: 1, dir: -1 },
    L: { axis: 'X', layer: -1, dir: -1 }, "L'": { axis: 'X', layer: -1, dir: 1 },
    M: { axis: 'X', layer: 0, dir: -1 }, "M'": { axis: 'X', layer: 0, dir: 1 },
    F: { axis: 'Z', layer: 1, dir: 1 }, "F'": { axis: 'Z', layer: 1, dir: -1 },
    B: { axis: 'Z', layer: -1, dir: -1 }, "B'": { axis: 'Z', layer: -1, dir: 1 },
    S: { axis: 'Z', layer: 0, dir: 1 }, "S'": { axis: 'Z', layer: 0, dir: -1 }
  };

  var MOVE_NAMES = Object.keys(MOVES);

  var FACE_MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
  var SLICE_MOVES = ['M', "M'", 'E', "E'", 'S', "S'"];

  /* The eight tic-tac-toe lines over a 3x3 grid indexed 0..8 row-major. */
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  var FACE_NORMALS = [
    { key: 'U', n: [0, 1, 0] },
    { key: 'D', n: [0, -1, 0] },
    { key: 'R', n: [1, 0, 0] },
    { key: 'L', n: [-1, 0, 0] },
    { key: 'F', n: [0, 0, 1] },
    { key: 'B', n: [0, 0, -1] }
  ];

  // ---------------------------------------------------------------- math ---

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function matVec(m, v) {
    return [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
  }

  function matMul(a, b) {
    var out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
      }
    }
    return out;
  }

  function transpose(m) {
    return [
      [m[0][0], m[1][0], m[2][0]],
      [m[0][1], m[1][1], m[2][1]],
      [m[0][2], m[1][2], m[2][2]]
    ];
  }

  function sameVec(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }

  function axisComponent(v, axis) {
    return axis === 'X' ? v[0] : axis === 'Y' ? v[1] : v[2];
  }

  // --------------------------------------------------------------- model ---

  function createCube() {
    var cubies = [];
    var stickers = [];
    var sid = 0;

    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        for (var z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          var cubie = {
            index: cubies.length,
            home: [x, y, z],
            pos: [x, y, z],
            rot: [IDENTITY[0].slice(), IDENTITY[1].slice(), IDENTITY[2].slice()],
            stickers: {}
          };
          for (var i = 0; i < DIR_KEYS.length; i++) {
            var key = DIR_KEYS[i];
            if (dot(cubie.home, LOCAL_DIRS[key]) === 1) {
              var sticker = { id: sid++, mark: '', cubie: cubie, local: key };
              cubie.stickers[key] = sticker;
              stickers.push(sticker);
            }
          }
          cubies.push(cubie);
        }
      }
    }

    return { cubies: cubies, stickers: stickers };
  }

  /* World-space direction the given local face of a cubie currently points. */
  function stickerWorldDir(cubie, localKey) {
    return matVec(cubie.rot, LOCAL_DIRS[localKey]);
  }

  /* The sticker of this cubie currently facing `n`, or null. */
  function stickerFacing(cubie, n) {
    for (var key in cubie.stickers) {
      if (!Object.prototype.hasOwnProperty.call(cubie.stickers, key)) continue;
      if (sameVec(stickerWorldDir(cubie, key), n)) return cubie.stickers[key];
    }
    return null;
  }

  function applyMove(cube, name) {
    var move = MOVES[name];
    if (!move) throw new Error('Unknown move: ' + name);
    var m = move.dir > 0 ? CW[move.axis] : transpose(CW[move.axis]);

    for (var i = 0; i < cube.cubies.length; i++) {
      var cubie = cube.cubies[i];
      if (axisComponent(cubie.pos, move.axis) !== move.layer) continue;
      cubie.pos = matVec(m, cubie.pos);
      cubie.rot = matMul(m, cubie.rot);
    }
    return cube;
  }

  function invertMove(name) {
    return name.charAt(name.length - 1) === "'" ? name.slice(0, -1) : name + "'";
  }

  /* An in-plane basis for a face, chosen deterministically. The set of eight
   * lines is invariant under rotation/reflection of the grid, so any
   * consistent basis yields the same win/no-win answer. */
  function faceBasis(n) {
    var order = [AXIS_VEC.Y, AXIS_VEC.Z, AXIS_VEC.X];
    for (var i = 0; i < order.length; i++) {
      if (Math.abs(dot(order[i], n)) !== 1) {
        return { u: order[i], v: cross(n, order[i]) };
      }
    }
    return { u: AXIS_VEC.X, v: AXIS_VEC.Y };
  }

  /* The nine stickers of a world face, row-major in that face's basis. */
  function faceStickers(cube, n) {
    var basis = faceBasis(n);
    var grid = new Array(9);
    for (var i = 0; i < cube.cubies.length; i++) {
      var cubie = cube.cubies[i];
      if (dot(cubie.pos, n) !== 1) continue;
      var row = dot(cubie.pos, basis.v) + 1;
      var col = dot(cubie.pos, basis.u) + 1;
      grid[row * 3 + col] = stickerFacing(cubie, n);
    }
    return grid;
  }

  /* Every completed three-in-a-row currently on the cube. */
  function findLines(cube) {
    var found = [];
    for (var f = 0; f < FACE_NORMALS.length; f++) {
      var face = FACE_NORMALS[f];
      var grid = faceStickers(cube, face.n);
      for (var l = 0; l < LINES.length; l++) {
        var line = LINES[l];
        var a = grid[line[0]], b = grid[line[1]], c = grid[line[2]];
        if (!a || !b || !c) continue;
        if (a.mark && a.mark === b.mark && b.mark === c.mark) {
          found.push({ face: face.key, mark: a.mark, stickers: [a, b, c] });
        }
      }
    }
    return found;
  }

  function markCount(cube) {
    var n = 0;
    for (var i = 0; i < cube.stickers.length; i++) {
      if (cube.stickers[i].mark) n++;
    }
    return n;
  }

  /* Compact state string — used by the self-tests to compare cube states. */
  function serialize(cube) {
    var parts = [];
    for (var i = 0; i < cube.cubies.length; i++) {
      var c = cube.cubies[i];
      parts.push(c.home.join(',') + ':' + c.pos.join(',') + ':' +
        c.rot[0].join('') + c.rot[1].join('') + c.rot[2].join(''));
    }
    return parts.join('|');
  }

  global.Cube = {
    LOCAL_DIRS: LOCAL_DIRS,
    DIR_KEYS: DIR_KEYS,
    AXIS_VEC: AXIS_VEC,
    MOVES: MOVES,
    MOVE_NAMES: MOVE_NAMES,
    FACE_MOVES: FACE_MOVES,
    SLICE_MOVES: SLICE_MOVES,
    LINES: LINES,
    FACE_NORMALS: FACE_NORMALS,
    create: createCube,
    applyMove: applyMove,
    invertMove: invertMove,
    stickerWorldDir: stickerWorldDir,
    stickerFacing: stickerFacing,
    faceStickers: faceStickers,
    findLines: findLines,
    markCount: markCount,
    serialize: serialize,
    dot: dot,
    cross: cross,
    matVec: matVec,
    matMul: matMul,
    axisComponent: axisComponent
  };
})(window);
