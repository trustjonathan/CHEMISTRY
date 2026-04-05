const fs = require("fs");
const path = require("path");

const folders = ["notes", "papers"]; // scan both folders

function getFileTypeIcon(filename) {
  const ext = filename.split(".").pop().toUpperCase();
  return ext; // PDF, DOCX, DOC, RTF, JPG, etc.
}

function generateTile(filePath, fileName) {
  return `
<a href="${filePath}" class="tile" target="_blank">
  <span class="tile-title">${fileName}</span>
  <span class="tile-icon">${getFileTypeIcon(fileName)}</span>
</a>`;
}

function scanFolder(folder) {
  const fullPath = path.join(__dirname, folder);

  if (!fs.existsSync(fullPath)) return "";

  let output = `\n\n<!-- ===== ${folder.toUpperCase()} ===== -->\n<div class="tile-container">\n`;

  const files = fs.readdirSync(fullPath);

  files.forEach(file => {
    const filePath = `${folder}/${file}`;
    output += generateTile(filePath, file) + "\n";
  });

  output += "</div>\n";

  return output;
}

// MAIN OUTPUT
let finalHTML = "";

folders.forEach(folder => {
  finalHTML += scanFolder(folder);
});

// Write to file
fs.writeFileSync("chemistry_links.html", finalHTML.trim());
console.log("✔ Chemistry tiles generated -> chemistry_links.html");