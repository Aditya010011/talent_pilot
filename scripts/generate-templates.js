const fs = require('fs');

const jobs = [
  { title: "Accountant", type: "Finance" },
  { title: "Cleaner", type: "Operations" },
  { title: "Construction Worker", type: "Operations" },
  { title: "Cook", type: "Hospitality" },
  { title: "Graphic Designer", type: "Design" },
  { title: "Home Health Care Nurse", type: "Healthcare" },
  { title: "Journalist", type: "Media" },
  { title: "Manufacturing Worker", type: "Operations" },
  { title: "Marketing Associate", type: "Marketing" },
  { title: "Mechanical Engineer", type: "Engineering" },
  { title: "Nurse", type: "Healthcare" },
  { title: "Project Manager", type: "Management" },
  { title: "Receptionist", type: "Administration" },
  { title: "Retail Salesperson", type: "Sales" },
  { title: "Sales Manager", type: "Sales" },
  { title: "Social Media Specialist", type: "Marketing" },
  { title: "Software Engineer", type: "Technology" },
  { title: "Teacher", type: "Education" },
  { title: "Virtual Assistant / Customer Service", type: "Customer Support" },
  { title: "Waiter / Waitress", type: "Hospitality" }
];

const generateDescription = (title) => `We are seeking a dedicated and skilled ${title} to join our team. You will be responsible for core duties related to ${title.toLowerCase()} operations, ensuring high quality and performance.`;

const generateRubric = (title) => JSON.stringify([
  { name: "Technical Skills", description: `Assesses specific skills required for the ${title} role.` },
  { name: "Problem Solving & Adaptability", description: "Evaluates ability to handle unexpected challenges and learn quickly." }
]);

const generateQuestions = (title) => JSON.stringify([
  { order: 1, text: `Can you describe your past experience working as a ${title}? What were your primary responsibilities?`, type: "OPEN_ENDED", isRequired: true },
  { order: 2, text: `Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?`, type: "OPEN_ENDED", isRequired: true }
]);

let sql = `-- Seed 20 additional job templates\n\n`;
sql += `INSERT INTO public."jobTemplates" ("jobType", title, "jobDescription", "scoringRubric", "interviewQuestions") VALUES\n`;

const values = jobs.map(job => {
  return `(\n  '${job.type}',\n  '${job.title}',\n  '${generateDescription(job.title).replace(/'/g, "''")}',\n  '${generateRubric(job.title).replace(/'/g, "''")}'::jsonb,\n  '${generateQuestions(job.title).replace(/'/g, "''")}'::jsonb\n)`;
});

sql += values.join(',\n') + ';\n';

fs.writeFileSync('supabase/migrations/20260713000001_add_20_job_templates.sql', sql);
console.log('Migration generated successfully.');
