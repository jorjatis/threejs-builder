/** Mockup de cabecera ABC (no interactivo). */
export function ArticleHeader() {
  return (
    <header className="abc-h" aria-hidden="true">
      <div className="abc-h__inner">
        <div className="abc-h__w abc-h__w--1">
          <span className="abc-h__burger" aria-hidden>
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </div>
        <div className="abc-h__w abc-h__w--2">
          <img
            className="abc-h__logo"
            src="/images/abc/logo-abc.svg"
            alt=""
            width={133}
            height={44}
            draggable={false}
          />
        </div>
        <div className="abc-h__w abc-h__w--3">
          <div className="abc-h__btns abc-h__btns--desktop">
            <span className="abc-btn abc-btn--solid">Suscríbete a ABC</span>
            <span className="abc-btn abc-btn--outline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M5 19.5c1.5-3.2 4-4.8 7-4.8s5.5 1.6 7 4.8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Iniciar sesión
            </span>
          </div>
          <span className="abc-h__user-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M6.5 18.2c1.4-2.6 3.5-3.9 5.5-3.9s4.1 1.3 5.5 3.9"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </div>
      </div>
      <span className="abc-hpr">
        <span className="abc-hpr__c" />
      </span>
    </header>
  )
}

/** Mockup de pie ABC (no interactivo). */
export function ArticleFooter() {
  return (
    <footer className="abc-f" aria-hidden="true">
      <div className="abc-f__inner">
        <div className="abc-f__row abc-f__row--top">
          <div className="abc-f__col abc-f__col--brand">
              <div className="abc-f__brand">
                <p className="abc-f__copy">Copyright © DIARIO ABC, S.L.U.</p>
                <img
                  className="abc-f__logo"
                  src="/images/abc/logo-abc.svg"
                  alt=""
                  width={93}
                  height={30}
                  draggable={false}
                />
              </div>
              <ul className="abc-f__social">
                <li>
                  <FbIcon />
                </li>
                <li>
                  <XIcon />
                </li>
                <li>
                  <IgIcon />
                </li>
                <li>
                  <LiIcon />
                </li>
              </ul>
            </div>
            <div className="abc-f__col abc-f__col--premium">
              <span className="abc-f__premium-icon">
                <PremiumIcon />
              </span>
              <div className="abc-f__premium">
                <p className="abc-f__premium-tag">Ventajas ABC suscriptor</p>
                <img
                  className="abc-f__premium-logo"
                  src="/images/abc/logo-premium.svg"
                  alt=""
                  width={120}
                  height={28}
                  draggable={false}
                />
              </div>
            </div>
          <div className="abc-f__col abc-f__col--apps">
            <p className="abc-f__apps-label">Descargar la app</p>
            <div className="abc-f__apps">
              <span className="abc-btn abc-btn--app">
                <AppleIcon /> App Store
              </span>
              <span className="abc-btn abc-btn--app">
                <PlayIcon /> Google Play
              </span>
            </div>
          </div>
        </div>

        <nav className="abc-f__links">
          <ul className="abc-f__link-list">
            {LEGAL_LINKS.map((t) => (
              <li key={t}>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <ul className="abc-f__link-list">
            {SERVICE_LINKS.map((t) => (
              <li key={t}>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="abc-f__row abc-f__row--vocento">
          <img
            className="abc-f__vocento"
            src="/images/abc/logo-vocento.svg"
            alt=""
            width={90}
            height={18}
            draggable={false}
          />
          <span className="abc-f__vocento-link">
            Webs de Vocento{' '}
            <svg width="8" height="4" viewBox="0 0 8 4" aria-hidden>
              <path d="M0 4L4 0l4 4" fill="currentColor" />
            </svg>
          </span>
        </div>
      </div>
    </footer>
  )
}

const LEGAL_LINKS = [
  'Vocento',
  'Sobre nosotros',
  'Contacto',
  'Política de privacidad',
  'Política de cookies',
  'Condiciones de uso',
  'Aviso legal',
  'Accesibilidad',
  'Reglamento UE 2024/1083',
  'Condiciones de contratación',
  'Compromisos editoriales',
]

const SERVICE_LINKS = [
  'Comprobar Lotería Niño',
  'Lotería Niño',
  'Comprobar Lotería Navidad',
  'Lotería Navidad',
  'Horóscopo',
  'Programación TV',
  'Últimas noticias',
  'Loterías',
  'Escucha las noticias del día',
  'Preguntas frecuentes',
  'Pódcast',
]

function FbIcon() {
  return (
    <svg width="7" height="14" viewBox="0 0 7 14" fill="currentColor" aria-hidden>
      <path d="M4.6 14V7.6h2.1l.3-2.5H4.6V3.6c0-.7.2-1.2 1.2-1.2h1.3V.1C6.8 0 6 0 5.1 0 3.1 0 1.8 1.2 1.8 3.4v1.7H0v2.5h1.8V14h2.8z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M8.2 5.9L13.2 0H12L7.6 5.1 4.1 0H0l5.3 7.7L0 14h1.2l4.6-5.4L9.9 14H14L8.2 5.9zm-1.6 1.9l-.5-.8L1.7 1h1.9l3.4 4.9.5.8L12.2 13H10.3L6.6 7.8z" />
    </svg>
  )
}

function IgIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M6 3.1A2.9 2.9 0 108.9 6 2.9 2.9 0 006 3.1zm0 4.8A1.9 1.9 0 117.9 6 1.9 1.9 0 016 7.9zm3.7-4.9a.68.68 0 11.68-.68.68.68 0 01-.68.68zM6 1.1c1 0 1.3 0 1.8.1a2.2 2.2 0 011.5 1.5c.1.5.1.8.1 1.8s0 1.3-.1 1.8a2.2 2.2 0 01-1.5 1.5c-.5.1-.8.1-1.8.1s-1.3 0-1.8-.1a2.2 2.2 0 01-1.5-1.5c-.1-.5-.1-.8-.1-1.8s0-1.3.1-1.8A2.2 2.2 0 014.2 1.2C4.7 1.1 5 1.1 6 1.1zm0-1.1C5 0 4.6 0 4.1.1A3.3 3.3 0 001.7 1.7 3.3 3.3 0 00.1 4.1C0 4.6 0 5 0 6s0 1.4.1 1.9a3.3 3.3 0 001.6 2.4 3.3 3.3 0 002.4 1.6C4.6 12 5 12 6 12s1.4 0 1.9-.1a3.3 3.3 0 002.4-1.6 3.3 3.3 0 001.6-2.4C12 7.4 12 7 12 6s0-1.4-.1-1.9a3.3 3.3 0 00-1.6-2.4A3.3 3.3 0 007.9.1C7.4 0 7 0 6 0z" />
    </svg>
  )
}

function LiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3.1 4.7H.4V14h2.7V4.7zM1.8 0A1.6 1.6 0 100 1.6 1.6 1.6 0 001.8 0zM13.6 8.4c0-2.6-1.4-3.8-3.3-3.8a2.9 2.9 0 00-2.6 1.4h-.1V4.7H5.1V14h2.7V9c0-1.3.3-2.6 1.9-2.6s1.6 1.1 1.6 2.7V14h2.7V8.4z" />
    </svg>
  )
}

function PremiumIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#2185FF" />
      <path
        d="M23.5215 36.043C23.3625 36.0429 23.21 35.9797 23.0975 35.8673C22.9851 35.7549 22.9219 35.6024 22.9219 35.4434C22.9737 33.9425 22.7163 32.4471 22.1656 31.05C21.615 29.6528 20.7828 28.3839 19.7209 27.322C18.6591 26.2601 17.3901 25.428 15.993 24.8774C14.5959 24.3267 13.1004 24.0693 11.5996 24.1211C11.4406 24.1211 11.2881 24.0579 11.1756 23.9455C11.0632 23.833 11 23.6805 11 23.5215C11 23.3625 11.0632 23.2099 11.1756 23.0975C11.2881 22.985 11.4406 22.9219 11.5996 22.9219C13.1004 22.9737 14.5959 22.7163 15.993 22.1656C17.3901 21.615 18.6591 20.7828 19.7209 19.7209C20.7828 18.6591 21.615 17.3901 22.1656 15.993C22.7163 14.5959 22.9737 13.1004 22.9219 11.5996C22.9219 11.4406 22.985 11.2881 23.0975 11.1756C23.2099 11.0632 23.3625 11 23.5215 11C23.6805 11 23.833 11.0632 23.9455 11.1756C24.0579 11.2881 24.1211 11.4406 24.1211 11.5996C24.0693 13.1004 24.3267 14.5959 24.8774 15.993C25.428 17.3901 26.2601 18.6591 27.322 19.7209C28.3839 20.7828 29.6528 21.615 31.05 22.1656C32.4471 22.7163 33.9425 22.9737 35.4434 22.9219C35.6024 22.9219 35.7549 22.985 35.8673 23.0975C35.9798 23.2099 36.043 23.3625 36.043 23.5215C36.043 23.6805 35.9798 23.833 35.8673 23.9455C35.7549 24.0579 35.6024 24.1211 35.4434 24.1211C33.9425 24.0693 32.4471 24.3267 31.05 24.8774C29.6528 25.428 28.3839 26.2601 27.322 27.322C26.2601 28.3839 25.428 29.6528 24.8773 31.05C24.3267 32.4471 24.0693 33.9425 24.1211 35.4434C24.121 35.6024 24.0579 35.7549 23.9454 35.8673C23.833 35.9798 23.6805 36.0429 23.5215 36.043Z"
        fill="#F9F6EE"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 89.8-82.8 102.3-119.6-65.2-30.7-61.7-90-61.4-91.6zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-68.4 35.9-14.9 17.9-27.9 46.3-24.5 73.4 26.9 2.1 51.5-12.1 68.9-36.8z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden>
      <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c17-9.9 17-34.1-1.2-60.8zM104.6 499l220.7-221.3 60.1 60.1L104.6 499z" />
    </svg>
  )
}
