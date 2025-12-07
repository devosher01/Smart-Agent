const fs = require('fs');
const path = require('path');

// Read the features file
const featuresPath = '/Users/miguel/verifik/verifik-backend/scripts/app-features-final.json';
const features = require(featuresPath);

// Prepare the translation object
const appFeatures = {};

features.forEach((feature) => {
  // skip if no code
  if (!feature.code) return;

  // We will use the 'code' as the key
  // Structure: appFeatures.<CODE>.title = name
  //            appFeatures.<CODE>.description = description

  appFeatures[feature.code] = {
    title: feature.name,
    description: feature.description,
  };
});

// Create the target directory if it doesn't exist
const targetDir = path.join(__dirname, 'src/assets/i18n-features');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Write the English json
const enJson = {
  appFeatures: appFeatures,
};

fs.writeFileSync(path.join(targetDir, 'en.json'), JSON.stringify(enJson, null, 2));

console.log(`Extracted ${Object.keys(appFeatures).length} features to ${targetDir}/en.json`);

// Now do the same for Spanish (nameES, descriptionES)
const appFeaturesES = {};

features.forEach((feature) => {
  if (!feature.code) return;

  appFeaturesES[feature.code] = {
    title: feature.nameES || feature.name, // Fallback to name if nameES missing
    description: feature.descriptionES || feature.description, // Fallback
  };
});

const esJson = {
  appFeatures: appFeaturesES,
};

fs.writeFileSync(path.join(targetDir, 'es.json'), JSON.stringify(esJson, null, 2));

console.log(`Extracted ${Object.keys(appFeaturesES).length} features to ${targetDir}/es.json`);
