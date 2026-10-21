import { APP_NAME, isRtlLocale, LOCALES } from '@whattocook/shared';

export default function App() {
  return (
    <main className="shell">
      <p className="eyebrow">Serverless web · placeholder</p>
      <h1>{APP_NAME}</h1>
      <p className="lede">
        This is the M0 build shell. The pantry, cook, grocery and settings screens arrive in
        WM1–WM3.
      </p>
      <ul className="locales" aria-label="Supported languages">
        {LOCALES.map((locale) => (
          <li key={locale} dir={isRtlLocale(locale) ? 'rtl' : 'ltr'}>
            {locale.toUpperCase()}
          </li>
        ))}
      </ul>
    </main>
  );
}
