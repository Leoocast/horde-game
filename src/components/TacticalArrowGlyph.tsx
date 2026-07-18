export function TacticalArrowGlyph({
  path,
  tip,
  color,
  stroke = color,
}: {
  path: string;
  tip: string;
  color: string;
  stroke?: string;
}) {
  return (
    <g className="tactical-arrow-glyph">
      <path className="tactical-arrow-halo" d={path} fill="none" stroke={color} strokeLinecap="round" />
      <path className="tactical-arrow-core" d={path} fill="none" stroke={stroke} strokeLinecap="round" />
      <path className="tactical-arrow-runes" d={path} fill="none" strokeLinecap="round" />
      <polygon className="tactical-arrow-head" points={tip} fill={stroke} />
    </g>
  );
}
