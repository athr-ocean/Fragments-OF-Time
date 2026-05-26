import { TILE, TILE_COLORS, MAP_CONFIG, quizData } from './data.js';

const { TILE_SIZE, COLS, ROWS } = MAP_CONFIG;

const RAW_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,3,0,0,0,3,0,0,0,3,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,2,0,0,0,0,0,2,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,3,0,0,0,0,0,0,0,0,0,3,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,2,0,0,0,0,0,0,1],
  [1,0,3,0,0,0,0,0,0,0,0,0,3,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export class GameMap {
  constructor() {
    this.tileSize = TILE_SIZE;
    this.cols = COLS;
    this.rows = ROWS;

    this.grid = RAW_MAP.map(row => [...row]);

    this.machineMap = new Map();
    this._buildMachineMap();

    this.completedMachines = new Set();
  }

  _buildMachineMap() {
    quizData.forEach((machine, index) => {
      const { col, row } = machine.mapPosition;
      
      const key = `${col},${row}`;
      this.machineMap.set(key, index);
      
      this.grid[row][col] = TILE.MACHINE;
    });
  }

  isWalkable(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    
    const tile = this.grid[row][col];
    return tile === TILE.FLOOR || tile === TILE.DECOR;
  }

  getMachineAt(col, row) {
    const key = `${col},${row}`;
    const idx = this.machineMap.get(key);
    return idx !== undefined ? idx : -1;
  }

  markMachineCompleted(machineId) {
    this.completedMachines.add(machineId);
  }

  isMachineCompleted(machineId) {
    return this.completedMachines.has(machineId);
  }

  draw(ctx) {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const tile = this.grid[row][col];
        
        const x = col * this.tileSize;
        const y = row * this.tileSize;
        
        this._drawTile(ctx, tile, x, y, col, row);
      }
    }
  }

  _drawTile(ctx, tile, x, y, col, row) {
    const S = this.tileSize; 

    switch (tile) {
      case TILE.FLOOR: {
        ctx.fillStyle = '#2a2a4a'; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#252445'; ctx.fillRect(x, y, S, 1);
        ctx.fillRect(x, y, 1, S);
        break;
      }

      case TILE.WALL: {
        ctx.fillStyle = '#111122'; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#2a2a44'; ctx.fillRect(x, y, S, 6);
        ctx.fillStyle = '#0a0a18'; ctx.fillRect(x, y + S - 4, S, 4);
        ctx.fillRect(x + S - 4, y, 4, S);
        
        if (col % 2 === row % 2) {
          ctx.fillStyle = '#191930'; ctx.fillRect(x + 4, y + 8, S - 8, 2);
          ctx.fillRect(x + 4, y + 20, S - 8, 2);
        }
        break;
      }

      case TILE.MACHINE: {
        const machineIdx = this.getMachineAt(col, row);
        const machine = machineIdx >= 0 ? require_quizData(machineIdx) : null;
        
        const color = machine ? machine.tileColor : '#c05000';
        const completed = machine ? this.completedMachines.has(machine.id) : false;

        ctx.fillStyle = '#2a2a4a'; ctx.fillRect(x, y, S, S);

        ctx.fillStyle = completed ? '#448844' : color; ctx.fillRect(x + 2, y + 4, S - 4, S - 8);

        ctx.fillStyle = completed ? '#88ff88' : '#ffff44'; ctx.fillRect(x + 6, y + 8, S - 12, S - 18);

        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + S / 2 - 2, y + S - 9, 4, 4);

        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 2, y + 4, S - 4, 3);

        if (completed) {
          ctx.fillStyle = '#00ff44';
          ctx.font = '10px monospace'; ctx.fillText('✓', x + S - 10, y + 10);
        }
        break;
      }

      case TILE.DECOR: {
        ctx.fillStyle = '#2a2a4a'; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#4a4a7a'; ctx.fillRect(x + 12, y + 2, 8, S - 4);
        ctx.fillStyle = '#6a6aaa'; ctx.fillRect(x + 12, y + 2, 8, 5);
        ctx.fillStyle = '#8888cc'; ctx.fillRect(x + 10, y + 2, 12, 3);
        break;
      }

      default:
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, S, S);
    }
  }
}

function require_quizData(idx) {
  return quizData[idx];
}