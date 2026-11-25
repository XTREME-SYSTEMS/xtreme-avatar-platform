import type { ReactNode } from 'react';
import styles from './public-information.module.css';

export default function PublicInformation({
  title,
  introduction,
  children,
  draft = false,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
  draft?: boolean;
}) {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#information">Skip to content</a>
      <div className={styles.container}>
        <header className={styles.header}>
          <a href="/about" className={styles.brand} aria-label="About Xtreme Avatar">
            {/* Existing product mark; no replacement logo or app artwork. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/mark.svg" alt="" width="64" height="64" />
            <span className={styles.wordmark}>
              <strong>XTREME AVATAR</strong>
              <small>XPS INTELLIGENCE</small>
            </span>
          </a>
          <nav aria-label="Public information">
            <a href="/about">About</a>
            <a href="/privacy">Privacy draft</a>
            <a href="/">Open app</a>
          </nav>
        </header>
        <main id="information" className={styles.content}>
          {draft && (
            <aside className={styles.notice} aria-label="Draft status">
              <strong>DRAFT FOR REVIEW — NOT AN ADOPTED PRIVACY NOTICE</strong>
              <p>
                This draft has no effective date. Operator details, retention,
                deletion procedures and provider disclosures still require
                verification before a final notice can be published.
              </p>
            </aside>
          )}
          <p className={styles.eyebrow}>{draft ? 'REVIEW COPY · 25 NOVEMBER 2026' : 'YOUR AI WORKSPACE'}</p>
          <h1>{title}</h1>
          <p className={styles.introduction}>{introduction}</p>
          {children}
        </main>
        <footer className={styles.footer}>
          <span>Xtreme Avatar · XPS Intelligence</span>
          <a href="/about">About this app</a>
          <a href="/privacy">Privacy notice draft</a>
        </footer>
      </div>
    </div>
  );
}
