/*
Personalized Study Platform
Single-file preview (React) + README, backend API spec, DB schema, and deployment notes.

Contents in this document:
1) Project summary & goals
2) Tech stack
3) Architecture diagram (text)
4) Features list
5) Frontend: single-file React App (App.jsx) using Tailwind — handles file uploads, preview, simple client-side parsing, quiz UI, analytics dashboard, and calls backend APIs for heavy work.
6) Backend: Node/Express sample (server.js) with endpoints for: upload processing, generate-assessment, submit-answers, analytics, recommendations. Also includes suggested AI microservice design.
7) DB Schema (Postgres) + sample SQL
8) Data processing pipelines (doc parsing, question generation, embeddings storage)
9) Progress analytics & sample queries
10) Deployment notes & security

----- 1) Project summary -----
This platform lets students upload documents (PDF, DOCX, TXT, PPTX) or link course resources. The backend processes documents -> extracts text and structure -> generates assessments (MCQs, short answers), stores question metadata and embeddings, and tracks user interactions to compute analytics and produce AI-driven study recommendations.

----- 2) Tech stack -----
Frontend: React (single file preview), Tailwind CSS, fetch API, file-saver for exports
Backend: Node.js + Express; Python microservice (optional) for LLM-based question generation and embeddings
Database: PostgreSQL (for relational data) + Redis (caching, session) + vector DB or Postgres with pgvector extension for embeddings
Storage: S3-compatible object storage for uploaded files
Authentication: JWT + refresh tokens (or OAuth)

----- 3) Architecture (text) -----
[User Browser]
  |--React UI (uploads, quiz, dashboard)
  |---> REST APIs
[Backend - Node/Express]
  |--File storage (S3)
  |--Task queue (BullMQ / Redis)
  |--Worker(s): parsing (python or node), QA generation (LLM), embedding compute
  |--Postgres (user, courses, progress, questions) + vector index
  |--AI microservice (Python/Flask) invoking LLMs/Embeddings

----- 4) Features -----
- Document ingestion: PDF/DOCX/TXT/PPTX
- Auto-structure detection: headings -> topics
- Assessment generator: MCQs, fill-in, short answer, coding questions (where applicable)
- Quiz player with timer, scoring, feedback
- Analytics dashboard: mastery by topic, time-on-task, retention curve, forgetting curve hints
- Recommendations: what to study next, spaced repetition schedule, targeted practice
- Export reports (PDF) and shareable links

----- 5) Frontend: single-file React app (App.jsx) -----
Note: This file is a simplified single-file React app for preview and local prototyping. In production split into components and use routing.
*/

import React, {useState, useEffect, useRef} from 'react';

