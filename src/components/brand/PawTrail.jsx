export function PawTrail({ className = '' }) {
  return (
    <div className={`paw-trail ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className="paw-print" style={{ '--paw-i': index }}>
          🐾
        </span>
      ))}
    </div>
  )
}
