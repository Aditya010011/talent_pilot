const fs = require('fs');
const path = require('path');

const replacements = [
  { search: /interviewId/g, replace: 'trainingId' },
  { search: /trpc\.candidate/g, replace: 'trpc.coachingCandidate' },
  { search: /ResumeImportDialog/g, replace: 'CoachingResumeImportDialog' },
];

function processFile(src, dest) {
  let content = fs.readFileSync(src, 'utf-8');
  for (const { search, replace } of replacements) {
    content = content.replace(search, replace);
  }
  fs.writeFileSync(dest, content, 'utf-8');
  console.log(`Created ${dest}`);
}

processFile(
  'src/components/interview/resume-import-dialog.tsx',
  'src/components/coaching/coaching-resume-import-dialog.tsx'
);
