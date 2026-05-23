let currentYearIdx = 0;
let selectedSections = new Set();
let quizQuestions = [];
let userAnswers = [];
let reviewMode = false;

let currentPage = 0;
let questionsPerPage = 1;

function init() {
    buildYearSelector();
    selectYear(0);
}

function buildYearSelector() {
    const container = document.getElementById('yearSelector');
    container.innerHTML = allData.map((d, i) => `
    <button class="year-btn ${i === currentYearIdx ? 'active' : ''}" onclick="selectYear(${i})" id="yb${i}">
        ${d.label}
    </button>
    `).join('');
}

function selectYear(index) {
    currentYearIdx = index;
    selectedSections.clear();

    document.querySelectorAll('.year-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    buildSectionGrid();
    updateStartButton();
}

function buildSectionGrid() {
    const sections = allData[currentYearIdx].sections;
    const grid = document.getElementById('sectionGrid');
    grid.innerHTML = sections.map((s, i) => `
        <div class="section-card ${selectedSections.has(i) ? 'selected' : ''}" onclick="toggleSection(${i})" id="sc${i}">
        <div class="section-num">Section ${s.id}</div>
        <div class="section-title">${s.title}</div>
        <div class="section-desc">${s.desc.substring(0, 60)}...</div>
        <div class="section-count">${s.questions.length} Questions</div>
        </div>
    `).join('');
}

function toggleSection(i) {
    if (selectedSections.has(i)) {
        selectedSections.delete(i);
    } else {
        selectedSections.add(i);
    }
    document.getElementById(`sc${i}`).classList.toggle('selected');
    updateStartButton(); 
}

function updateStartButton() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = selectedSections.size === 0;
    }
}

function startQuiz() {
    if (selectedSections.size === 0) return; // Failsafe

    quizQuestions = [];
    const sections = allData[currentYearIdx].sections;
    const sortedSections = Array.from(selectedSections).sort((a, b) => a - b);

    sortedSections.forEach(si => {
        const s = sections[si];
        s.questions.forEach(q => {
            quizQuestions.push({ ...q, sectionId: s.id, sectionTitle: s.title, type: s.type || 'mc', sectionIdx: si });
        });
    });

    currentPage = 0;
    userAnswers = new Array(quizQuestions.length).fill(null);
    reviewMode = false;

    document.getElementById('qpp').value = "1";
    questionsPerPage = 1;

    showScreen('quiz');
    renderPage();
}

function changeQPP(val) {
    questionsPerPage = val === 'all' ? quizQuestions.length : parseInt(val, 10);
    currentPage = 0;
    renderPage();
    window.scrollTo(0, 0);
}

function updateStartButton() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = selectedSections.size === 0;
    }
}

function renderPage() {
    const totalQuestions = quizQuestions.length;
    const totalPages = Math.ceil(totalQuestions / questionsPerPage);

    const startIndex = currentPage * questionsPerPage;
    const endIndex = Math.min(startIndex + questionsPerPage, totalQuestions);

    const pct = ((currentPage + 1) / totalPages * 100).toFixed(1);

    document.getElementById('sectionLabel').textContent = `Questions ${startIndex + 1} – ${endIndex} of ${totalQuestions}`;
    document.getElementById('progressText').textContent = `Page ${currentPage + 1} / ${totalPages}`;
    document.getElementById('progressFill').style.width = pct + '%';

    document.getElementById('prevBtn').disabled = currentPage === 0;

    const isLastPage = currentPage === totalPages - 1;
    document.getElementById('nextBtn').textContent = isLastPage ? 'Finish Exam' : 'Next Page';

    let html = '';
    let cardIndex = 0;

    for (let i = startIndex; i < endIndex; i++) {
        const q = quizQuestions[i];
        const answered = userAnswers[i] !== null;
        const locked = answered || reviewMode;
        const delay = (cardIndex * 0.08).toFixed(2);
        cardIndex++;

        html += `<div class="question-card" id="q-card-${i}" style="animation-delay: ${delay}s">
            <div class="q-label">Question ${i + 1} <span class="q-section-tag">Section ${q.sectionId}</span></div>`;

        if (q.type === 'error') {
            html += buildErrorQuestion(q, i, locked);
        } else {
            html += buildMCQuestion(q, i, locked);
        }

        if (locked) {
            const correct = userAnswers[i] === q.a;
            html += `<div class="feedback ${correct ? 'correct-fb' : 'wrong-fb'} show">
                ${correct ? '<strong>✓ Correct!</strong> Well done.' : `<strong>✗ Incorrect.</strong> The correct answer is <strong>${String.fromCharCode(65 + q.a)}</strong>${q.explain ? ' — ' + q.explain : ''}.`}
            </div>`;
        }

        html += `</div>`;
    }

    document.getElementById('questionArea').innerHTML = html;
}

