import Link from "next/link";
import { Logo } from "@/components/brand";

const steps = [
  ["Create", "Build slides with text, images, shapes — and quizzes, polls, ratings, sliders and forms."],
  ["Control", "Run the show from your phone. Next, previous, timers, open and close questions."],
  ["Experience", "Your audience scans a QR code and answers on their phones. No accounts, no apps."],
];

export default function Home() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo href="/" />
        <div><Link href="/join" className="text-button">Join a session</Link><Link href="/login" className="text-button">Sign in</Link><Link href="/signup" className="button-primary">Get started</Link></div>
      </nav>
      <main>
        <section className="landing-hero">
          <p className="eyebrow">Live, interactive presentations</p>
          <h1>One room.<br /><span className="gradient-text">Every screen.</span></h1>
          <p className="lede">Livo keeps your slides, your phone and every device in the audience in sync — with live quizzes and results that update as people answer.</p>
          <div className="row-actions"><Link href="/signup" className="button-primary big">Create a presentation</Link><Link href="/join" className="button-secondary big">I have a room code</Link></div>
        </section>
        <section className="landing-steps">
          {steps.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{body}</p></article>)}
        </section>
      </main>
    </div>
  );
}
