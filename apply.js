#!/usr/bin/env node
/* ===================================================================
   apply.js — 新しい会合の教材を index.html に追記する
   使い方:  node apply.js add.json
   add.json の形:
   {
     "course": { id, cat, date, icon, group, title, titleJa, source,
                 summaryJa, words:[...10], phrases:[...5], dialogues:[...2] },
     "altex":  { "言い換え語": [["英文","和訳"],["英文","和訳"]], ... },
     "wordex": { "見出し語":   [["英文","和訳"],["英文","和訳"]], ... },
     "note":   "画面上部に出す一文（任意）"
   }
   =================================================================== */
"use strict";
const fs = require("fs");

const payloadPath = process.argv[2] || "add.json";
const target = process.argv[3] || "index.html";

function die(msg) { console.error("ERROR: " + msg); process.exit(1); }

let d;
try { d = JSON.parse(fs.readFileSync(payloadPath, "utf8")); }
catch (e) { die("add.json を読めません: " + e.message); }

let h;
try { h = fs.readFileSync(target, "utf8"); }
catch (e) { die("index.html を読めません: " + e.message); }

const before = h.length;

function insertBefore(marker, text) {
  const i = h.indexOf(marker);
  if (i < 0) die("目印が見つかりません: " + marker);
  h = h.slice(0, i) + text + "\n" + h.slice(i);
}

/* ---------- 1. コースを追記 ---------- */
if (d.course) {
  const c = d.course;
  ["id","cat","date","title","titleJa","source","summaryJa","words","phrases","dialogues"]
    .forEach(k => { if (c[k] === undefined) die("course." + k + " がありません"); });
  if (["ip","mech","syn","ops","etc"].indexOf(c.cat) < 0)
    die("course.cat が不正です: " + c.cat);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date))
    die("course.date は YYYY-MM-DD 形式にしてください: " + c.date);
  if (h.indexOf('id:"' + c.id + '"') >= 0 || h.indexOf('"id":"' + c.id + '"') >= 0)
    die("同じ id のコースがすでにあります: " + c.id);

  c.words.forEach(w => {
    ["en","ipa","ja","tag","note","alts","ex"].forEach(k => {
      if (w[k] === undefined) die("単語 " + w.en + " に " + k + " がありません");
    });
  });
  c.phrases.forEach(w => {
    ["en","ipa","ja","tag","literal","note","alts","ex"].forEach(k => {
      if (w[k] === undefined) die("熟語 " + w.en + " に " + k + " がありません");
    });
  });
  c.dialogues.forEach(dl => {
    if (!dl.turns || !dl.turns.length) die("会話 " + dl.title + " に turns がありません");
    dl.turns.forEach(t => {
      if (!t.en || !t.ja || !t.name || !t.nameJa || (t.side !== "l" && t.side !== "r"))
        die("会話 " + dl.title + " の発言が不完全です");
    });
  });

  insertBefore("/* @@COURSES_END@@ */", ",\n" + JSON.stringify(c));
  console.log("追加: コース " + c.id + "（単語" + c.words.length +
              "・熟語" + c.phrases.length + "・会話" + c.dialogues.length + "本）");
}

/* ---------- 2. 言い換え語の文例を追記 ---------- */
function appendMap(obj, marker, label) {
  if (!obj) return 0;
  const keys = Object.keys(obj).filter(k => h.indexOf('"' + k + '":[[') < 0);
  if (!keys.length) return 0;
  const body = keys.map(k => "," + JSON.stringify(k) + ":" + JSON.stringify(obj[k])).join("\n");
  insertBefore(marker, body);
  console.log("追加: " + label + " " + keys.length + "語");
  return keys.length;
}
appendMap(d.altex,  "/* @@ALTEX_END@@ */",  "言い換え文例");
appendMap(d.wordex, "/* @@WORDEX_END@@ */", "見出し語文例");

/* ---------- 3. 画面上部の一文を差し替え ---------- */
if (d.note) {
  h = h.replace(/^window\.LESSON\.note=[^\n]*\n/gm, "");
  insertBefore("/* @@NOTE_OVERRIDE@@ */", "window.LESSON.note=" + JSON.stringify(d.note) + ";");
  console.log("更新: 画面上部の案内文");
}

/* ---------- 4. 検証してから書き出す ---------- */
const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => {
  try { new Function(s); }
  catch (e) { die("スクリプト " + i + " の構文が壊れました: " + e.message); }
});

const sandbox = { window: {} };
try {
  new Function("window", scripts[0])(sandbox.window);
  new Function("window", scripts[1])(sandbox.window);
  new Function("window", scripts[2])(sandbox.window);
} catch (e) { die("教材データの読み込みに失敗しました: " + e.message); }

const L = sandbox.window.LESSON;
if (!L || !L.courses || !L.courses.length) die("LESSON.courses が空です");
const ids = L.courses.map(c => c.id);
if (new Set(ids).size !== ids.length) die("コースIDが重複しています");
L.courses.forEach(c => {
  if (!c.cat || !c.date) die("コース " + c.id + " に cat/date がありません");
});

fs.writeFileSync(target, h);

const cnt = {};
L.courses.forEach(c => { cnt[c.cat] = (cnt[c.cat] || 0) + 1; });
console.log("---");
console.log("検証OK  総コース数: " + L.courses.length +
            "（" + Object.keys(cnt).map(k => k + ":" + cnt[k]).join(" ") + "）");
console.log("単語 " + L.courses.reduce((s,c)=>s+c.words.length,0) +
            " / 熟語 " + L.courses.reduce((s,c)=>s+c.phrases.length,0) +
            " / 会話 " + L.courses.reduce((s,c)=>s+c.dialogues.length,0) + "本");
console.log("言い換え文例 " + Object.keys(sandbox.window.ALTEX || {}).length +
            "語 / 見出し語文例 " + Object.keys(sandbox.window.WORDEX || {}).length + "語");
console.log("index.html " + before + " → " + h.length + " 文字");