function goToQuestion(globalIndex) {
    currentPage = Math.floor(globalIndex / questionsPerPage);
    renderPage();

    setTimeout(() => {
        const el = document.getElementById(`q-card-${globalIndex}`);
        if (el) {
            const y = el.getBoundingClientRect().top + window.pageYOffset - 200;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, 50);
}

function buildMCQuestion(q, globalIndex, locked) {
    const letters = ['A', 'B', 'C', 'D'];
    let html = `<div class="q-text">${q.q}</div>`;
    if (q.context) html += `<div class="q-passage">${q.context}</div>`;

    html += `<div class="options">`;

    q.opts.forEach((opt, i) => {
        let cls = '';
        if (locked) {
            if (i === q.a) cls = 'correct';
            else if (i === userAnswers[globalIndex]) cls = 'wrong';
            else if (userAnswers[globalIndex] === i) cls = 'selected';
        } else if (userAnswers[globalIndex] === i) cls = 'selected';

        html += `<div class="opt ${cls} ${locked ? 'locked' : ''}" onclick="selectAnswer(${globalIndex}, ${i})">
        <div class="opt-letter">${letters[i]}</div>
        <span>${opt}</span>
    </div>`;
    });
    html += `</div>`;
    return html;
}

function buildErrorQuestion(q, globalIndex, locked) {
    let html = `<div class="q-text">One underlined part is grammatically incorrect. Choose the incorrect part.</div>
    <div class="q-passage">${q.passage}</div>
    <div class="part-opts">`;
    q.parts.forEach((p, i) => {
        let cls = '';
        if (locked) {
            if (i === q.a) cls = 'correct';
            else if (i === userAnswers[globalIndex]) cls = 'wrong';
            else if (userAnswers[globalIndex] === i) cls = 'selected';
        } else if (userAnswers[globalIndex] === i) cls = 'selected';

        html += `<div class="part-opt ${cls} ${locked ? 'locked' : ''}" onclick="selectAnswer(${globalIndex}, ${i})">
        <span class="part-label">${p.label}</span>${p.text}
    </div>`;
    });
    html += `</div>`;
    return html;
}

function selectAnswer(globalIndex, optIndex) {
    if (userAnswers[globalIndex] !== null && !reviewMode) return;
    if (reviewMode) return;
    userAnswers[globalIndex] = optIndex;

    renderPage();

    if (questionsPerPage > 1 && globalIndex < quizQuestions.length - 1) {
        setTimeout(() => {
            const nextEl = document.getElementById(`q-card-${globalIndex + 1}`);
            if (nextEl) {
                const y = nextEl.getBoundingClientRect().top + window.pageYOffset - 200;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 400);
    }
}

function nextQ() {
    const totalPages = Math.ceil(quizQuestions.length / questionsPerPage);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderPage();
        window.scrollTo(0, 0);
    } else {
        showResults();
    }
}

function prevQ() {
    if (currentPage > 0) {
        currentPage--;
        renderPage();
        window.scrollTo(0, 0);
    }
}

function goHome() {
    showScreen('home');
}

function showResults() {
    const answered = userAnswers.filter(a => a !== null).length;
    const correct = userAnswers.filter((a, i) => a === quizQuestions[i].a).length;
    const wrong = answered - correct;
    const pct = Math.round(correct / quizQuestions.length * 100) || 0;

    document.getElementById('scoreRing').style.setProperty('--pct', pct + '%');
    document.getElementById('scorePct').textContent = pct;
    document.getElementById('statCorrect').textContent = correct;
    document.getElementById('statWrong').textContent = wrong;
    document.getElementById('statTotal').textContent = quizQuestions.length;

    let title, sub;
    if (pct >= 90) { title = 'Outstanding! 🎉'; sub = 'MEXT-ready! Excellent performance.'; }
    else if (pct >= 75) { title = 'Well Done! 👍'; sub = 'Strong performance. Keep refining.'; }
    else if (pct >= 60) { title = 'Good Effort'; sub = 'Review your mistakes and try again.'; }
    else { title = 'Keep Practicing'; sub = 'Study the explanations and retake the quiz.'; }

    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSub').textContent = sub;

    showScreen('results');
}

function reviewAnswers() {
    reviewMode = true;
    currentPage = 0;
    showScreen('quiz');
    renderPage();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

window.onload = init;