const fs = require('fs');
const path = require('path');

const replacements = [
  { search: /interviewId/g, replace: 'trainingId' },
  { search: /Interview/g, replace: 'Training' },
  { search: /interview/g, replace: 'training' },
  { search: /trpc\.candidate/g, replace: 'trpc.coachingCandidate' },
  { search: /trpc\.session/g, replace: 'trpc.coachingSession' },
  { search: /CandidateCreateDialog/g, replace: 'CoachingCandidateCreateDialog' },
  { search: /CandidateImportDialog/g, replace: 'CoachingCandidateImportDialog' },
  { search: /candidate-create-dialog/g, replace: 'coaching-candidate-create-dialog' },
  { search: /candidate-import-dialog/g, replace: 'coaching-candidate-import-dialog' },
];

function processFile(src, dest) {
  let content = fs.readFileSync(src, 'utf-8');
  for (const { search, replace } of replacements) {
    content = content.replace(search, replace);
  }
  
  // Create dir if needed
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  fs.writeFileSync(dest, content, 'utf-8');
  console.log(`Created ${dest}`);
}

processFile(
  'src/components/interview/candidate-manager.tsx',
  'src/components/coaching/coaching-candidate-manager.tsx'
);
processFile(
  'src/components/interview/candidate-create-dialog.tsx',
  'src/components/coaching/coaching-candidate-create-dialog.tsx'
);
processFile(
  'src/components/interview/candidate-import-dialog.tsx',
  'src/components/coaching/coaching-candidate-import-dialog.tsx'
);
