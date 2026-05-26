import { MAP_CONFIG, TILE } from './data.js';

const S = MAP_CONFIG.TILE_SIZE;
const MOVE_DURATION = 0.18;

export const DIR = {
  DOWN:  0,
  LEFT:  1,
  RIGHT: 2,
  UP:    3
};

const FACING = [
  [ 0,  1],
  [-1,  0],
  [ 1,  0],
  [ 0, -1]
];

export class Player {
  constructor(col, row) {
    this.col = col;
    this.row = row;

    this.x = col * S;
    this.y = row * S;

    this.direction = DIR.DOWN;
    this.isMoving  = false;

    this.targetX = this.x;
    this.targetY = this.y;
    this._startX = this.x;
    this._startY = this.y;
    this._moveT  = 0;

    this.nearMachine = false;
    this.nearPortal  = false;
  }

  tryMove(dCol, dRow, era) {
    if (this.isMoving) return false;

    if      (dCol < 0) this.direction = DIR.LEFT;
    else if (dCol > 0) this.direction = DIR.RIGHT;
    else if (dRow < 0) this.direction = DIR.UP;
    else               this.direction = DIR.DOWN;

    const nc = this.col + dCol;
    const nr = this.row + dRow;

    if (!this._walkable(nc, nr, era)) return false;

    this.col = nc;
    this.row = nr;

    this._startX = this.x;
    this._startY = this.y;
    this.targetX = nc * S;
    this.targetY = nr * S;
    
    this._moveT = 0;
    this.isMoving = true;

    return true;
  }

  _walkable(col, row, era) {
    if (col < 0 || row < 0 || col >= MAP_CONFIG.COLS || row >= MAP_CONFIG.ROWS) {
      return false;
    }

    const t = era.map[row][col];

    return (t === TILE.FLOOR || t === TILE.DECOR);
  }

  getFacingTile() {
    const [dc, dr] = FACING[this.direction];
    return {
      col: this.col + dc,
      row: this.row + dr
    };
  }

  update(dt, era) {
    if (this.isMoving) {
      this._moveT += dt / MOVE_DURATION;

      if (this._moveT >= 1) {
        this._moveT = 1;
        this.isMoving = false;
      }

      const t = this._moveT;

      this.x = this._startX + (this.targetX - this._startX) * t;
      this.y = this._startY + (this.targetY - this._startY) * t;
    }

    if (era) {
      const facing = this.getFacingTile();
      
      const ft = era.map[facing.row]?.[facing.col];
      this.nearMachine = (ft === TILE.MACHINE);
      this.nearPortal  = (ft === TILE.PORTAL || ft === TILE.WARP);

      const ct = era.map[this.row]?.[this.col];
      if (ct === TILE.PORTAL || ct === TILE.WARP) {
        this.nearPortal = true;
      }
    }
  }

  resetTo(col, row) {
    this.col = col;
    this.row = row;
    
    this.x = col * S;
    this.y = row * S;
    
    this._startX = this.x;
    this._startY = this.y;
    this.targetX = this.x;
    this.targetY = this.y;
    
    this._moveT = 0;
    this.isMoving = false;
    this.direction = DIR.DOWN;
    
    this.nearMachine = false;
    this.nearPortal  = false;
  }
}