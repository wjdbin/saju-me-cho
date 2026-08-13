export const MASCOT_SRC = '/assets/images/강아지-removebg-preview.png'
export const LOADING_MASCOT_SRC = `/assets/images/${encodeURIComponent('강아지 사주보는중.png')}`

export function Mascot({ className = '', alt = '멍사주', src = MASCOT_SRC }) {
  return <img src={src} alt={alt} className={`mascot ${className}`.trim()} />
}
