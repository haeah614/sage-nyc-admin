"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="auth-page"><div className="auth-card" role="alert"><span className="eyebrow">SAGE NYC</span><h1>Workspace unavailable</h1><p>Authentication or data access could not be verified. If this is the first setup, review the database migration and environment configuration.</p><button onClick={reset}>Try again</button><Link className="button secondary" href="/login">Return to sign-in</Link></div></main>; }
