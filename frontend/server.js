const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4201;

// Serve static files from Angular build output
app.use(express.static(path.join(__dirname, 'dist/fuse/browser')));

// Handle Angular routing - serve index.html for all routes
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/fuse/browser/index.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend server running on port ${PORT}`);
});
