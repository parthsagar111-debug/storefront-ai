// Slice 0 health check: confirms server env is wired, without exposing values.
export async function GET() {
  return Response.json({
    ok: true,
    env: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      salt: Boolean(process.env.IP_HASH_SALT),
    },
  });
}
