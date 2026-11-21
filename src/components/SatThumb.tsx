/* update65 · vignette satellite (tuiles Esri World Imagery, sans clé) — update66 : partagée par Équipe et Clients. */
export function SatThumb({ lat, lng, size = 64, color = "#FF9F0A" }: { lat: number; lng: number; size?: number; color?: string }) {
  const z = 17, n = 2 ** z, fx = (lng + 180) / 360 * n, r = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n
  const x0 = Math.floor(fx - .5), y0 = Math.floor(fy - .5), k = .5 // tuiles 256 px affichées à 128 px (nettes sur écran Retina)
  const px = (fx - x0) * 256 * k, py = (fy - y0) * 256 * k
  return <span aria-hidden className="relative block shrink-0 overflow-hidden rounded-[12px] bg-[#1d2a1d]" style={{ width: size, height: size }}>
    <span className="absolute grid grid-cols-2" style={{ width: 256, height: 256, left: size / 2 - px, top: size / 2 - py }}>
      {[0, 1].flatMap(j => [0, 1].map(i => <img key={`${i}${j}`} alt="" draggable={false} loading="lazy" className="block h-[128px] w-[128px]" src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y0 + j}/${x0 + i}`} />))}
    </span>
    <span className="absolute left-1/2 top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-[2.5px] ring-white shadow-[0_1px_4px_rgba(0,0,0,.5)]" style={{ background: color }} />
  </span>
}

