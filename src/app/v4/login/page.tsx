import { T } from '@/components/i18n';
import { v4Config } from '@/lib/v4/server-config';
import { signIn } from './actions';
import styles from './login.module.css';

const messages = {
  invalid: 'Check your email and password.',
  membership: 'Ask your administrator to assign your account to a field team.',
  setup: 'The V4 database is unavailable. Check the workspace connection and try again.',
};

export const metadata = {title: 'Field sign in · ALYS Pools'};

export default async function V4Login({searchParams}: {searchParams: Promise<{message?: string}>}) {
  const { message } = await searchParams;
  const configured = !!v4Config();
  const error = !configured ? messages.setup : message && Object.hasOwn(messages, message) ? messages[message as keyof typeof messages] : null;
  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.mark} aria-hidden="true">≈</span>
      <span><T text="ALYS Pools"/></span>
    </header>
    <section className={styles.panel}>
      <h1><T text="Field sign in"/></h1>
      <p><T text="Open your service route."/></p>
      {error && <p className={styles.error} role="alert"><T text={error}/></p>}
      <form action={signIn}>
        <label><T text="Email"/><input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254}/></label>
        <label><T text="Password"/><input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
        <button type="submit" disabled={!configured}><T text="Sign in"/></button>
      </form>
    </section>
  </main>;
}
