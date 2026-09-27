import { apiError } from '@/server/http';
export async function GET() { return apiError(401, 'UNAUTHENTICATED', 'Entre para acessar seus dados.'); }
