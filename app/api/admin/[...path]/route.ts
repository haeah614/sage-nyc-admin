import { handleAdmin } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{path:string[]}> };
async function handle(request: Request, context: Context) { return handleAdmin(request,(await context.params).path); }
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
