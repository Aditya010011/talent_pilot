-- Seed 20 additional job templates

INSERT INTO public."jobTemplates" ("jobType", title, "jobDescription", "scoringRubric", "interviewQuestions") VALUES
(
  'Finance',
  'Accountant',
  'We are seeking a dedicated and skilled Accountant to join our team. You will be responsible for core duties related to accountant operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Accountant role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Accountant? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Operations',
  'Cleaner',
  'We are seeking a dedicated and skilled Cleaner to join our team. You will be responsible for core duties related to cleaner operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Cleaner role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Cleaner? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Operations',
  'Construction Worker',
  'We are seeking a dedicated and skilled Construction Worker to join our team. You will be responsible for core duties related to construction worker operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Construction Worker role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Construction Worker? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Hospitality',
  'Cook',
  'We are seeking a dedicated and skilled Cook to join our team. You will be responsible for core duties related to cook operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Cook role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Cook? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Design',
  'Graphic Designer',
  'We are seeking a dedicated and skilled Graphic Designer to join our team. You will be responsible for core duties related to graphic designer operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Graphic Designer role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Graphic Designer? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Healthcare',
  'Home Health Care Nurse',
  'We are seeking a dedicated and skilled Home Health Care Nurse to join our team. You will be responsible for core duties related to home health care nurse operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Home Health Care Nurse role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Home Health Care Nurse? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Media',
  'Journalist',
  'We are seeking a dedicated and skilled Journalist to join our team. You will be responsible for core duties related to journalist operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Journalist role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Journalist? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Operations',
  'Manufacturing Worker',
  'We are seeking a dedicated and skilled Manufacturing Worker to join our team. You will be responsible for core duties related to manufacturing worker operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Manufacturing Worker role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Manufacturing Worker? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Marketing',
  'Marketing Associate',
  'We are seeking a dedicated and skilled Marketing Associate to join our team. You will be responsible for core duties related to marketing associate operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Marketing Associate role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Marketing Associate? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Engineering',
  'Mechanical Engineer',
  'We are seeking a dedicated and skilled Mechanical Engineer to join our team. You will be responsible for core duties related to mechanical engineer operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Mechanical Engineer role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Mechanical Engineer? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Healthcare',
  'Nurse',
  'We are seeking a dedicated and skilled Nurse to join our team. You will be responsible for core duties related to nurse operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Nurse role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Nurse? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Management',
  'Project Manager',
  'We are seeking a dedicated and skilled Project Manager to join our team. You will be responsible for core duties related to project manager operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Project Manager role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Project Manager? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Administration',
  'Receptionist',
  'We are seeking a dedicated and skilled Receptionist to join our team. You will be responsible for core duties related to receptionist operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Receptionist role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Receptionist? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Sales',
  'Retail Salesperson',
  'We are seeking a dedicated and skilled Retail Salesperson to join our team. You will be responsible for core duties related to retail salesperson operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Retail Salesperson role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Retail Salesperson? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Sales',
  'Sales Manager',
  'We are seeking a dedicated and skilled Sales Manager to join our team. You will be responsible for core duties related to sales manager operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Sales Manager role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Sales Manager? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Marketing',
  'Social Media Specialist',
  'We are seeking a dedicated and skilled Social Media Specialist to join our team. You will be responsible for core duties related to social media specialist operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Social Media Specialist role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Social Media Specialist? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Technology',
  'Software Engineer',
  'We are seeking a dedicated and skilled Software Engineer to join our team. You will be responsible for core duties related to software engineer operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Software Engineer role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Software Engineer? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Education',
  'Teacher',
  'We are seeking a dedicated and skilled Teacher to join our team. You will be responsible for core duties related to teacher operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Teacher role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Teacher? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Customer Support',
  'Virtual Assistant / Customer Service',
  'We are seeking a dedicated and skilled Virtual Assistant / Customer Service to join our team. You will be responsible for core duties related to virtual assistant / customer service operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Virtual Assistant / Customer Service role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Virtual Assistant / Customer Service? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
),
(
  'Hospitality',
  'Waiter / Waitress',
  'We are seeking a dedicated and skilled Waiter / Waitress to join our team. You will be responsible for core duties related to waiter / waitress operations, ensuring high quality and performance.',
  '[{"name":"Technical Skills","description":"Assesses specific skills required for the Waiter / Waitress role."},{"name":"Problem Solving & Adaptability","description":"Evaluates ability to handle unexpected challenges and learn quickly."}]'::jsonb,
  '[{"order":1,"text":"Can you describe your past experience working as a Waiter / Waitress? What were your primary responsibilities?","type":"OPEN_ENDED","isRequired":true},{"order":2,"text":"Tell me about a time you encountered a difficult challenge in a similar role. How did you resolve it?","type":"OPEN_ENDED","isRequired":true}]'::jsonb
);
