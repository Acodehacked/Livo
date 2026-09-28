import type { Fill, PresentationDoc, Slide, SlideElement } from "@livo/types";
import { blankSlide, BRAND, createElement, newOption } from "./elements";

// Templates are predefined slide structures (PRD §62–63). Each builds a fresh document on demand.

type Theme = { background: Fill; accentBackground: Fill; title: string; body: string; muted: string; font: string };

const THEMES = {
  ieee: { background: { type: "solid", color: "#ffffff" }, accentBackground: { type: "linear", angle: 135, from: "#00629b", to: "#003a5d" }, title: "#00304d", body: "#29435a", muted: "#6b7f90", font: "Plus Jakarta Sans" },
  classroom: { background: { type: "solid", color: "#fffaf0" }, accentBackground: { type: "linear", angle: 135, from: "#ffb648", to: "#ff6f61" }, title: "#3a2618", body: "#5a4636", muted: "#8a7666", font: "Plus Jakarta Sans" },
  quiz: { background: { type: "linear", angle: 160, from: "#171a3a", to: "#0b0d1a" }, accentBackground: { type: "linear", angle: 135, from: BRAND.violet, to: BRAND.pink }, title: "#ffffff", body: "#d9dcf5", muted: "#9aa0c8", font: "Plus Jakarta Sans" },
  conference: { background: { type: "solid", color: "#0e1022" }, accentBackground: { type: "linear", angle: 120, from: BRAND.blue, to: BRAND.violet }, title: "#ffffff", body: "#cfd3ef", muted: "#8a90b8", font: "Plus Jakarta Sans" },
  corporate: { background: { type: "solid", color: "#f6f7fb" }, accentBackground: { type: "linear", angle: 90, from: "#1f2a44", to: "#34466e" }, title: "#1f2a44", body: "#3e4a66", muted: "#7a849c", font: "Inter" },
  seminar: { background: { type: "solid", color: "#fbfaf7" }, accentBackground: { type: "linear", angle: 135, from: "#2e7d6b", to: "#1b4f45" }, title: "#1b3b35", body: "#38534d", muted: "#76908a", font: "Georgia" },
} satisfies Record<string, Theme>;

const text = (theme: Theme, html: string, box: { x: number; y: number; width: number; height: number }, size: number, color = theme.body, align: "left" | "center" = "left") =>
  createElement("text", { box, props: { html, fontSize: size, color, align, fontFamily: theme.font, lineHeight: 1.3 } });

function slide(theme: Theme, title: string, elements: SlideElement[], accent = false): Slide {
  const result = blankSlide(title, elements);
  result.background = { fill: accent ? theme.accentBackground : theme.background, image: null };
  return result;
}

const titleSlide = (theme: Theme, heading: string, sub: string) =>
  slide(theme, "Title", [text(theme, `<b>${heading}</b>`, { x: 100, y: 230, width: 1080, height: 150 }, 76, "#ffffff", "center"), text(theme, sub, { x: 200, y: 400, width: 880, height: 70 }, 30, "rgba(255,255,255,0.85)", "center")], true);

const headed = (theme: Theme, heading: string, elements: SlideElement[]) =>
  slide(theme, heading, [text(theme, `<b>${heading}</b>`, { x: 90, y: 60, width: 1100, height: 90 }, 52, theme.title), ...elements]);

const bullets = (theme: Theme, heading: string, items: string[]) =>
  headed(theme, heading, [text(theme, `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`, { x: 90, y: 180, width: 1100, height: 460 }, 32, theme.body)]);

const interactive = (theme: Theme, heading: string, element: SlideElement) => {
  const dark = theme === THEMES.quiz || theme === THEMES.conference;
  if (dark) element.style = { ...element.style, fill: { type: "solid", color: "#1b1f3f" }, borderColor: "#2c3160", textColor: "#ffffff", accent: BRAND.pink };
  return slide(theme, heading, [{ ...element, y: 120, x: Math.round((1280 - element.width) / 2) }]);
};

const quiz = (question: string, options: string[], correctIndex: number) => {
  const element = createElement("quiz", { props: { question, options: options.map((label) => newOption(label)) } });
  element.props.correct = [element.props.options[correctIndex].id];
  return element;
};

const thanks = (theme: Theme, sub = "Questions?") => titleSlide(theme, "Thank you", sub);

