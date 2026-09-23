-- Create jobTemplates table
CREATE TABLE IF NOT EXISTS public."jobTemplates" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobType"      text NOT NULL,
  title          text NOT NULL,
  "jobDescription" text NOT NULL,
  "scoringRubric" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "interviewQuestions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public."jobTemplates" ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Anyone can read job templates"
  ON public."jobTemplates" FOR SELECT
  TO authenticated
  USING (true);

-- Allow full access only for the system admin (info@inluwa.com)
CREATE POLICY "System admin can manage job templates"
  ON public."jobTemplates" FOR ALL
  TO authenticated
  USING (
    (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'info@inluwa.com'
  );

-- Trigger to auto-update updatedAt column
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public."jobTemplates"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed initial default job templates with assessmentCriteria and questions
INSERT INTO public."jobTemplates" ("jobType", title, "jobDescription", "scoringRubric", "interviewQuestions") VALUES
(
  'Technology',
  'Senior Software Engineer',
  'We are looking for a Senior Software Engineer with experience in React, Node.js, and TypeScript. You will design, build, and maintain high-performance scalable systems and collaborate with cross-functional teams.',
  '[{"name": "Frontend Engineering", "description": "Assesses proficiency in modern React, hooks state management, and component architecture."}, {"name": "System Scalability", "description": "Measures experience with distributed databases, caching, and performance profiling."}]'::jsonb,
  '[{"order": 1, "text": "Explain the difference between client-side rendering (CSR) and server-side rendering (SSR) in modern React apps.", "type": "OPEN_ENDED", "isRequired": true}, {"order": 2, "text": "How do you manage complex asynchronous state updates without triggering performance leaks or redundant re-renders?", "type": "OPEN_ENDED", "isRequired": true}]'::jsonb
),
(
  'Product Management',
  'Senior Product Manager',
  'Looking for a Senior Product Manager with experience launching SaaS products. You should have strong user empathy, experience with data analytics, and the ability to define product vision and roadmap.',
  '[{"name": "Product Strategy", "description": "Assesses roadmap design, customer research alignment, and prioritization metrics."}, {"name": "Analytical Execution", "description": "Measures capability to leverage quantitative analytics to validate product-market fit."}]'::jsonb,
  '[{"order": 1, "text": "Describe a time when you had to launch a product feature despite conflicting demands from stakeholders. How did you prioritize?", "type": "OPEN_ENDED", "isRequired": true}, {"order": 2, "text": "What key metrics do you track during a new SaaS feature launch, and how do you distinguish noise from signal?", "type": "OPEN_ENDED", "isRequired": true}]'::jsonb
),
(
  'Marketing',
  'Digital Marketing Specialist',
  'We need a Digital Marketing Specialist to run acquisition campaigns. Experience in SEO, SEM, content marketing, and growth analytics is required. You will optimize our ad spend and drive inbound traffic.',
  '[{"name": "Campaign Optimization", "description": "Evaluates knowledge of organic/paid search algorithms, CPC bid scaling, and cohort metrics."}, {"name": "Content Strategy", "description": "Measures experience building scalable content funnels that convert inbound readers into active users."}]'::jsonb,
  '[{"order": 1, "text": "How do you perform keyword research to find high-intent organic search queries for a product launch?", "type": "OPEN_ENDED", "isRequired": true}, {"order": 2, "text": "Explain how you would configure and run an A/B acquisition campaign to optimize customer acquisition costs.", "type": "OPEN_ENDED", "isRequired": true}]'::jsonb
),
(
  'Sales',
  'Enterprise Account Executive',
  'Seeking an Enterprise Account Executive with experience in enterprise B2B sales. You will build pipeline, close high-value contracts, and work closely with product and marketing teams to align customer needs.',
  '[{"name": "Pipeline Management", "description": "Assesses lead generation, enterprise sales cycles, and deal closing methodologies."}, {"name": "Stakeholder Negotiation", "description": "Measures competence in negotiating contracts with multiple C-suite decision-makers."}]'::jsonb,
  '[{"order": 1, "text": "Walk us through your strategy for prospecting and closing a high-value enterprise contract within a long sales cycle.", "type": "OPEN_ENDED", "isRequired": true}, {"order": 2, "text": "How do you handle budget objections during a contract renewal negotiation with key client decision-makers?", "type": "OPEN_ENDED", "isRequired": true}]'::jsonb
),
(
  'Design',
  'Senior UI/UX Designer',
  'Looking for a Senior UI/UX Designer with a strong portfolio of complex web/mobile applications. You will create wireframes, prototypes, and high-fidelity designs, and conduct user research to iterate on UX/UI design systems.',
  '[{"name": "Interaction Design", "description": "Evaluates user flow maps, prototyping fidelity, and consistency with custom design systems."}, {"name": "UX Research", "description": "Measures skills in conducting interviews, synthesizing insights, and translating them to visual hierarchy."}]'::jsonb,
  '[{"order": 1, "text": "Describe your process for translating qualitative customer feedback into low-fidelity and high-fidelity mockups.", "type": "OPEN_ENDED", "isRequired": true}, {"order": 2, "text": "How do you maintain style guide alignment across multiple teams using collaborative tool suites like Figma?", "type": "OPEN_ENDED", "isRequired": true}]'::jsonb
);
