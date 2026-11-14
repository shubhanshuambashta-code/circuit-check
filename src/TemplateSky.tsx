export function Orbits({ uid, reduced }: { uid: string; reduced: boolean }) {
  const rings = [
    { r: 780, cls: "hcl-ring", dur: 90, sats: [0.08, 0.61] },
    { r: 610, cls: "hcl-ring2", dur: 70, sats: [0.33] },
    { r: 930, cls: "hcl-ring2", dur: 120, sats: [0.8] },
  ]
  return (
    <svg className="hcl-svg hcl-orbits" viewBox="0 0 1800 1800" aria-hidden="true">
      <defs>
        {rings.map((g, i) => (
          <path key={i} id={uid + "-o" + i} d={"M900 " + (1040 - g.r) + "a" + g.r + " " + g.r + " 0 1 1 0 " + 2 * g.r + "a" + g.r + " " + g.r + " 0 1 1 0 " + -2 * g.r} />
        ))}
      </defs>
      {rings.map((g, i) => (
        <circle key={i} className={g.cls} cx="900" cy="1040" r={g.r} />
      ))}
      {!reduced &&
        rings.map((g, i) =>
          g.sats.map((s, j) => (
            <circle key={i + "-" + j} className="hcl-sat" r={i === 0 ? 2.6 : 2}>
              <animateMotion dur={g.dur + "s"} repeatCount="indefinite" begin={-s * g.dur + "s"} rotate="auto">
                <mpath href={"#" + uid + "-o" + i} />
              </animateMotion>
            </circle>
          )),
        )}
    </svg>
  )
}

export function Grain({ uid }: { uid: string }) {
  return (
    <svg className="hcl-svg hcl-grain" aria-hidden="true" preserveAspectRatio="none">
      <filter id={uid + "-n"}>
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0" />
      </filter>
      <rect width="100%" height="100%" filter={"url(#" + uid + "-n)"} />
    </svg>
  )
}

