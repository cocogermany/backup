/**
 * CocoGermany Blog — Articles Registry (blog-data.js)
 * Add new articles to this array to automatically display them in the blog listing & search.
 */

const BLOG_ARTICLES = [
  {
    id: "why-practice-mock-exams-matter-before-german-exam",
    slug: "why-practice-mock-exams-matter-before-german-exam",
    title: "Why Practice & Mock Exams Matter Before Your German Exam",
    excerpt:
      "Passive studying alone won't prepare you for Goethe or telc exam day. Discover why timed mock exams, simulated pressure, and instant feedback are the keys to passing on your first attempt.",
    category: "Exam Tips",
    level: "A1–B2",
    readTime: "7 min read",
    publishedDate: "September 14, 2026",
    isoDate: "2026-09-14",
    author: {
      name: "Coco Germany Editorial Team",
      role: "German Language & Exam Specialists",
      avatarText: "CG"
    },
    coverImage: "assets/cover-mock-exams.svg",
    featured: true,
    url: "why-practice-mock-exams-matter-before-german-exam.html",
    tags: ["Goethe", "telc", "Mock Exams", "Exam Strategy", "Practice Routine"]
  },
  {
    id: "goethe-vs-telc-b1-exam-differences",
    slug: "goethe-vs-telc-b1-exam-differences",
    title: "Goethe vs. telc B1: Key Differences, Scoring & Which Exam You Should Choose",
    excerpt:
      "A complete breakdown of module formats, timing constraints, grading rubrics, and recognition in Germany to help you select the ideal certification for your career or visa.",
    category: "Exam Tips",
    level: "B1",
    readTime: "6 min read",
    publishedDate: "September 10, 2026",
    isoDate: "2026-09-10",
    author: {
      name: "Coco Germany Editorial Team",
      role: "German Language & Exam Specialists",
      avatarText: "CG"
    },
    coverImage: "assets/cover-goethe-telc.svg",
    featured: false,
    url: "why-practice-mock-exams-matter-before-german-exam.html", // Links to main comprehensive guide
    tags: ["Goethe", "telc", "B1 Level", "Certification"]
  },
  {
    id: "mastering-schreiben-time-pressure-guide",
    slug: "mastering-schreiben-time-pressure-guide",
    title: "How to Structure German Writing Tasks Under Strict Time Pressure",
    excerpt:
      "Learn the exact paragraph frames, connector phrases (Redemittel), and planning steps to consistently hit your target word count and score top marks in the Schreiben module.",
    category: "Writing & Grammar",
    level: "A2–B2",
    readTime: "5 min read",
    publishedDate: "September 5, 2026",
    isoDate: "2026-09-05",
    author: {
      name: "Coco Germany Editorial Team",
      role: "German Language & Exam Specialists",
      avatarText: "CG"
    },
    coverImage: "assets/cover-schreiben.svg",
    featured: false,
    url: "why-practice-mock-exams-matter-before-german-exam.html",
    tags: ["Schreiben", "Writing", "Redemittel", "Grammar"]
  },
  {
    id: "essential-exam-day-checklist-german-exams",
    slug: "essential-exam-day-checklist-german-exams",
    title: "The Ultimate German Exam Day Checklist: Sleep, Pacing, and Hall Psychology",
    excerpt:
      "Avoid common test-day pitfalls. From what identification documents to bring, to managing adrenaline during the Hören section and speaking with your examination partner.",
    category: "Mock Preparation",
    level: "A1–B2",
    readTime: "4 min read",
    publishedDate: "August 28, 2026",
    isoDate: "2026-08-28",
    author: {
      name: "Coco Germany Editorial Team",
      role: "German Language & Exam Specialists",
      avatarText: "CG"
    },
    coverImage: "assets/cover-exam-day.svg",
    featured: false,
    url: "why-practice-mock-exams-matter-before-german-exam.html",
    tags: ["Exam Day", "Mindset", "Goethe", "telc"]
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BLOG_ARTICLES };
}
