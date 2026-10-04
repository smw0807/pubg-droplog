import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const url = process.env.NUXT_DATABASE_URL
if (!url) throw new Error('NUXT_DATABASE_URL을 로컬 환경변수에 설정해 주세요.')
const client = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder: './server/db/migrations' })
  console.log('Database migrations complete.')
} catch {
  console.error('Database migration failed. Check connectivity and migration files; connection details omitted.')
  process.exitCode = 1
} finally {
  await client.end()
}
