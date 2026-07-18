export function TacticalArrowGlyph({
  path,
  tip,
  color,
  start,
  stroke = color,
}: {
  path: string;
  tip: string;
  color: string;
  start: { x: number; y: number };
  stroke?: string;
}) {
  return (
    <g className="tactical-arrow-glyph">
      <path className="tactical-arrow-rail" d={path} fill="none" strokeLinecap="round" />
      <path className="tactical-arrow-halo" d={path} fill="none" stroke={color} strokeLinecap="round" />
      <path className="tactical-arrow-core" d={path} fill="none" stroke={stroke} strokeLinecap="round" />
      <path className="tactical-arrow-runes" d={path} fill="none" strokeLinecap="round" />
      <polygon className="tactical-arrow-head" points={tip} fill={color} />
      <polygon className="tactical-arrow-head-inset" points={tip} />
      <rect
        className="tactical-arrow-tail"
        x={start.x - 4.5}
        y={start.y - 4.5}
        width="9"
        height="9"
        rx="1"
        transform={`rotate(45 ${start.x} ${start.y})`}
        fill={color}
      />
    </g>
  );
}
