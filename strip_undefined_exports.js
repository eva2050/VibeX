const fs = require('fs');

const files = [
  'utils/textUtils.js', 'utils/queueUtils.js', 'utils/scoreUtils.js',
  'core/state.js', 'services/llm.js', 'services/twitter.js', 'core/automation.js',
  'core/constants.js'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  const exportMatch = code.match(/export\s*\{\s*([\s\S]*?)\s*\};/);
  if (exportMatch) {
    const exportsList = exportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const validExports = exportsList.filter(name => {
      return new RegExp(`(?:function|const|let|var)\\s+${name}\\b`).test(code);
    });
    const newExportStr = `export { ${validExports.join(', ')} };`;
    code = code.replace(exportMatch[0], newExportStr);
    fs.writeFileSync(file, code);
  }
}
