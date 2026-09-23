const fs = require('fs');
const file = 'src/app/(coaching)/coaching/candidates/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/trpc\.candidate/g, 'trpc.coachingCandidate');
content = content.replace(/interviewId/g, 'trainingId');
content = content.replace(/interviews/g, 'trainings');
content = content.replace(/interview\./g, 'training.');
content = content.replace(/interviewScore/g, 'trainingScore');
content = content.replace(/interview/g, 'training');
content = content.replace(/Interview/g, 'Training');

fs.writeFileSync(file, content);
console.log("Done modifying");
