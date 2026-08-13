import { Mascot } from './Mascot'

export function MascotHero({ copy }) {
  return (
    <header className="mascot-hero">
      <Mascot className="mascot--hero" />
      <p className="mascot-hero-name">멍사주</p>
      <p className="mascot-hero-copy">{copy}</p>
    </header>
  )
}
