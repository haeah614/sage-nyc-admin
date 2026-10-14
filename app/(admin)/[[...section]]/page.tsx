import { notFound } from 'next/navigation';
import { pageAdmin } from '@/lib/admin';
import { AdminApp } from '@/components/admin-app';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{section?:string[]}>}) {
  await pageAdmin();
  const section = (await params).section || [];
  if (section.length > 2 || (section.length && !['users','recommendations','votes'].includes(section[0])) || (section.length===2 && section[0]!=='recommendations')) notFound();
  return <AdminApp section={section}/>;
}
