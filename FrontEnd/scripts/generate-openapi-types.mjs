import fs from 'node:fs'
import path from 'node:path'

const [schemaPath, outputPath, flag] = process.argv.slice(2)
if (!schemaPath || !outputPath) {
  console.error('Usage: node scripts/generate-openapi-types.mjs <schema.json> <output.ts> [--check]')
  process.exit(1)
}
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const paths = Object.keys(schema.paths || {}).sort()
const content = `// Auto-generated from OpenAPI schema. Do not edit manually.\nexport const openApiVersion = ${JSON.stringify(schema.openapi || '')}\nexport type ApiPath =\n${paths.map((p) => `  | ${JSON.stringify(p)}`).join('\n') || '  | never'}\n\nexport interface GeneratedApiSummary {\n  pathCount: number\n}\n\nexport const generatedApiSummary: GeneratedApiSummary = {\n  pathCount: ${paths.length},\n}\n`
if (flag === '--check') {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''
  if (existing !== content) {
    console.error(`${outputPath} is out of date. Run npm run api-types:generate.`)
    process.exit(1)
  }
  process.exit(0)
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, content)
