import type { Color, PlayerState, TokenState } from '../../types';

// ── Board geometry constants ───────────────────────────────────────────────────
// Standard Ludo board is 15×15 cells
const CELLS = 15;
const CELL = 44; // px per cell
const SIZE = CELLS * CELL; // 660px

// Color palette (premium, not plain red/green/blue/yellow)
export const COLOR_MAP: Record<Color, string> = {
  RED: '#e63946',
  GREEN: '#2dc653',
  YELLOW: '#f4a261',
  BLUE: '#457b9d',
};

export const COLOR_LIGHT: Record<Color, string> = {
  RED: '#ffd6d6',
  GREEN: '#ccf5d8',
  YELLOW: '#fff0d6',
  BLUE: '#d6e8f5',
};

// ── Physical board squares (15×15 grid row,col) ───────────────────────────────
// Main track: 52 squares, starting positions per color (clockwise order)
// Row/col pairs for each of the 52 main track squares
const MAIN_TRACK: [number, number][] = [
  // RED start → clockwise
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],   // 0–4
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],   // 5–9
  [0, 6], [0, 7], [0, 8],                    // 10–12
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],   // 13–17 (GREEN start at 13)
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], // 18–22
  [6, 14], [7, 14], [8, 14],                 // 23–25
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 26–30 (YELLOW start at 26)
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], // 31–35
  [14, 8], [14, 7], [14, 6],                 // 36–38
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 39–43 (BLUE start at 39)
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1],   // 44–48
  [8, 0], [7, 0], [6, 0],                    // 49–51
];