export default function App(){
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const [quizzes, setQuizzes] = useState([]);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const fileRef = useRef();

  // helper: upload file to backend
  async function handleUpload(e){
    const f = e.target.files[0];
    if(!f) return;
    setStatus('uploading');
    const fd = new FormData();
    fd.append('file', f);
    try{
      const res = await fetch('/api/upload', {method:'POST', body:fd});
      if(!res.ok) throw new Error('upload failed');
      const json = await res.json();
      // json: {docId, message}
      setFiles(prev=>[...prev, {name:f.name, id: json.docId}]);
      setStatus('uploaded');
    }catch(err){
      console.error(err); setStatus('error');
    }
  }

  async function requestAssessment(docId){
    setStatus('generating');
    try{
      const res = await fetch('/api/generate-assessment', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({docId, types:['mcq','short']})});
      const json = await res.json();
      // json: {assessmentId}
      // fetch assessment
      const as = await fetch(`/api/assessment/${json.assessmentId}`);
      const ajson = await as.json();
      setQuizzes(prev=>[ajson, ...prev]);
      setStatus('ready');
    }catch(err){console.error(err); setStatus('error');}
  }

  async function startQuiz(assessment){
    setCurrentQuiz({assessment, answers:{}, idx:0, startedAt: Date.now()});
  }

  function answerCurrent(qId, value){
    setCurrentQuiz(prev=>({...prev, answers: {...prev.answers, [qId]: value}}));
  }

  async function submitQuiz(){
    const payload = {assessmentId: currentQuiz.assessment.id, answers: currentQuiz.answers, tookMs: Date.now()-currentQuiz.startedAt};
    const res = await fetch('/api/submit-answers', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    const json = await res.json();
    // update analytics
    fetchAnalytics();
    setCurrentQuiz(null);
    alert('Quiz submitted — score: ' + json.score);
  }

  async function fetchAnalytics(){
    const res = await fetch('/api/analytics');
    const json = await res.json();
    setAnalytics(json);
  }

  async function fetchRecommendations(){
    const res = await fetch('/api/recommendations');
    const json = await res.json();
    setRecommendations(json.recs || []);
  }

  useEffect(()=>{ fetchAnalytics(); fetchRecommendations(); }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Personalized Study Platform — Prototype</h1>

        <section className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Upload documents</h2>
          <input ref={fileRef} type="file" onChange={handleUpload} />
          <div className="mt-2">Status: {status}</div>
          <div className="mt-4">
            {files.map(f=> (
              <div key={f.id} className="flex items-center justify-between py-1">
                <div>{f.name}</div>
                <div>
                  <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={()=>requestAssessment(f.id)}>Generate assessment</button>
                </div>
              </div>
            ))}
            {!files.length && <div className="text-sm text-gray-500 mt-2">No files uploaded yet.</div>}
          </div>
        </section>

        <section className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Quizzes</h2>
          {quizzes.length===0 && <div className="text-sm text-gray-500">No quizzes yet — generate one from an uploaded document.</div>}
          {quizzes.map(q=> (
            <div key={q.id} className="border p-3 rounded my-2">
              <div className="flex justify-between items-center">
                <div><strong>{q.title || 'Assessment'}</strong> — {q.questions.length} Qs</div>
                <div>
                  <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>startQuiz(q)}>Start</button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Analytics</h2>
          {analytics ? (
            <div>
              <div>Overall score average: {analytics.avgScore}</div>
              <div>Time on platform (min): {analytics.totalMinutes}</div>
              <div>Weak topics: {analytics.weakTopics && analytics.weakTopics.join(', ')}</div>
            </div>
          ) : (<div>Loading...</div>)}
        </section>

        <section className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Recommendations</h2>
          {recommendations.length===0 ? <div className="text-sm text-gray-500">No recommendations yet.</div> : (
            <ul>
              {recommendations.map((r,i)=>(<li key={i} className="py-1">{r}</li>))}
            </ul>
          )}
        </section>

        {/* Quiz modal simplified */}
        {currentQuiz && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg w-11/12 max-w-2xl">
              <h3 className="text-lg font-bold">Quiz — {currentQuiz.assessment.title || 'Assessment'}</h3>
              <div className="mt-4">
                {currentQuiz.assessment.questions.map((q, idx)=> (
                  <div key={q.id} className="mb-4">
                    <div className="font-medium">{idx+1}. {q.prompt}</div>
                    {q.type==='mcq' && q.options.map(opt=> (
                      <div key={opt} className="mt-1">
                        <label className="inline-flex items-center"><input type="radio" name={q.id} onChange={()=>answerCurrent(q.id,opt)} /> <span className="ml-2">{opt}</span></label>
                      </div>
                    ))}
                    {q.type==='short' && (
                      <textarea className="w-full border p-2 mt-2" rows={3} onChange={(e)=>answerCurrent(q.id,e.target.value)} />
                    )}
                  </div>
                ))}
                <div className="flex justify-end gap-2">
                  <button className="px-4 py-2 bg-gray-300 rounded" onClick={()=>setCurrentQuiz(null)}>Cancel</button>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={submitQuiz}>Submit</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/*
----- 6) Backend sample: Node/Express (server.js) -----
Below is a condensed server sketch — put in server.js and adapt. It shows endpoints and outlines expected behavior.

// server.js (sketch)
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const upload = multer({ dest: 'uploads/' });
const app = express();
app.use(bodyParser.json());

// POST /api/upload -> store file to S3, create doc entry, kick off parsing job
app.post('/api/upload', upload.single('file'), async (req,res)=>{
  const file = req.file;
  const docId = uuidv4();
  // TODO: upload to S3, create DB row
  // enqueue job: parse -> extract headings & text -> call AI to generate Qs
  res.json({docId, message: 'uploaded'});
});

// POST /api/generate-assessment {docId, types}
app.post('/api/generate-assessment', async (req,res)=>{
  const {docId, types} = req.body;
  // create assessment task and return id
  const assessmentId = uuidv4();
  // enqueue job for worker to generate questions and store them
  res.json({assessmentId});
});

// GET /api/assessment/:id -> return assessment object
app.get('/api/assessment/:id', async (req,res)=>{
  // fetch from DB
  res.json({id:req.params.id, title:'Sample', questions:[]});
});

// POST /api/submit-answers -> store attempt, grade auto if possible
app.post('/api/submit-answers', async (req,res)=>{
  const {assessmentId, answers, tookMs} = req.body;
  // grade MCQs automatically, short answers may be graded via LLM or rubric
  const score = 85; // example
  // store attempt and update user-topic proficiency
  res.json({ok:true, score});
});

// GET /api/analytics
app.get('/api/analytics', async (req,res)=>{
  res.json({avgScore:78, totalMinutes:124, weakTopics:['Recursion','Parsing']});
});

// GET /api/recommendations
app.get('/api/recommendations', async (req,res)=>{
  res.json({recs:['Review: Recursion — 20 mins','Practice: MCQs on Parsing (10 Qs)']});
});

app.listen(3000, ()=>console.log('Server listening'));

----- 7) DB Schema (Postgres) -----
Users(user_id PK, name, email, hashed_password, created_at)
Docs(doc_id PK, user_id FK, filename, s3_key, extracted_text, created_at)
Topics(topic_id PK, doc_id FK, title, start_pos, end_pos)
Assessments(assessment_id PK, doc_id FK, title, created_at)
Questions(question_id PK, assessment_id FK, prompt, type, options jsonb, correct_answer jsonb, metadata jsonb)
Attempts(attempt_id PK, user_id FK, assessment_id FK, answers jsonb, score numeric, started_at, finished_at)
UserTopicProficiency(user_id FK, topic_id FK, last_seen, proficiency numeric, forget_factor numeric)

Indexes: create vector index on question embeddings (pgvector) to support similarity search.

----- 8) Data processing pipelines -----
1. Ingest: accept file -> store -> spawn parse job.
2. Parse job: extract text + metadata. Use pdfminer/pdfplumber for PDFs, python-docx for DOCX, python-pptx for PPTX.
3. Structure detection: run simple heuristics (font size, headings) or use LLM to detect sections.
4. Question generation: call LLM with prompt to generate MCQs and short answers, include answer and distractors, and map questions to topics.
   Prompt design: include section text + desired difficulty + number of questions.
5. Embeddings: compute embeddings for each question and topic (use OpenAI embeddings or local models); store in vector DB.
6. Recommendation engine: combine proficiency, time-since-last, question difficulty, and spaced repetition algorithm (SM-2 variant) to surface next items.

----- 9) Progress analytics & sample queries -----
Metrics:
- Accuracy per topic: correct / total
- Time per question
- Mastery score: exponentially weighted moving average of recent attempts
- Retention estimate: apply forgetting curve using last review time

Sample SQL: mastery per topic

-- accuracy per topic
SELECT t.title, SUM(CASE WHEN a.answers->>q.id = q.correct_answer THEN 1 ELSE 0 END)::float / COUNT(*) as accuracy
FROM attempts at
JOIN assessments ass on at.assessment_id = ass.assessment_id
JOIN questions q on q.assessment_id = ass.assessment_id
JOIN topics t on q.metadata->>'topic_id' = t.topic_id::text
GROUP BY t.title;

----- 10) Recommendations logic (pseudocode) -----
For each user:
  for each topic:
    compute mastery = proficiency score
    compute recall_prob = exp(-time_since_last_review / topic_decay)
    compute priority = (1 - mastery) * (1 - recall_prob) * topic_weight
  rank topics by priority
  suggest top-k: mix of review (high priority) + new items (low difficulty)

Use SM-2 for scheduling: interval calculation based on quality of recall.

----- Security & Privacy -----
- Encrypt files at rest, use signed S3 URLs for uploads
- Authenticate endpoints with JWT; validate file types and size limits
- Rate-limit AI endpoints and throttle
- For student data export, allow GDPR/Right-to-be-forgotten flows

----- Deployment notes -----
- Containerize backend + worker + python microservice
- Use managed Postgres and Redis
- Use autoscaling for workers (based on queue length)
- Store secrets in vault

----- Next steps & MVP roadmap -----
MVP (4–6 weeks):
- File upload & parsing (PDF/DOCX/TXT)
- Basic MCQ generation via simple prompt + manual QA
- Quiz player + submission + simple analytics
- Recommendation engine — simple rule based

Phase 2:
- Add embeddings + semantic search
- Add spaced repetition scheduler (SM-2)
- Improve UI/UX, shareable reports, PDF export


----- How to use this repo preview -----
1) Copy frontend React file into a Create React App or Vite + React project.
2) Implement server endpoints (server.js sketch) and run locally.
3) Add worker and LLM microservice when ready.

If you'd like, I can:
- Split this prototype into multiple frontend components and a complete repo structure.
- Generate full backend code with worker and LLM integration (choose provider: OpenAI / local LLM).
- Produce deployment scripts (Dockerfiles, docker-compose, k8s manifests).

*/
