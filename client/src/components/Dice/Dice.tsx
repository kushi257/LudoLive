import { useState, useEffect } from 'react';

interface DiceProps {
  value: number | null;
  isRolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
}

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function Dice({ value, isRolling, canRoll, onRoll }: DiceProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(value);

  useEffect(() => {
    if (!isRolling) {
      setDisplayValue(value);
      return;
    }
    // Animate through random faces while rolling
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 80);
    return () => clearInterval(interval);
  }, [isRolling, value]);

  return (
    <div className="dice-container">
      <div className={`dice-face ${isRolling ? 'rolling' : ''} ${value ? `face-${value}` : ''}`}>
        <span className="dice-pip">
          {displayValue ? FACES[displayValue - 1] : '🎲'}
        </span>
      </div>
      <button
        id="roll-dice-btn"
        className={`roll-btn ${canRoll ? 'can-roll' : ''}`}
        onClick={canRoll ? onRoll : undefined}
        disabled={!canRoll}
      >
        {isRolling ? 'Rolling…' : canRoll ? 'Roll Dice' : 'Wait…'}
      </button>
    </div>
  );
}
