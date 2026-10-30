import Link from 'next/link';
import {LanguageSwitcher} from '@/components/i18n';
import {EmptyState} from '@/components/design/primitives';
import {T} from '@/components/i18n';
export default function NotFound(){return <main className="content public-error"><div className="language-row"><LanguageSwitcher/></div><EmptyState title="Page not found" description="This page may have moved. Return to your workspace to continue." action={<Link className="btn btn-primary" href="/"><T text="Open workspace"/></Link>}/></main>;}
