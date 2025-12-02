const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../src/app/data');
const outputFile = path.join(dataDir, 'build-info.json');

// Ensure directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const now = new Date();
const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' };
const formattedDate = now.toLocaleDateString('en-US', options);

const buildInfo = {
  lastUpdated: formattedDate,
  timestamp: now.getTime()
};

fs.writeFileSync(outputFile, JSON.stringify(buildInfo, null, 2));

console.log(`Build info updated: ${formattedDate}`);
