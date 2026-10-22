// Redrawn as vector from the company's 200px Facebook avatar (public/brand/mark.svg).
// Replace the polygons with the official artwork once the company sends it.
const BARS = [
  "53.5,92.5 62.5,83.5 62.5,149.13 53.5,159.47",
  "67.5,78.5 76.5,69.5 76.5,133.03 67.5,143.38",
  "81.5,64.5 90.5,55.5 90.5,116.92 81.5,127.28",
  "95.5,50.5 100,46 104.5,50.5 104.5,111.17 100,106 95.5,111.17",
  "109.5,55.5 118.5,64.5 118.5,127.28 109.5,116.92",
  "123.5,69.5 132.5,78.5 132.5,143.38 123.5,133.03",
  "137.5,83.5 146.5,92.5 146.5,159.47 137.5,149.13",
];

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="48 38 104 124" className={className} aria-hidden="true" fill="currentColor">
      {BARS.map((points) => (
        <polygon key={points} points={points} />
      ))}
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="flex items-center gap-2 text-brand">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-fg">Developer22</span>
    </span>
  );
}
