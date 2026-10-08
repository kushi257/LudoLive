import { RoomState, ValidMove, PlayerState } from './types';
import { normalizedToPhysical, isSafeSquare } from './boardLayout';

/**
 * Intelligent Bot Move Selector for Ludo.
 * Scores each valid move based on strategic priority:
 * 1. Capture opponent token (+1000)
 * 2. Finish token into center (+800)
 * 3. Escape from danger (opponent 1-6 squares behind on non-safe square) (+400)
 * 4. Land on safe square (+300)
 * 5. Exit home base on roll of 6 (+250)
 * 6. Move into protected home column (+200)
 * 7. Forward progress based on board distance (+toIndex)
 */
export function chooseBotMove(state: RoomState, botSlot: number, validMoves: ValidMove[]): ValidMove | null {
  if (!validMoves || validMoves.length === 0) return null;
  if (validMoves.length === 1) return validMoves[0];

  const botPlayer = state.players[botSlot];
  if (!botPlayer) return validMoves[0];

  let bestMove = validMoves[0];
  let highestScore = -Infinity;

  for (const move of validMoves) {
    let score = 0;

    // 1. Capture
    if (move.captures) {
      score += 1000;
    }

    // 2. Finish
    if (move.toZone === 'FINISHED') {
      score += 800;
    }

    // 3. Move out of base on 6
    if (move.fromZone === 'HOME') {
      // Prioritize having at least 2 tokens in play, but still strong
      const tokensOnBoard = botPlayer.tokens.filter(t => t.position.zone === 'BOARD').length;
      score += tokensOnBoard < 2 ? 350 : 250;
    }

    // 4. Safe square landing
    if (move.toZone === 'BOARD' && move.toIndex !== null) {
      if (isSafeSquare(move.toIndex)) {
        score += 300;
      }
      // Home column safe entry
      if (move.toIndex >= 52) {
        score += 200 + (move.toIndex - 52) * 20;
      } else {
        // General progress along track
        score += move.toIndex;
      }
    }

    // 5. Escape danger
    const token = botPlayer.tokens.find(t => t.tokenId === move.tokenId);
    if (token && token.position.zone === 'BOARD') {
      const curIndex = token.position.boardIndex;
      if (curIndex < 52 && !isSafeSquare(curIndex)) {
        const curPhys = normalizedToPhysical(botPlayer.color, curIndex);
        const isThreatened = checkIsThreatened(state, botPlayer.playerId, curPhys);
        if (isThreatened) {
          score += 400;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Checks if a token at physical position `physPos` has an opponent token within 1-6 squares behind it.
 */
function checkIsThreatened(state: RoomState, botPlayerId: string, physPos: number): boolean {
  for (const player of state.players) {
    if (player.playerId === botPlayerId || player.status === 'FORFEITED') continue;

    for (const token of player.tokens) {
      if (token.position.zone !== 'BOARD') continue;
      const tIdx = token.position.boardIndex;
      if (tIdx >= 52) continue; // Opponent in home column cannot capture

      const oppPhys = normalizedToPhysical(player.color, tIdx);
      const dist = (physPos - oppPhys + 52) % 52;
      if (dist >= 1 && dist <= 6) {
        return true;
      }
    }
  }
  return false;
}
