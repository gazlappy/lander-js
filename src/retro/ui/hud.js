// The two text rows above the 3D view, and the fuel gauge just below them

const TITLE = 'Lander  (original (C) D.J.Braben 1987)';
const FUEL_BAR_Y = 17;
const FUEL_UNITS_PER_PIXEL = 16;

export function drawHud(game, showFuel) {
  const { frame, colourOf } = game;
  const white = colourOf(15, 15, 15), black = colourOf(0, 0, 0);
  frame.text(0, 0, TITLE.padEnd(40), white, black);
  const row = String(game.score).padEnd(30) + String(game.lives).padEnd(5) + String(game.highScore);
  frame.text(0, 1, row.padEnd(40), white, black);
  if (showFuel) {
    const length = Math.floor(game.fuel / FUEL_UNITS_PER_PIXEL);
    frame.bar(0, FUEL_BAR_Y, length, 3, colourOf(15, 7, 3));
  }
}

export function drawGameOver(game) {
  const { frame, colourOf } = game;
  frame.text(1, 16, 'GAME OVER - press a key to start again', colourOf(15, 15, 15), colourOf(0, 0, 0));
}
