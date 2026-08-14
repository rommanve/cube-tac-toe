/* Cube Tac Toe — CSS 3D renderer.
 *
 * Model space is Y-up; CSS space is Y-down. Conversion is the diagonal matrix
 * C = diag(1,-1,1), which is its own inverse, so a model rotation R renders as
 * C*R*C (i.e. negate every entry with exactly one index equal to 1).
 */
(function (global) {
  'use strict';

  var CELL = 88;          // cubie edge in px
  var GAP = 2;            // visual gap between cubies
  var TURN_MS = 260;      // layer turn duration

  var PLATE_TRANSFORM = {
    '+X': 'rotateY(90deg)',
    '-X': 'rotateY(-90deg)',
    '+Y': 'rotateX(90deg)',
    '-Y': 'rotateX(-90deg)',
    '+Z': '',
    '-Z': 'rotateY(180deg)'
  };

  function Renderer(cube, cubeEl) {
    this.cube = cube;
    this.cubeEl = cubeEl;
    this.cubieEls = [];
    this.stickerEls = {};
    this.viewX = -24;
    this.viewY = -32;
    this.animating = false;
    this.build();
    this.syncView();
    this.syncTransforms();
  }

  Renderer.prototype.build = function () {
    this.cubeEl.innerHTML = '';
    this.cubieEls = [];
    this.stickerEls = {};

    var half = CELL / 2;
    for (var i = 0; i < this.cube.cubies.length; i++) {
      var cubie = this.cube.cubies[i];
      var el = document.createElement('div');
      el.className = 'cubie';
      el.style.width = CELL + 'px';
      el.style.height = CELL + 'px';
      el.style.marginLeft = -half + 'px';
      el.style.marginTop = -half + 'px';

      for (var d = 0; d < global.Cube.DIR_KEYS.length; d++) {
        var key = global.Cube.DIR_KEYS[d];
        var plate = document.createElement('div');
        plate.className = 'plate';
        plate.style.transform = (PLATE_TRANSFORM[key] + ' translateZ(' +
          (half - GAP / 2) + 'px)').trim();

        var sticker = cubie.stickers[key];
        if (sticker) {
          var sEl = document.createElement('div');
          sEl.className = 'sticker empty';
          sEl.dataset.sid = String(sticker.id);
          var glyph = document.createElement('span');
          glyph.className = 'glyph';
          sEl.appendChild(glyph);
          plate.appendChild(sEl);
          this.stickerEls[sticker.id] = sEl;
        }
        el.appendChild(plate);
      }

      this.cubieEls.push(el);
      this.cubeEl.appendChild(el);
    }
  };

  /* Transform string placing a cubie at its current position/orientation. */
  Renderer.prototype.cubieTransform = function (cubie) {
    var r = cubie.rot;
    var m = [
      [r[0][0], -r[0][1], r[0][2]],
      [-r[1][0], r[1][1], -r[1][2]],
      [r[2][0], -r[2][1], r[2][2]]
    ];
    var step = CELL + GAP;
    var tx = cubie.pos[0] * step;
    var ty = -cubie.pos[1] * step;
    var tz = cubie.pos[2] * step;
    return 'matrix3d(' + [
      m[0][0], m[1][0], m[2][0], 0,
      m[0][1], m[1][1], m[2][1], 0,
      m[0][2], m[1][2], m[2][2], 0,
      tx, ty, tz, 1
    ].join(',') + ')';
  };

  Renderer.prototype.syncTransforms = function () {
    for (var i = 0; i < this.cube.cubies.length; i++) {
      this.cubieEls[i].style.transform = this.cubieTransform(this.cube.cubies[i]);
    }
  };

  Renderer.prototype.syncMarks = function () {
    for (var i = 0; i < this.cube.stickers.length; i++) {
      this.setMark(this.cube.stickers[i]);
    }
  };

  Renderer.prototype.setMark = function (sticker) {
    var el = this.stickerEls[sticker.id];
    if (!el) return;
    el.querySelector('.glyph').textContent = sticker.mark;
    el.classList.toggle('mark-x', sticker.mark === 'X');
    el.classList.toggle('mark-o', sticker.mark === 'O');
    el.classList.toggle('empty', !sticker.mark);
  };

  Renderer.prototype.highlight = function (stickers) {
    for (var id in this.stickerEls) {
      if (Object.prototype.hasOwnProperty.call(this.stickerEls, id)) {
        this.stickerEls[id].classList.remove('winning');
      }
    }
    (stickers || []).forEach(function (s) {
      var el = this.stickerEls[s.id];
      if (el) el.classList.add('winning');
    }, this);
  };

  Renderer.prototype.flashSticker = function (sticker) {
    var el = this.stickerEls[sticker.id];
    if (!el) return;
    el.classList.remove('just-placed');
    void el.offsetWidth;
    el.classList.add('just-placed');
  };

  Renderer.prototype.syncView = function () {
    this.cubeEl.style.transform =
      'rotateX(' + this.viewX + 'deg) rotateY(' + this.viewY + 'deg)';
  };

  Renderer.prototype.orbit = function (dx, dy) {
    this.viewY += dx * 0.4;
    this.viewX = Math.max(-88, Math.min(88, this.viewX - dy * 0.4));
    this.syncView();
  };

  Renderer.prototype.setView = function (x, y) {
    this.viewX = x;
    this.viewY = y;
    this.syncView();
  };

  /* View rotation matrix in CSS space: rotateX(viewX) * rotateY(viewY). */
  Renderer.prototype.viewMatrix = function () {
    var rx = this.viewX * Math.PI / 180;
    var ry = this.viewY * Math.PI / 180;
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var X = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
    var Y = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    return global.Cube.matMul(X, Y);
  };

  /* Screen-space direction (y down) of a model-space vector. */
  Renderer.prototype.projectDir = function (v) {
    var css = [v[0], -v[1], v[2]];
    var p = global.Cube.matVec(this.viewMatrix(), css);
    return { x: p[0], y: p[1] };
  };

  /* Animate a layer turn, then commit it to the model. */
  Renderer.prototype.animateMove = function (name, done) {
    var move = global.Cube.MOVES[name];
    var self = this;
    if (!move) throw new Error('Unknown move: ' + name);

    this.animating = true;

    var layer = document.createElement('div');
    layer.className = 'layer';
    this.cubeEl.appendChild(layer);

    var moving = [];
    for (var i = 0; i < this.cube.cubies.length; i++) {
      var cubie = this.cube.cubies[i];
      if (global.Cube.axisComponent(cubie.pos, move.axis) !== move.layer) continue;
      moving.push(this.cubieEls[i]);
      layer.appendChild(this.cubieEls[i]);
    }

    var axis = global.Cube.AXIS_VEC[move.axis];
    var cssAxis = [axis[0], -axis[1], axis[2]];
    var angle = move.dir * 90;

    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      layer.removeEventListener('transitionend', finish);
      clearTimeout(timer);

      global.Cube.applyMove(self.cube, name);
      for (var j = 0; j < moving.length; j++) self.cubeEl.appendChild(moving[j]);
      self.syncTransforms();
      layer.remove();
      self.animating = false;
      if (done) done();
    };

    layer.addEventListener('transitionend', finish);
    var timer = setTimeout(finish, TURN_MS + 160);

    // Force layout so the transition has a starting value to animate from.
    void layer.offsetWidth;
    layer.style.transition = 'transform ' + TURN_MS + 'ms cubic-bezier(.4,.9,.3,1)';
    layer.style.transform =
      'rotate3d(' + cssAxis.join(',') + ',' + angle + 'deg)';
  };

  Renderer.CELL = CELL;
  Renderer.GAP = GAP;
  global.Renderer = Renderer;
})(window);
