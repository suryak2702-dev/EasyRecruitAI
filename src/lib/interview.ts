import { extractTextFromFile } from "./parser";
import { extractSkillsFromText, detectDomain, analyzeTextStructure } from "./skill-extractor";

const QUESTION_BANK: Record<string, string[]> = {
  programming: [
    "Explain the difference between arrays and linked lists. When would you use each?",
    "What is the time complexity of binary search? Walk us through the algorithm.",
    "Explain OOP principles (encapsulation, inheritance, polymorphism, abstraction) with examples.",
    "How does garbage collection work in your primary programming language?",
    "Describe a challenging bug you fixed. What was the root cause?",
    "What is the difference between a process and a thread?",
    "Explain the SOLID principles and how you've applied them.",
    "How do you handle memory management in your preferred language?",
  ],
  web_frameworks: [
    "Explain the virtual DOM and how React reconciles changes.",
    "What is the difference between server-side and client-side rendering?",
    "How do you manage state in a large-scale frontend application?",
    "Explain REST API design best practices.",
    "What is middleware in Express.js? Give an example of when you'd use it.",
    "How does dependency injection work in Spring Boot?",
    "Explain the difference between SQL and NoSQL databases. When would you choose each?",
    "What is CORS and how do you handle it?",
  ],
  databases: [
    "Explain database normalization. What are 1NF, 2NF, and 3NF?",
    "What is the difference between a clustered and non-clustered index?",
    "How do you optimize a slow SQL query?",
    "Explain ACID properties in database transactions.",
    "What is a database connection pool and why is it important?",
    "How would you design a schema for a multi-tenant application?",
    "Explain the difference between optimistic and pessimistic locking.",
  ],
  cloud_devops: [
    "Explain the difference between Docker and Kubernetes.",
    "What is a CI/CD pipeline? Describe the stages.",
    "How do you monitor a microservices architecture?",
    "Explain blue-green deployment and canary releases.",
    "What is Infrastructure as Code? What tools have you used?",
    "How do you handle secrets management in cloud deployments?",
    "Explain the shared responsibility model in cloud security.",
    "What strategies do you use for auto-scaling?",
  ],
  ml_ai: [
    "Explain the bias-variance tradeoff.",
    "What is the difference between supervised and unsupervised learning?",
    "How does backpropagation work in neural networks?",
    "Explain overfitting and how to prevent it.",
    "What metrics would you use to evaluate a classification model?",
    "Describe a machine learning project from data collection to deployment.",
    "What is transfer learning and when would you use it?",
    "Explain the difference between CNN and RNN architectures.",
  ],
  electronics: [
    "Explain the working principle of an operational amplifier.",
    "What is the Nyquist sampling theorem?",
    "Describe how an ADC (Analog-to-Digital Converter) works.",
    "Explain the difference between combinational and sequential circuits.",
    "What is a finite state machine? Design one for a traffic light controller.",
    "How do you design a low-pass filter? Explain the components.",
  ],
  embedded: [
    "Explain the boot process of an embedded system.",
    "What is the difference between polling and interrupt-driven I/O?",
    "How do you debug an embedded system with limited resources?",
    "Explain real-time operating systems and scheduling algorithms.",
    "What is DMA and why is it used?",
    "Describe how you would interface a sensor with a microcontroller.",
  ],
  vlsi: [
    "Explain the ASIC design flow from specification to tape-out.",
    "What is the difference between FPGA and ASIC?",
    "Explain setup and hold time violations in digital circuits.",
    "What is clock tree synthesis and why is it important?",
    "Describe power optimization techniques in VLSI design.",
  ],
  cad: [
    "Explain the process of creating a 3D model from a 2D sketch in SolidWorks.",
    "What is GD&T? Why is it important in manufacturing?",
    "Describe a thermal analysis you performed using ANSYS.",
    "How do you optimize a design for manufacturability?",
    "Explain the difference between FEA and CFD analysis.",
  ],
  soft_skills: [
    "Tell us about a time you had to work with a difficult team member. How did you handle it?",
    "Describe a project where you had to learn a new technology quickly.",
    "How do you prioritize tasks when everything seems urgent?",
    "Tell us about a time you failed. What did you learn from it?",
    "How do you handle feedback and criticism?",
    "Describe a situation where you had to persuade your team to adopt a new approach.",
  ],
  finance: [
    "Walk us through a DCF valuation model.",
    "How do you analyze a company's financial health?",
    "Explain the difference between equity and debt financing.",
    "What are the key ratios you look at when analyzing a company?",
    "How would you assess credit risk for a corporate client?",
    "Describe your experience with financial modeling in Excel.",
  ],
  hr: [
    "How do you source passive candidates?",
    "Describe your approach to conducting a behavioral interview.",
    "How do you measure the effectiveness of your recruitment process?",
    "What strategies do you use for employee retention?",
    "How do you handle a conflict between two team members?",
    "Explain your experience with HRIS systems.",
  ],
  general: [
    "Why are you interested in this role?",
    "Where do you see yourself in 5 years?",
    "What are your greatest strengths and how do they apply to this role?",
    "Describe your ideal work environment.",
    "What motivates you in your career?",
    "How do you stay updated with industry trends?",
  ],
};

