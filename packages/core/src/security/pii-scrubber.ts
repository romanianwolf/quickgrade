export function scrubPII(text: string): { scrubbed: string; redacted: string[] } {
  const patterns = [
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'ssn' },
    { regex: /\b[\w.+-]+@[\w.-]+\.\w+\b/g, label: 'email' },
    { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, label: 'phone' },
    { regex: /\bstudent[_-]?id[:\s]*[\w-]+\b/gi, label: 'student_id' },
    { regex: /\b\d{9,10}\b/g, label: 'numeric_id' },
  ];
  
  const redacted: string[] = [];
  let scrubbed = text;
  
  for (const { regex, label } of patterns) {
    scrubbed = scrubbed.replace(regex, (match) => {
      redacted.push(`[${label}:REDACTED]`);
      return `[${label}:REDACTED]`;
    });
  }
  
  return { scrubbed, redacted };
}