import { useEffect, useState } from 'react';

export function computeRemaining(targetTimestamp, nowMs = Date.now()) {
  const diff = Math.max(0, Number(targetTimestamp || 0) - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    isExpired: diff <= 0,
  };
}

export default function CountdownBanner({ targetTimestamp, label = 'PROGRAM WINDOW CLOSES IN:', enabled = true }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!enabled || !targetTimestamp) return null;

  const { days, hours, minutes, seconds } = computeRemaining(targetTimestamp, nowMs);

  return (
    <section className="countdown-banner" aria-label="Program Countdown Timer">
      <div className="countdown-heading">{label || 'PROGRAM WINDOW CLOSES IN:'}</div>
      <div className="countdown-frame">
        <div className="countdown-grid">
          <div className="countdown-tile">
            <span className="countdown-value">{days}</span>
            <span className="countdown-unit">DAYS</span>
          </div>
          <div className="countdown-tile">
            <span className="countdown-value">{hours}</span>
            <span className="countdown-unit">HOURS</span>
          </div>
          <div className="countdown-tile">
            <span className="countdown-value">{minutes}</span>
            <span className="countdown-unit">MINUTES</span>
          </div>
          <div className="countdown-tile is-seconds">
            <span className="countdown-value">{seconds}</span>
            <span className="countdown-unit">SECONDS</span>
          </div>
        </div>
      </div>
    </section>
  );
}
