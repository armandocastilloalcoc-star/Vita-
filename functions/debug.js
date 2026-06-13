export const config = { path: ["/debug"] };
export default async () => new Response(JSON.stringify({
  hasDb: !!process.env.NETLIFY_DATABASE_URL,
  dbKeys: Object.keys(process.env).filter(k => /DATABASE|NEON|PG/i.test(k)),
  hasJwt: !!process.env.JWT_SECRET
}, null, 2), { headers: { "Content-Type": "application/json" } });
