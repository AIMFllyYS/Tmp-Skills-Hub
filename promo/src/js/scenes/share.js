// b68–76 享：左半推到社团仓库并分发链接；甩镜到右半，Agent 帮你启用 skill。
import { T } from "../theme.js";
import { TEAM } from "../data.js";
import { E, css, el, hit, kf, prog, revealChars, split, svg, toggle } from "../engine.js";
import { icon } from "../ui.js";
import { caption, chapter, updateCaption, updateChapter } from "./chapter.js";

let s;
const USER_MSG = "帮我找一个做 PPT 的 skill，启用到 Codex 和 Cursor。";

export default {
  id: "share",
  start: 68,
  end: 76,
  mount(root) {
    s = {};
    s.track = el("div", "abs", root);
    s.track.style.cssText = "left:0;top:0;width:3840px;height:1080px;";

    // 左半：分享
    const L = el("div", "abs", s.track);
    L.style.cssText = "left:0;top:0;width:1920px;height:1080px;";
    s.dialog = el("div", "abs sh-dialog", L);
    s.dialog.style.cssText += "left:150px;top:250px;transform-origin:0 0;";
    el("h3", "", s.dialog, "分享到社团仓库");
    el("p", "", s.dialog, "授信成员直接写入，别人用链接从统一的地方拿。");
    el("div", "sh-field", s.dialog, `<span class="sh-field-label">仓库</span>${icon("git").replace("<svg", "<svg width='16' height='16' stroke='currentColor' fill='none' stroke-width='2'")}github.com/club/skills`);
    el("div", "sh-field", s.dialog, "<span class='sh-field-label'>Skill</span>frontend-design <span class='sh-chip is-volt' style='margin-left:auto'>anthropics/skills</span>");
    el("div", "sh-field", s.dialog, "<span class='sh-field-label'>分支</span>main");
    const actions = el("div", "", s.dialog);
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:18px;";
    el("div", "sh-btn", actions, "取消");
    s.push = el("div", "sh-btn is-primary", actions, `${icon("link")}推送并复制链接`);
    s.toast = el("div", "abs sh-toast", L, `<span class="volt">✓</span> 链接已复制 <code>skills-hub add club/skills/frontend-design</code>`);
    s.toast.style.cssText += "left:150px;top:820px;transform-origin:0 0;";

    s.lines = svg("svg", { width: 1920, height: 1080, style: "position:absolute;inset:0;overflow:visible" }, L);
    s.repo = el("div", "node", L, `${icon("git").replace("<svg", "<svg width='22' height='22' stroke='var(--sh-volt)' fill='none' stroke-width='2'")}<div><div class="n-name">club/skills</div><div class="n-path">社团共享仓库 · 零服务器</div></div>`);
    s.repo.style.left = "1180px";
    s.repo.style.top = "540px";
    s.repoLine = svg("path", { d: "M 960 540 C 1000 540, 1030 540, 1070 540", stroke: `rgba(${T.accentRGB},.9)`, "stroke-width": 2, fill: "none", "stroke-dasharray": 120, "stroke-dashoffset": 120 }, s.lines);
    s.members = TEAM.concat([{ handle: "@nagi", color: "#ff6f91" }]).map((m, i) => {
      const y = 300 + i * 120;
      const x = 1640;
      const p = svg("path", { d: `M 1300 540 C 1450 540, 1480 ${y}, ${x - 40} ${y}`, stroke: `rgba(${T.accentRGB},.7)`, "stroke-width": 1.6, fill: "none", "stroke-dasharray": 520, "stroke-dashoffset": 520 }, s.lines);
      const n = el("div", "abs", L);
      n.style.cssText = `left:${x - 30}px;top:${y - 30}px;display:flex;align-items:center;gap:14px;white-space:nowrap;`;
      el("div", "sh-avatar", n, m.handle[1].toUpperCase()).style.cssText = `width:60px;height:60px;font-size:22px;background:${m.color}`;
      el("div", "", n, `<div style="font-family:var(--sh-mono);font-size:16px">${m.handle}</div><div class="dim" style="font-size:13px;margin-top:4px">已拉取 · frontend-design</div>`);
      return { p, n, at: 70.6 + i * 0.18 };
    });

    // 右半：Agent
    const R = el("div", "abs", s.track);
    R.style.cssText = "left:1920px;top:0;width:1920px;height:1080px;";
    s.chat = el("div", "abs sh-chat", R);
    s.chat.style.cssText += "left:620px;top:150px;transform-origin:50% 0;";
    el("div", "sh-chat-head", s.chat, `${icon("agent").replace("<svg", "<svg width='18' height='18' stroke='var(--sh-volt)' fill='none' stroke-width='1.8'")}Agent · 库存管家<span class="sh-chip">写操作 · 先批准</span>`);
    s.user = el("div", "sh-msg is-user", s.chat);
    s.userChars = split(s.user, USER_MSG);
    s.agent = el("div", "sh-msg is-agent", s.chat, "找到 <code>pptx</code>（anthropics/skills），库存里已有，还没链到 Codex 和 Cursor。");
    s.tool = el("div", "sh-tool", s.chat);
    s.toolStatus = el("span", "sh-chip", null, "待批准");
    const top = el("div", "sh-tool-top", s.tool, `${icon("link").replace("<svg", "<svg width='16' height='16' stroke='currentColor' fill='none' stroke-width='2'")}enable_links`);
    top.appendChild(s.toolStatus);
    el("div", "sh-tool-args", s.tool, `{ skill: "pptx", apps: ["codex", "cursor"] }`);
    s.toolActions = el("div", "sh-tool-actions", s.tool);
    s.approve = el("div", "sh-btn is-primary", s.toolActions, "批准");
    el("div", "sh-btn", s.toolActions, "拒绝");
    s.final = el("div", "sh-msg is-agent", s.chat, "<span class='volt'>✓</span> 已启用到 Codex、Cursor。新开对话即可使用。");
    el("div", "sh-input", s.chat, "问问你的库存…");

    s.ch = chapter(root, "04", "享", "SHARE");
    s.capL = caption(root, "授信成员直接写 · 链接分发 · 零服务器", "SHARE THROUGH ONE TRUSTED REPO");
    s.capR = caption(root, "Agent 帮你管库存，写操作先批准。", "AN AGENT FOR YOUR INVENTORY");
  },
  update(b) {
    updateChapter(s.ch, b, 68, 76);
    // 甩镜：b71.75–72.25
    const whip = prog(b, 71.7, 72.2, E.inOutExpo);
    const speed = Math.sin(Math.PI * whip);
    css(s.track, { transform: `translateX(${(-1920 * whip).toFixed(1)}px)`, filter: speed > 0.05 ? `blur(${(speed * 18).toFixed(1)}px)` : "none" });

    const d = prog(b, 68, 68.6, E.outExpo);
    css(s.dialog, { opacity: d.toFixed(3), transform: `translateY(${(40 * (1 - d)).toFixed(1)}px) scale(${(1.3 * (0.96 + 0.04 * d)).toFixed(3)})` });
    toggle(s.push, "is-pressed", b >= 69.6 && b < 69.85);
    const t = prog(b, 70, 70.4, E.outBack);
    css(s.toast, { opacity: t.toFixed(3), transform: `translateY(${(30 * (1 - t)).toFixed(1)}px) scale(1.25)` });
    s.repoLine.setAttribute("stroke-dashoffset", (120 * (1 - prog(b, 69.8, 70.3, E.outExpo))).toFixed(1));
    const rp = prog(b, 70.1, 70.5, E.outBack);
    css(s.repo, { opacity: rp.toFixed(3), transform: `translate(-50%,-50%) scale(${(0.8 + 0.2 * rp + 0.08 * hit(b, 70.3, 0.2)).toFixed(3)})` });
    toggle(s.repo, "is-lit", b >= 70.3);
    s.members.forEach((m) => {
      m.p.setAttribute("stroke-dashoffset", (520 * (1 - prog(b, m.at - 0.2, m.at + 0.2, E.outExpo))).toFixed(1));
      const a = prog(b, m.at, m.at + 0.35, E.outBack);
      css(m.n, { opacity: a.toFixed(3), transform: `translateX(${(30 * (1 - a)).toFixed(1)}px) scale(${(0.8 + 0.2 * a).toFixed(3)})` });
    });

    revealChars(s.userChars, b, 72.3, 0.022, 0.25);
    css(s.user, { opacity: prog(b, 72.25, 72.35).toFixed(2) });
    const ag = prog(b, 73.2, 73.6, E.outCubic);
    css(s.agent, { opacity: ag.toFixed(3), transform: `translateY(${(10 * (1 - ag)).toFixed(1)}px)`, clipPath: `inset(0 ${(100 * (1 - prog(b, 73.2, 73.9))).toFixed(1)}% 0 0)` });
    const tl = prog(b, 73.8, 74.2, E.outBack);
    css(s.tool, { opacity: tl.toFixed(3), transform: `translateY(${(16 * (1 - tl)).toFixed(1)}px)` });
    const approved = b >= 74.5;
    toggle(s.approve, "is-pressed", b >= 74.4 && b < 74.6);
    toggle(s.toolStatus, "is-volt", approved);
    const status = approved ? "✓ 已完成" : "待批准";
    if (s.toolStatus.textContent !== status) s.toolStatus.textContent = status;
    css(s.toolActions, { opacity: approved ? (1 - prog(b, 74.6, 74.9)).toFixed(2) : "1", height: approved && b > 74.9 ? "0px" : "36px", marginTop: approved && b > 74.9 ? "0px" : "12px", overflow: "hidden" });
    const fin = prog(b, 75, 75.4, E.outCubic);
    css(s.final, { opacity: fin.toFixed(3), transform: `translateY(${(10 * (1 - fin)).toFixed(1)}px)` });
    css(s.chat, { transform: `translateY(${kf(b, [[72, 40], [72.6, 0, E.outExpo], [76, -10]]).toFixed(1)}px) scale(1.32)` });

    updateCaption(s.capL, b, 68.6, 71.7);
    updateCaption(s.capR, b, 72.4, 76);
  },
};