// Home column squares for each color (normalized indices 52–56)
const HOME_COLUMNS: Record<Color, [number, number][]> = {
  RED:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  GREEN:  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  YELLOW: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  BLUE:   [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

// Home area token starting positions (4 slots within each home quadrant)
const HOME_POSITIONS: Record<Color, [number, number][]> = {
  RED:    [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  GREEN:  [[1.5, 9.5], [1.5, 11.5], [3.5, 9.5], [3.5, 11.5]],
  YELLOW: [[9.5, 9.5], [9.5, 11.5], [11.5, 9.5], [11.5, 11.5]],
  BLUE:   [[9.5, 1.5], [9.5, 3.5], [11.5, 1.5], [11.5, 3.5]],
};

// Offset of home quadrant for each color [row, col] in cells
const HOME_QUADRANT_OFFSET: Record<Color, [number, number]> = {
  RED:    [0, 0],
  GREEN:  [0, 9],
  YELLOW: [9, 9],
  BLUE:   [9, 0],
};

// Safe square physical positions (subset of MAIN_TRACK)
const SAFE_NORMALIZED = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function cellToXY(row: number, col: number): [number, number] {
  return [col * CELL + CELL / 2, row * CELL + CELL / 2];
}

function getTokenPhysicalPos(
  color: Color,
  token: TokenState,
  tokenIndex: number // 0–3, for home positioning
): [number, number] {
  const { position } = token;
  if (position.zone === 'HOME') {
    const [row, col] = HOME_POSITIONS[color][tokenIndex];
    return [col * CELL, row * CELL];
  }
  if (position.zone === 'FINISHED') {
    return cellToXY(7, 7); // center
  }
  const idx = position.boardIndex;
  if (idx >= 52) {
    // Home column
    const [row, col] = HOME_COLUMNS[color][idx - 52];
    return cellToXY(row, col);
  }
  // Main track — normalized to physical
  const colorStarts: Record<Color, number> = { RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39 };
  const physIdx = (colorStarts[color] + idx) % 52;
  const [row, col] = MAIN_TRACK[physIdx];
  return cellToXY(row, col);
}

// ── Component Props ───────────────────────────────────────────────────────────
interface BoardProps {
  players: PlayerState[];
  movableTokenIds: Set<number>;
  mySlot: number;
  onTokenClick: (tokenId: number) => void;
}

export function Board({ players, movableTokenIds, mySlot, onTokenClick }: BoardProps) {
  return (
    <div className="board-wrapper">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="board-svg"
      >
        {/* Background */}
        <rect width={SIZE} height={SIZE} fill="#1a1a2e" rx={12} />

        {/* Board grid cells */}
        <BoardGrid />

        {/* Safe square stars */}
        <SafeSquares />

        {/* Home quadrants */}
        {(['RED', 'GREEN', 'YELLOW', 'BLUE'] as Color[]).map(color => (
          <HomeQuadrant key={color} color={color} />
        ))}

        {/* Center finishing zone */}
        <CenterZone />

        {/* Home column paths */}
        {(['RED', 'GREEN', 'YELLOW', 'BLUE'] as Color[]).map(color => (
          <HomeColumnPath key={color} color={color} />
        ))}

        {/* Tokens */}
        {players.map(player =>
          player.tokens.map((token, i) => {
            const [x, y] = getTokenPhysicalPos(player.color, token, i);
            const isMovable = player.slot === mySlot && movableTokenIds.has(token.tokenId);
            return (
              <Token
                key={`${player.slot}-${token.tokenId}`}
                x={x}
                y={y}
                color={player.color}
                tokenId={token.tokenId}
                isMovable={isMovable}
                isHome={token.position.zone === 'HOME'}
                isFinished={token.position.zone === 'FINISHED'}
                onClick={isMovable ? () => onTokenClick(token.tokenId) : undefined}
              />
            );
          })
        )}
      </svg>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BoardGrid() {
  const cells = [];
  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={col * CELL}
          y={row * CELL}
          width={CELL}
          height={CELL}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />
      );
    }
  }
  return <g>{cells}</g>;
}

function SafeSquares() {
  return (
    <g>
      {Array.from(SAFE_NORMALIZED).map(normIdx => {
        // Render on RED's physical positions (representative)
        const physIdx = normIdx % 52;
        if (physIdx >= MAIN_TRACK.length) return null;
        const [row, col] = MAIN_TRACK[physIdx];
        const [cx, cy] = cellToXY(row, col);
        return (
          <text
            key={normIdx}
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fontSize={16}
            fill="rgba(255,255,255,0.25)"
          >
            ★
          </text>
        );
      })}
    </g>
  );
}

function HomeQuadrant({ color }: { color: Color }) {
  const [row, col] = HOME_QUADRANT_OFFSET[color];
  const x = col * CELL;
  const y = row * CELL;
  const size = 6 * CELL;
  return (
    <g>
      <rect
        x={x} y={y}
        width={size} height={size}
        fill={COLOR_MAP[color]}
        opacity={0.15}
        rx={8}
      />
      <rect
        x={x + CELL} y={y + CELL}
        width={4 * CELL} height={4 * CELL}
        fill={COLOR_MAP[color]}
        opacity={0.2}
        rx={6}
      />
      {/* Home circles */}
      {HOME_POSITIONS[color].map(([r, c], i) => (
        <circle
          key={i}
          cx={c * CELL + CELL / 2}
          cy={r * CELL + CELL / 2}
          r={CELL * 0.38}
          fill={COLOR_LIGHT[color]}
          stroke={COLOR_MAP[color]}
          strokeWidth={2}
          opacity={0.6}
        />
      ))}
    </g>
  );
}

function CenterZone() {
  const cx = 7 * CELL + CELL / 2;
  const cy = 7 * CELL + CELL / 2;
  const size = CELL * 1.5;
  // Star/diamond shape
  const points = [
    [cx, cy - size], [cx + size * 0.4, cy - size * 0.4],
    [cx + size, cy], [cx + size * 0.4, cy + size * 0.4],
    [cx, cy + size], [cx - size * 0.4, cy + size * 0.4],
    [cx - size, cy], [cx - size * 0.4, cy - size * 0.4],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <g>
      <polygon points={points} fill="#f8f9fa" opacity={0.15} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={22} fill="rgba(255,255,255,0.4)">🏠</text>
    </g>
  );
}

function HomeColumnPath({ color }: { color: Color }) {
  const squares = HOME_COLUMNS[color];
  return (
    <g>
      {squares.map(([row, col], i) => (
        <rect
          key={i}
          x={col * CELL + 2}
          y={row * CELL + 2}
          width={CELL - 4}
          height={CELL - 4}
          fill={COLOR_MAP[color]}
          opacity={0.3}
          rx={4}
        />
      ))}
    </g>
  );
}

interface TokenProps {
  x: number;
  y: number;
  color: Color;
  tokenId: number;
  isMovable: boolean;
  isHome: boolean;
  isFinished: boolean;
  onClick?: () => void;
}

function Token({ x, y, color, tokenId, isMovable, isHome, isFinished, onClick }: TokenProps) {
  const r = isHome ? CELL * 0.3 : CELL * 0.34;
  const cx = isHome ? x + CELL / 2 : x;
  const cy = isHome ? y + CELL / 2 : y;

  return (
    <g
      onClick={onClick}
      style={{ cursor: isMovable ? 'pointer' : 'default' }}
      className={isMovable ? 'token-movable' : ''}
    >
      {isMovable && (
        <circle cx={cx} cy={cy} r={r + 6} fill={COLOR_MAP[color]} opacity={0.25} className="pulse-ring" />
      )}
      <circle
        cx={cx} cy={cy} r={r}
        fill={isFinished ? '#ffd700' : COLOR_MAP[color]}
        stroke={isMovable ? '#ffffff' : 'rgba(0,0,0,0.4)'}
        strokeWidth={isMovable ? 2.5 : 1.5}
        className={isMovable ? 'token-bounce' : ''}
      />
      <text
        x={cx} y={cy + 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight="bold"
        fill="rgba(255,255,255,0.85)"
        pointerEvents="none"
      >
        {tokenId + 1}
      </text>
    </g>
  );
}