const DOMAIN_QUESTION_MAP: Record<string, string[]> = {
  cse: ["programming", "web_frameworks", "databases", "cloud_devops", "ml_ai", "soft_skills", "general"],
  it_services: ["programming", "databases", "cloud_devops", "soft_skills", "general"],
  ece_eee: ["electronics", "embedded", "vlsi", "programming", "soft_skills", "general"],
  mechanical: ["cad", "soft_skills", "general", "programming"],
  civil: ["cad", "soft_skills", "general"],
  sap_erp: ["programming", "databases", "soft_skills", "general"],
  finance: ["finance", "soft_skills", "general"],
  banking_fintech: ["finance", "programming", "databases", "soft_skills", "general"],
  hr: ["hr", "soft_skills", "general"],
  healthcare: ["general", "soft_skills", "programming"],
  design: ["web_frameworks", "soft_skills", "general"],
  business: ["soft_skills", "finance", "general"],
  commerce: ["finance", "soft_skills", "general"],
  mba: ["soft_skills", "finance", "general"],
  general: ["soft_skills", "general"],
};

export async function generateInterviewQuestions(
  file: File,
  jobDescription?: string,
  maxQuestions = 20,
): Promise<{
  total_questions: number;
  experience_level: string;
  detected_domain: string;
  detected_skills: string[];
  questions: { category: string; question: string }[];
  categories: Record<string, string[]>;
  category_list: string[];
  filename: string;
}> {
  const text = await extractTextFromFile(file);
  const skills = extractSkillsFromText(text);
  const { domain } = detectDomain(text);
  const structure = analyzeTextStructure(text);

  let experienceLevel = "entry-level";
  const yearsMatch = text.match(/(\d+)\+?\s*(?:years|yrs)/i);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1], 10);
    if (years >= 7) experienceLevel = "senior";
    else if (years >= 3) experienceLevel = "mid-level";
    else if (years >= 1) experienceLevel = "junior";
  }

  const relevantCategories = DOMAIN_QUESTION_MAP[domain] || DOMAIN_QUESTION_MAP.general;
  const categories: Record<string, string[]> = {};
  const allQuestions: { category: string; question: string }[] = [];
  let count = 0;

  for (const cat of relevantCategories) {
    const bank = QUESTION_BANK[cat] || [];
    const selected: string[] = [];
    const questionsPerCategory = Math.ceil(maxQuestions / relevantCategories.length);

    for (let i = 0; i < Math.min(questionsPerCategory, bank.length) && count < maxQuestions; i++) {
      selected.push(bank[i]);
      allQuestions.push({ category: cat, question: bank[i] });
      count++;
    }
    if (selected.length > 0) {
      categories[cat] = selected;
    }
  }

  if (jobDescription && jobDescription.trim().length > 10) {
    const jdSkills = extractSkillsFromText(jobDescription);
    const matchedFromJd = jdSkills.filter((s) => skills.includes(s));
    if (matchedFromJd.length > 0 && count < maxQuestions) {
      const skillQ = `How have you applied ${matchedFromJd[0]} in a real-world project? Describe the impact.`;
      categories["job_specific"] = [skillQ];
      allQuestions.push({ category: "job_specific", question: skillQ });
      count++;
    }
  }

  return {
    total_questions: allQuestions.length,
    experience_level: experienceLevel,
    detected_domain: domain,
    detected_skills: skills.slice(0, 15),
    questions: allQuestions,
    categories,
    category_list: Object.keys(categories),
    filename: file.name,
  };
}
