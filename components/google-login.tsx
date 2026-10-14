"use client";
import Script from 'next/script';
import { useRef, useState } from 'react';
declare global { interface Window { google?: { accounts: { id: { initialize: (options:{client_id:string;ux_mode:string;login_uri:string})=>void; renderButton: (element:HTMLElement,options:Record<string,string>)=>void } } } } }
export function GoogleLogin() {
  const container = useRef<HTMLDivElement>(null); const [state,setState] = useState('Loading Google sign-in…');
  function initialize() {
    if (!window.google || !container.current || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) { setState('Google sign-in is unavailable. Check the app configuration.'); return; }
    try {
      window.google.accounts.id.initialize({client_id:process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,ux_mode:'redirect',login_uri:`${window.location.origin}/auth/callback`});
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current,{theme:'outline',size:'large',text:'continue_with',shape:'rectangular'});
      setState('');
    } catch { setState('Unable to load Google sign-in. Please reload.'); }
  }
  return <><Script src="https://accounts.google.com/gsi/client" onReady={initialize} onError={()=>setState('Unable to load Google sign-in. Please reload.')}/><div ref={container}/>{state && <p role="status">{state}</p>}</>;
}