export const TEMPLATES: { id: string; name: string; description: string; preview: Fill; build: () => Omit<PresentationDoc, "id"> }[] = [
  {
    id: "ieee", name: "IEEE Workshop", description: "Title, speaker, agenda, poll, content, quiz, feedback", preview: THEMES.ieee.accentBackground,
    build: () => { const t = THEMES.ieee; return { title: "IEEE Workshop", slides: [
      titleSlide(t, "IEEE Workshop", "Branch name · Date"),
      headed(t, "Speaker introduction", [text(t, "<b>Speaker name</b><br>Role, organisation<br><br>A short bio that tells the audience why you're the right person to lead this session.", { x: 90, y: 190, width: 700, height: 400 }, 30), createElement("icon", { box: { x: 880, y: 230, width: 260, height: 260 }, props: { glyph: "🎤" } })]),
      bullets(t, "Agenda", ["Introduction", "Core concepts", "Hands-on demo", "Quiz", "Feedback & Q&A"]),
      interactive(t, "Warm-up poll", createElement("poll", { props: { question: "How familiar are you with today's topic?", options: [newOption("Beginner"), newOption("Intermediate"), newOption("Advanced")] } })),
      bullets(t, "Content", ["Key idea one", "Key idea two", "Key idea three"]),
      interactive(t, "Quiz", quiz("What does API stand for?", ["Application Programming Interface", "Automated Programming Interface", "Application Protocol Interface", "Advanced Programming Interface"], 0)),
      headed(t, "Results", [text(t, "Let's review how everyone did on the quiz.", { x: 90, y: 200, width: 1100, height: 120 }, 34)]),
      interactive(t, "Feedback", createElement("form")),
      thanks(t, "Connect with your IEEE student branch"),
    ] }; },
  },
  {
    id: "classroom", name: "Classroom", description: "Lesson objectives, check-in, practice and exit ticket", preview: THEMES.classroom.accentBackground,
    build: () => { const t = THEMES.classroom; return { title: "Today's lesson", slides: [
      titleSlide(t, "Today's lesson", "Subject · Class"),
      bullets(t, "Learning objectives", ["By the end of this lesson you will…", "Understand…", "Be able to…"]),
      interactive(t, "Check-in", createElement("rating", { props: { question: "How are you feeling about this topic?", icon: "heart", results: "live" } })),
      bullets(t, "Key concepts", ["Concept one", "Concept two", "Worked example"]),
      interactive(t, "Practice", quiz("Which of these is a prime number?", ["21", "27", "29", "33"], 2)),
      interactive(t, "Exit ticket", createElement("open_text", { props: { question: "One thing you learned today:" } })),
      thanks(t, "See you next class"),
    ] }; },
  },
  {
    id: "quiz", name: "Quiz", description: "A fast, timed quiz night with live results", preview: THEMES.quiz.accentBackground,
    build: () => { const t = THEMES.quiz; return { title: "Quiz time", slides: [
      titleSlide(t, "Quiz time!", "Scan the QR code to join"),
      bullets(t, "How it works", ["Answer on your phone", "Faster is better — each question is timed", "Results appear after each question"]),
      interactive(t, "Question 1", quiz("Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Mercury"], 1)),
      interactive(t, "Question 2", quiz("What is the largest ocean on Earth?", ["Atlantic", "Indian", "Arctic", "Pacific"], 3)),
      interactive(t, "Question 3", quiz("Who wrote 'Romeo and Juliet'?", ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], 1)),
      interactive(t, "Question 4", (() => { const element = createElement("quiz", { props: { question: "HTML is a programming language.", mode: "yesno", options: [] } }); element.props.correct = ["no"]; return element; })()),
      thanks(t, "Thanks for playing!"),
    ] }; },
  },
  {
    id: "conference", name: "Conference", description: "Keynote-style talk with audience poll and Q&A", preview: THEMES.conference.accentBackground,
    build: () => { const t = THEMES.conference; return { title: "Conference talk", slides: [
      titleSlide(t, "Talk title", "Speaker · Conference 2026"),
      interactive(t, "Audience poll", createElement("poll", { props: { question: "Which technology interests you most?", options: [newOption("AI"), newOption("Cloud"), newOption("Cybersecurity"), newOption("Web development")] } })),
      headed(t, "The problem", [text(t, "Frame the problem your talk solves in one or two sentences.", { x: 90, y: 200, width: 1100, height: 200 }, 38, t.body)]),
      bullets(t, "Our approach", ["Insight one", "Insight two", "Insight three"]),
      headed(t, "Takeaways", [text(t, "<b>1.</b> …<br><b>2.</b> …<br><b>3.</b> …", { x: 90, y: 190, width: 1100, height: 400 }, 36, t.body)]),
      interactive(t, "Questions", createElement("open_text", { props: { question: "What would you like to ask the speaker?", results: "live" } })),
      thanks(t, "@handle · website.com"),
    ] }; },
  },
  {
    id: "corporate", name: "Corporate", description: "Team update with metrics, pulse check and next steps", preview: THEMES.corporate.accentBackground,
    build: () => { const t = THEMES.corporate; return { title: "Quarterly update", slides: [
      titleSlide(t, "Quarterly update", "Team · Q3"),
      bullets(t, "Agenda", ["Highlights", "Metrics", "Priorities", "Pulse check"]),
      headed(t, "Highlights", [createElement("shape", { box: { x: 90, y: 200, width: 340, height: 220 }, props: { text: "Launched X" } }), createElement("shape", { box: { x: 470, y: 200, width: 340, height: 220 }, props: { text: "+24% growth" } }), createElement("shape", { box: { x: 850, y: 200, width: 340, height: 220 }, props: { text: "3 new hires" } })]),
      bullets(t, "Priorities for next quarter", ["Priority one", "Priority two", "Priority three"]),
      interactive(t, "Pulse check", createElement("slider", { props: { question: "How confident are you in our Q4 plan?", results: "live" } })),
      thanks(t, "Next steps in your inbox"),
    ] }; },
  },
  {
    id: "seminar", name: "Seminar", description: "Academic seminar with reading, discussion and survey", preview: THEMES.seminar.accentBackground,
    build: () => { const t = THEMES.seminar; return { title: "Seminar", slides: [
      titleSlide(t, "Seminar title", "Presenter · Department"),
      bullets(t, "Outline", ["Background", "Key reading", "Discussion", "Summary"]),
      headed(t, "Background", [text(t, "Summarise the context and the research question.", { x: 90, y: 200, width: 1100, height: 300 }, 32)]),
      interactive(t, "Discussion", createElement("open_text", { props: { question: "What is the strongest argument in today's reading?", results: "live" } })),
      interactive(t, "Survey", createElement("rating", { props: { question: "How clear was today's seminar?" } })),
      thanks(t, "Further reading on the course page"),
    ] }; },
  },
];
