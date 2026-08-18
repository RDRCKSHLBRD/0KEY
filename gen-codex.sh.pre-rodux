#!/bin/bash
# gen-codex.sh - 0KEY Ingestion

OUT="0key_codex.json-r"

node -e "
const fs = require('fs');
const files = ['index.html', 'style.css', 'app.js'];
const codex = {
  _meta: { project: '0KEY', environment: 'RODUX_ENV', type: 'machine-agent-codex' },
  payload: files.reduce((acc, f) => {
    if (fs.existsSync(f)) acc[f] = fs.readFileSync(f, 'utf8');
    return acc;
  }, {})
};
fs.writeFileSync('$OUT', JSON.stringify(codex, null, 2));
console.log('\n/// RDX CODEX GENERATED -> ' + '$OUT' + ' ///\n');
"
