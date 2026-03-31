const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      if (['node_modules', 'out', '.git', '.worktrees', '.agent', 'resources'].includes(file)) continue;
      filelist = walkSync(dirFile, filelist);
    } else {
      if (dirFile.match(/\.(ts|js|json|md)$/)) {
        filelist.push(dirFile);
      }
    }
  }
  return filelist;
};

const replaceInFile = (filePath) => {
  const ext = path.extname(filePath);
  if (filePath.endsWith('package-lock.json')) return; // skip lock file

  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;

  // Case-sensitive replacements
  newContent = newContent.replace(/key note/g, 'key note');
  newContent = newContent.replace(/Key note/g, 'Key note');
  newContent = newContent.replace(/Key Note/g, 'Key Note');
  newContent = newContent.replace(/key-note/g, 'key-note');
  newContent = newContent.replace(/key_note/g, 'key_note');
  newContent = newContent.replace(/Key-Note/g, 'Key-Note');
  newContent = newContent.replace(/keyNote/g, 'keyNote');
  newContent = newContent.replace(/KeyNote/g, 'KeyNote');
  
  // Update package.json specific titles
  if (filePath.endsWith('package.json')) {
    newContent = newContent.replace(/"title": "Add Group Bookmark"/g, '"title": "$(bookmark) Add Group Bookmark (Ctrl+Alt+B)"');
    // It was "Add Note for Selection", now replace to "Add Key Note" with icon
    newContent = newContent.replace(/"title": "Add Note for Selection"/g, '"title": "$(note) Add Key Note"');
    newContent = newContent.replace(/"title": "Add Key Note for Selection"/g, '"title": "$(note) Add Key Note"');
    // Also change other titles if they sound like Add key note
    newContent = newContent.replace(/"title": "Open Note"/g, '"title": "$(go-to-file) Open Note"');
  }

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Updated:', filePath);

    // If it's a TS file and we renamed the class/file name, we should ideally rename the file too.
    // For now, let's just do content replacement. We will rename files in a second pass if needed.
  }
};

const files = walkSync(__dirname);
files.forEach(replaceInFile);
