const LOGO_URL = '/assets/logo.png'

export default function BrandLogo({ variant = 'header', className = '' }) {
  return <span className={`brand-logo-crop logo-${variant} ${className}`.trim()}>
    <img src={LOGO_URL} alt="Sisa Productions" />
  </span>
}
