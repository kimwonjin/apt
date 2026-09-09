#!/usr/bin/env node
// Supabase Management API로 SQL 실행. 마이그레이션/점검용.
//   node scripts/sql.mjs "select 1"           -- 인라인 쿼리
//   node scripts/sql.mjs -f supabase/022_profiles_rls.sql   -- 파일 실행
// 토큰은 .env 의 SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF 에서 읽음.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) throw new Error('.env 에 SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF 필요');

const args = process.argv.slice(2);
const query = args[0] === '-f' ? readFileSync(args[1], 'utf8') : args.join(' ');
if (!query.trim()) throw new Error('쿼리가 비었음');

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}\n${text}`);
  process.exit(1);
}
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
