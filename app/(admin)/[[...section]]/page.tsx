import { notFound } from 'next/navigation';
import { pageAdmin } from '@/lib/admin';
import { domains, hasDomain } from '@/lib/domain';
import { AdminApp } from '@/components/admin-app';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{section?:string[]}>}) {
  await pageAdmin();
  const section = (await params).section || [];
  const resource=section[0];
  const domain=resource && hasDomain(resource);
  if (domain) {
    if (section.length>2 || (section[1]==='new' && !domains[resource].writable)) notFound();
  } else if (resource==='mix') {
    if(section.length!==1) notFound();
  } else if (section.length > 2 || (section.length && !['users','recommendations','votes'].includes(section[0])) || (section.length===2 && section[0]!=='recommendations')) notFound();
  return <AdminApp section={section}/>;
}
