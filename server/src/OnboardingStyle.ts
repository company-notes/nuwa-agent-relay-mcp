/** Responsive, self-hosted stylesheet. No third-party fonts, analytics or images. */
export const ONBOARDING_CSS = `
:root {
  color-scheme: light;
  --ink: #193331;
  --muted: #59706d;
  --green: #126857;
  --sea: #caebe1;
  --cream: #f7f8f3;
  --line: #dce6e0;
  --soft: #edf4ef;
  --white: #ffffff;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Noto Sans TC", Arial, sans-serif;
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 90px; }
body { margin: 0; background: var(--cream); color: var(--ink); line-height: 1.65; }
a { color: var(--green); text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible, summary:focus-visible {
  outline: 3px solid #6fb9a5;
  outline-offset: 3px;
}
.skip { position: absolute; top: -80px; left: 12px; z-index: 50; padding: 10px; background: white; }
.skip:focus { top: 12px; }
.nav { position: sticky; top: 0; z-index: 30; background: rgba(247, 248, 243, .96); border-bottom: 1px solid var(--line); backdrop-filter: blur(14px); }
.nav-inner { max-width: 1220px; margin: auto; padding: 13px 28px; display: flex; align-items: center; gap: 40px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-size: 23px; font-weight: 800; letter-spacing: -.09em; text-decoration: none; white-space: nowrap; }
.brand small { font-weight: 500; color: var(--muted); letter-spacing: -.025em; font-size: 17px; }
.brand-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 12px 4px 12px 4px; background: var(--green); color: white; font-size: 20px; transform: rotate(-7deg); }
.nav nav { display: flex; gap: 30px; margin: auto; }
.nav nav a, .nav-skill { color: #405852; text-decoration: none; font-size: 14px; font-weight: 600; }
.nav nav a:hover { color: var(--green); }
.nav-skill { padding: 9px 16px; border: 1px solid #c1d3ca; border-radius: 100px; white-space: nowrap; }
.nav-skill:hover { background: #e4f1e9; }
.hero { background: #14392f; color: #f6fff9; overflow: hidden; position: relative; }
.hero:after { content: ""; position: absolute; width: 520px; height: 520px; right: -150px; top: -300px; border-radius: 50%; background: #22574b; filter: blur(100px); opacity: .6; }
.hero-inner { max-width: 1220px; margin: auto; min-height: 530px; padding: 85px 28px 93px; display: grid; grid-template-columns: 1.15fr .85fr; align-items: center; gap: 50px; position: relative; z-index: 1; }
.hero-copy { max-width: 650px; }
.eyebrow { color: #9edfc8; font-size: 12px; letter-spacing: .15em; font-weight: 800; display: flex; align-items: center; gap: 10px; }
.pulse { width: 9px; height: 9px; border-radius: 50%; background: #b7ef94; box-shadow: 0 0 0 5px rgba(183,239,148,.12); }
h1 { font-size: clamp(42px, 5vw, 66px); line-height: 1.18; letter-spacing: -.07em; margin: 22px 0; font-weight: 780; }
h1 em { font-style: normal; color: #b6e8ce; }
.hero-lead { font-size: 17px; line-height: 1.95; max-width: 590px; color: #d5e7de; }
.hero-actions { display: flex; gap: 13px; align-items: center; margin-top: 32px; flex-wrap: wrap; }
.primary, .secondary { display: inline-flex; align-items: center; gap: 25px; padding: 13px 23px; border-radius: 10px; text-decoration: none; font-weight: 750; font-size: 15px; }
.primary { color: #12382d; background: #c6f3a5; }
.primary:hover { background: #e2ffc9; }
.secondary { color: #e5f4e8; border: 1px solid #6b9a88; }
.secondary:hover { background: #245344; }
.hero-footnote { color: #a6c9b9; font-size: 12px; margin-top: 22px; }
.hero-diagram { position: relative; border: 1px solid #598978; border-radius: 23px; background: rgba(255,255,255,.06); padding: 31px; box-shadow: 0 28px 90px rgba(0,0,0,.11); transform: rotate(1deg); }
.hero-diagram:before { content: ""; position: absolute; inset: 15px; border: 1px dashed #7caa96; border-radius: 16px; opacity: .2; pointer-events: none; }
.agent { display: flex; align-items: center; gap: 15px; background: #fff; color: var(--ink); border-radius: 15px; padding: 19px 24px; max-width: 330px; position: relative; z-index: 1; box-shadow: 0 10px 30px rgba(0,0,0,.07); }
.agent-b { margin-left: auto; }
.agent strong { display: block; font-size: 18px; }
.agent small { display: block; color: #7a9186; font-size: 13px; }
.avatar { display: inline-grid; place-items: center; width: 45px; height: 45px; border-radius: 14px; flex-shrink: 0; font-weight: 800; }
.avatar-a { background: #e8e3fb; color: #6046ae; }
.avatar-b { background: #fbeacb; color: #966b16; }
.connector { display: flex; align-items: center; justify-content: center; height: 112px; }
.line { width: 42px; border-top: 2px dashed #a0dcbf; }
.node { background: #c7f1a7; color: #254631; width: 104px; height: 67px; display: grid; align-content: center; text-align: center; border-radius: 16px; font-weight: 900; font-size: 18px; line-height: 1.1; box-shadow: 0 0 0 7px rgba(199,241,167,.1); }
.node small { display: block; font-size: 13px; font-weight: 600; }
.diagram-note { color: #d3eedc; font-size: 12px; text-align: center; margin-top: 24px; }
.tick { color: #b6eb9f; } .separator { margin: 0 6px; }
.diagram-slide[hidden] { display: none!important; }
.onboarding-diagram { transform: none; padding: 22px; }
.diagram-slide { min-height: 302px; }
.diagram-slide[data-diagram-slide="0"] { display: flex; flex-direction: column; justify-content: center; }
.simple-office { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: rgba(255,255,255,.1); border: 1px solid #779b8e; padding: 16px; border-radius: 15px; }
.simple-platform { font-size: 12px; font-weight: 800; color: #d3ebdd; }
.simple-person { display: flex; align-items: center; gap: 10px; color: #17382d; background: white; border-radius: 12px; padding: 9px 12px; min-width: 175px; }
.simple-person strong { display: block; font-size: 16px; }
.simple-person small { display: block; color: #71897d; font-size: 10px; }
.simple-person .avatar { width: 36px; height: 36px; border-radius: 10px; }
.simple-relay { display: flex; justify-content: center; align-items: center; gap: 0; height: 96px; }
.simple-wire { border-top: 2px dashed #a8d9c6; width: 30%; max-width: 155px; }
.simple-center { width: 103px; height: 62px; flex: 0 0 103px; display: grid; align-content: center; justify-content: center; text-align: center; border-radius: 13px; background: #c6f3a5; color: #254631; }
.simple-center strong { font-size: 19px; line-height: 1.1; }
.simple-center small { font-size: 11px; }
.diagram-caption { text-align: center; font-size: 12px; color: #d2e8dc; margin: 15px 0 0; }
.diagram-pagination { display: flex; justify-content: center; gap: 8px; padding-top: 18px; }
.diagram-pagination button { border: 1px solid #7aa996; background: transparent; color: #d7eee1; font-size: 12px; padding: 7px 15px; border-radius: 99px; }
.diagram-pagination button[aria-pressed="true"] { background: #c6f3a5; border-color: #c6f3a5; color: #1b4835; font-weight: 800; }
.diagram-pagination button:hover { border-color: #c6f3a5; }
.inline-details { margin-top: 20px; border: 1px solid #e9cf9b; background: #fffdf5; padding: 13px 15px; border-radius: 10px; }
.inline-details summary { cursor: pointer; color: #775323; font-size: 13px; font-weight: 800; }
.inline-details p { margin-bottom: 0; color: #71624d; font-size: 13px; }
.office-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.office-card { border: 1px solid #7aa18e; background: rgba(255,255,255,.1); border-radius: 15px; padding: 16px; min-width: 0; }
.office-label { display: block; color: #d0f0dc; font-size: 12px; font-weight: 800; margin-bottom: 12px; }
.office-exchange { background: #c8f2d5; color: #1a4b37; border-radius: 9px; padding: 12px; font-size: 13px; font-weight: 850; }
.office-exchange small { display: block; color: #527462; font-size: 10px; font-weight: 600; }
.office-worker { display: flex; align-items: center; gap: 9px; margin-top: 14px; background: #fff; color: #193331; padding: 12px; border-radius: 10px; }
.office-worker .avatar { width: 34px; height: 34px; border-radius: 10px; }
.office-worker strong { display: block; font-size: 14px; }
.office-worker small { display: block; color: #688077; font-size: 11px; }
.office-link { display: flex; align-items: center; justify-content: space-between; gap: 5px; margin-top: 20px; color: #c6e6d9; font-size: 11px; font-weight: 700; }
.route-line { border-top: 2px dashed #a0dcbf; flex: 1; min-width: 12px; }
.relay-node { display: grid; place-content: center; text-align: center; background: #c7f1a7; color: #254631; border-radius: 12px; width: 94px; min-height: 65px; font-size: 17px; font-weight: 900; line-height: 1.1; }
.relay-node small { display: block; font-size: 11px; margin-top: 4px; font-weight: 750; }
.intro { padding-top: 76px; }
.intro .principles { margin: 0; padding: 0; position: static; }
.intro-note { padding: 19px 22px; border-radius: 12px; background: #e5f1e8; color: #285b45; font-weight: 750; font-size: 14px; margin-top: 17px; }
.address-error { color: #a25620!important; }
.principles { max-width: 1220px; margin: -39px auto 0; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); position: relative; z-index: 2; padding: 0 28px; gap: 12px; }
.principle { background: white; display: flex; gap: 14px; padding: 20px; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 45px rgba(34,67,53,.055); }
.principle-icon { color: var(--green); font-size: 12px; font-weight: 900; background: #e3f5e9; border-radius: 9px; width: 33px; height: 33px; flex: 0 0 33px; display: grid; place-items: center; }
.principle strong { display: block; font-size: 14px; }
.principle p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.65; }
.section-shell { max-width: 1010px; padding: 96px 28px 15px; margin: auto; }
.section-kicker { color: var(--green); font-size: 12px; font-weight: 900; letter-spacing: .14em; }
.section-head { margin-bottom: 39px; }
h2 { font-size: clamp(29px,3vw,39px); line-height: 1.35; letter-spacing: -.045em; margin: 10px 0 15px; }
.section-head > p { color: var(--muted); font-size: 15px; max-width: 740px; }
.progress { display: flex; gap: 16px; align-items: center; font-size: 13px; color: var(--muted); margin-bottom: 25px; }
.progress > span:first-child { font-weight: 800; color: var(--green); }
.progress > span:last-child { font-size: 12px; }
.progress-track { height: 8px; background: #e4eae3; border-radius: 100px; flex: 1; overflow: hidden; }
#progressFill { height: 100%; width: 0%; background: #3b9777; border-radius: inherit; transition: width .25s ease; }
.step { display: grid; grid-template-columns: 68px 1fr; gap: 16px; padding: 0 0 31px; }
.step-num { background: #e2f0e5; border: 1px solid #bfd9ca; width: 50px; height: 50px; border-radius: 50%; color: var(--green); font-size: 16px; font-weight: 900; display: grid; place-items: center; position: sticky; top: 95px; }
.step-body { background: white; border: 1px solid var(--line); box-shadow: 0 6px 35px rgba(30,69,52,.025); border-radius: 17px; padding: 30px; min-width: 0; }
.step-body > p { color: var(--muted); font-size: 14px; margin: 14px 0 23px; }
.step-body strong { color: var(--ink); }
.step-body code, .faq code, .proof-grid code { background: #e8f2eb; color: #28624c; padding: 1px 5px; border-radius: 4px; font: .92em ui-monospace, "Cascadia Code", Menlo, monospace; overflow-wrap: anywhere; }
.step-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kicker { color: var(--green); text-transform: uppercase; font-size: 11px; letter-spacing: .11em; font-weight: 900; }
h3 { font-size: clamp(21px,2.4vw,26px); line-height: 1.35; letter-spacing: -.03em; margin: 5px 0 0; }
.done { white-space: nowrap; font-size: 13px; color: var(--muted); padding-top: 6px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
.done input { accent-color: var(--green); width: 16px; height: 16px; }
.agent-grid, .address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.agent-card { border: 1px solid var(--line); background: #fafcf9; border-radius: 12px; padding: 19px; }
.agent-title { display: flex; align-items: center; gap: 10px; font-weight: 800; margin-bottom: 14px; }
.agent-title .avatar { width: 32px; height: 32px; border-radius: 10px; }
.agent-card label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 7px; }
.agent-card select { width: 100%; background: white; color: var(--ink); border: 1px solid #bed1c6; border-radius: 8px; padding: 10px; }
.muted { color: var(--muted); font-size: 12px; }
.note, .warning { margin-top: 22px; background: #edf7f0; border-left: 3px solid #58a786; border-radius: 5px 10px 10px 5px; padding: 15px 17px; font-size: 13px; color: #335c4c; }
.warning { background: #fff6e5; border-color: #d59b33; color: #714e20; }
.note a { font-weight: 650; }
.copy-card { border: 1px solid #d5e5db; border-radius: 12px; overflow: hidden; margin: 16px 0; }
.copy-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 17px; background: #eff6f1; gap: 12px; }
.copy-head strong { font-size: 14px; }
.copy { border: 1px solid #9ec7b2; background: white; border-radius: 8px; padding: 7px 15px; color: var(--green); font-size: 12px; font-weight: 800; white-space: nowrap; }
.copy:hover { background: #dcf5e6; }
.prompt { margin: 0; white-space: pre-wrap; word-break: break-word; background: #fafcfb; padding: 20px; font: 13px/1.9 ui-monospace, "Cascadia Code", Menlo, Consolas, "Noto Sans TC", monospace; color: #314d43; max-height: 430px; overflow: auto; user-select: text; }
.resource-pair { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 12px 0; border: 1px solid #d5e4da; padding: 13px 15px; border-radius: 10px; }
.resource-pair > div { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.resource-pair span { font-size: 12px; font-weight: 800; }
.resource-pair code { font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
.hint { font-size: 12px!important; color: var(--muted); }
.address-grid label { font-size: 14px; font-weight: 750; }
.address-grid label span { display: block; font-size: 12px; font-weight: 400; color: var(--muted); }
.address-grid input { display: block; width: 100%; border: 1px solid #bacfc1; border-radius: 9px; background: #fff; padding: 12px; margin-top: 8px; font-size: 14px; }
.call-flow { display: flex; justify-content: center; flex-wrap: wrap; align-items: center; gap: 13px; border-radius: 12px; padding: 17px 12px; background: #eff6f1; color: #37624e; font-size: 13px; font-weight: 800; }
.call-flow span:nth-child(even) { color: #72a28a; }
.platform-notes { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
.platform-notes article { border: 1px solid var(--line); background: #fbfcfa; border-radius: 12px; padding: 17px; }
.platform-notes h4 { margin: 0; }
.platform-notes p { font-size: 13px; color: var(--muted); line-height: 1.8; }
.platform-notes a { font-size: 12px; font-weight: 800; }
.finish { max-width: 1130px; background: #e8f2e9; margin-top: 60px; padding: 54px; border-radius: 20px; display: grid; grid-template-columns: 62px 1fr; gap: 16px; }
.finish-icon { width: 50px; height: 50px; background: #288569; color: white; display: grid; place-items: center; border-radius: 15px; font-size: 27px; font-weight: 900; }
.finish h2 { margin: 3px 0 9px; }
.finish p { margin: 0; color: var(--muted); }
.proof-grid { grid-column: 1/-1; display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-top: 20px; }
.proof-grid > div { background: #fff; border-radius: 12px; padding: 21px; }
.proof-grid > div > span { display: inline-grid; place-items: center; color: var(--green); background: #e6f6e9; width: 28px; height: 28px; border-radius: 8px; font-weight: 800; }
.proof-grid strong { display: block; margin-top: 15px; }
.proof-grid p { font-size: 13px; margin-top: 7px; }
.faq { padding-top: 95px; padding-bottom: 100px; }
.faq .section-head { margin-bottom: 26px; }
.faq details { background: white; border: 1px solid var(--line); border-radius: 10px; padding: 19px 23px; margin-bottom: 10px; }
.faq summary { font-weight: 750; cursor: pointer; }
.faq summary::marker { color: var(--green); }
.faq details p { color: var(--muted); font-size: 14px; margin: 13px 0 2px; }
footer { border-top: 1px solid var(--line); background: #edf4ec; padding: 28px; }
.footer-inner { max-width: 1170px; margin: auto; display: flex; justify-content: space-between; align-items: center; gap: 25px; }
.footer-inner p { font-size: 12px; color: var(--muted); }
.footer-inner > div { display: flex; gap: 18px; }
.footer-inner > div a { text-decoration: none; font-size: 13px; font-weight: 700; }
.toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 19px; background: #153d32; color: white; z-index: 40; border-radius: 9px; font-size: 13px; box-shadow: 0 12px 30px rgba(0,0,0,.16); opacity: 0; transform: translateY(15px); pointer-events: none; transition: opacity .2s, transform .2s; }
.toast.active { opacity: 1; transform: translateY(0); }
@media (max-width: 980px) {
  .nav nav { display: none; } .nav-inner { justify-content: space-between; }
  .hero-inner { grid-template-columns: 1fr; padding: 68px 28px 100px; }
  .hero-diagram { max-width: 600px; width: 100%; margin: auto; }
  .principles { grid-template-columns: 1fr; max-width: 730px; }
  .step { grid-template-columns: 48px 1fr; gap: 10px; }
  .step-num { width: 40px; height: 40px; }
}
@media (max-width: 620px) {
  .onboarding-diagram { padding: 16px; }
  .simple-office { padding: 11px; }
  .simple-platform { font-size: 11px; }
  .simple-person { padding: 8px; min-width: 125px; gap: 7px; }
  .simple-person strong { font-size: 13px; }
  .simple-person small { font-size: 9px; }
  .simple-person .avatar { width: 28px; height: 28px; font-size: 12px; }

  .office-row { grid-template-columns: 1fr 1fr; gap: 8px; }
  .office-card { padding: 10px; }
  .office-label { font-size: 10px; }
  .office-exchange { padding: 8px; font-size: 12px; }
  .office-worker { padding: 7px; gap: 5px; }
  .office-worker .avatar { width: 25px; height: 25px; font-size: 11px; }
  .office-worker strong { font-size: 12px; }
  .office-worker small { font-size: 9px; }
  .intro { padding-top: 57px; }

  .nav-inner { padding: 10px 17px; } .nav-skill { padding: 8px 12px; }
  .hero-inner { padding: 55px 20px 95px; gap: 34px; }
  .hero-lead { font-size: 15px; }
  .hero-diagram { padding: 18px; }
  .principles { padding: 0 18px; }
  .section-shell { padding: 62px 15px 10px; }
  .progress > span:last-child { display: none; }
  .step { grid-template-columns: 1fr; gap: 8px; }
  .step-num { position: static; width: 36px; height: 36px; border-radius: 10px; font-size: 13px; }
  .step-body { padding: 19px 16px; }
  .step-title { flex-direction: column; gap: 6px; }
  .done { align-self: flex-start; }
  .agent-grid, .address-grid, .platform-notes, .proof-grid { grid-template-columns: 1fr; }
  .resource-pair { align-items: flex-start; flex-direction: column; }
  .copy { flex-shrink: 0; }
  .finish { margin: 35px 15px 0; padding: 26px 19px; grid-template-columns: 1fr; }
  .finish-icon { width: 42px; height: 42px; }
  .finish .proof-grid { grid-column: auto; }
  .footer-inner { flex-direction: column; align-items: flex-start; gap: 8px; }
  .faq { padding-bottom: 65px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .toast, #progressFill { transition: none; }
}
`;
