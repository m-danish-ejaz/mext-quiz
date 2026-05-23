let currentYearIdx = 0;
let selectedSections = new Set();
let quizQuestions = [];
let userAnswers = [];
let reviewMode = false;

let currentPage = 0;
let questionsPerPage = 1;

let timerInterval = null;
let remainingSeconds = 0;
let isTimerEnabled = false;
let timeLimitPerQuestion = 30;

let activeConfirmCallback = null;
let activeMaxVal = 0;

let scoreChartInstance = null;
let accuracyChartInstance = null;

const defaultFallbackData = [
    {
        id: "2024",
        label: "2024 Qualifying Exam",
        sections: [
            {
                id: "I",
                title: "Grammar & Usage",
                desc: "Choose the correct words or phrases to complete sentences.",
                questions: [
                    { q: "She ______ to school every day.", opts: ["go", "goes", "going", "gone"], a: 1, explain: "The third-person singular present tense requires 'goes'." },
                    { q: "By the time we arrived, the movie ______ already started.", opts: ["has", "had", "was", "is"], a: 1, explain: "The past perfect tense 'had started' is used to describe an action completed before another past action." }
                ]
            },
            {
                id: "II",
                title: "Error Identification",
                desc: "Locate the grammatically incorrect segment.",
                type: "error",
                questions: [
                    {
                        passage: "She (A) <span style='text-decoration:underline;'>don't</span> (B) <span style='text-decoration:underline;'>know</span> the (C) <span style='text-decoration:underline;'>answer</span> to this (D) <span style='text-decoration:underline;'>difficult</span> question.",
                        parts: [
                            { label: "A", text: "don't" },
                            { label: "B", text: "know" },
                            { label: "C", text: "answer" },
                            { label: "D", text: "difficult" }
                        ],
                        a: 0,
                        explain: "Third-person singular 'She' requires the negative contraction 'doesn't' instead of 'don't'."
                    }
                ]
            }
        ]
    }
];

// Ensure allData has a valid reference on runtime
let Data = typeof allData !== "undefined" && Array.isArray(allData) && allData.length > 0 ? allData : defaultFallbackData;
// IndexedDB Helper Layer
const DB_NAME = "MextPrepDB";
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("history")) {
                db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
            }
            if (!db.objectStoreNames.contains("quizState")) {
                db.createObjectStore("quizState", { keyPath: "key" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// Persist user admin configurations
async function saveSetting(key, value) {
    try {
        const db = await openDB();
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({ key, value });
        return tx.complete;
    } catch (err) {
        console.error("IndexedDB error saving settings:", err);
    }
}

// Retrieve settings
async function getSetting(key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction("settings", "readonly");
            const req = tx.objectStore("settings").get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.error("IndexedDB error retrieving settings:", err);
        return null;
    }
}

// Active session state handling (Preserves state on refresh)
async function saveQuizState() {
    if (quizQuestions.length === 0) return;
    try {
        const db = await openDB();
        const tx = db.transaction("quizState", "readwrite");
        const state = {
            key: "activeState",
            currentYearIdx,
            selectedSections: Array.from(selectedSections),
            quizQuestions,
            userAnswers,
            currentPage,
            questionsPerPage,
            reviewMode,
            remainingSeconds
        };
        tx.objectStore("quizState").put(state);
    } catch (err) {
        console.error("Error keeping quiz session:", err);
    }
}

async function clearQuizState() {
    try {
        const db = await openDB();
        const tx = db.transaction("quizState", "readwrite");
        tx.objectStore("quizState").delete("activeState");
    } catch (err) {
        console.error("Error clearing state store:", err);
    }
}

async function getSavedQuizState() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction("quizState", "readonly");
            const req = tx.objectStore("quizState").get("activeState");
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        return null;
    }
}

// Performance Dashboard persistence
async function logQuizAttempt(attemptData) {
    try {
        const db = await openDB();
        const tx = db.transaction("history", "readwrite");
        tx.objectStore("history").add(attemptData);
        return tx.complete;
    } catch (err) {
        console.error("Failed to log score session:", err);
    }
}

async function getHistoryData() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction("history", "readonly");
            const req = tx.objectStore("history").getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (err) {
        return [];
    }
}

async function clearAllHistoryData() {
    try {
        const db = await openDB();
        const tx = db.transaction("history", "readwrite");
        tx.objectStore("history").clear();
        tx.oncomplete = () => {
            renderDashboard();
        };
    } catch (err) {
        console.error("Failed to empty logs:", err);
    }
}

// Initial Launch Coordination
async function init() {
    // Load configuration updates from indexDB
    const timerEnabled = await getSetting("timerEnabled");
    const timeLimit = await getSetting("timeLimit");

    isTimerEnabled = timerEnabled !== null ? timerEnabled : false;
    timeLimitPerQuestion = timeLimit !== null ? parseInt(timeLimit, 10) : 30;

    // Sync settings DOM
    const timerToggle = document.getElementById("adminTimerToggle");
    const timeLimitInput = document.getElementById("adminTimeLimit");
    const timerGroup = document.getElementById("timerConfigGroup");

    if (timerToggle) timerToggle.checked = isTimerEnabled;
    if (timeLimitInput) timeLimitInput.value = timeLimitPerQuestion;
    if (timerGroup) timerGroup.style.display = isTimerEnabled ? "block" : "none";

    // Check for saved state (interrupted session)
    const savedState = await getSavedQuizState();
    if (savedState) {
        currentYearIdx = savedState.currentYearIdx;
        selectedSections = new Set(savedState.selectedSections);
        quizQuestions = savedState.quizQuestions;
        userAnswers = savedState.userAnswers;
        currentPage = savedState.currentPage;
        questionsPerPage = savedState.questionsPerPage;
        reviewMode = savedState.reviewMode;
        remainingSeconds = savedState.remainingSeconds;

        buildYearSelector();
        buildSectionGrid();
        updateStartButton();

        const qppDropdown = document.getElementById("qpp");
        if (qppDropdown) {
            qppDropdown.value = questionsPerPage === quizQuestions.length ? "all" : questionsPerPage.toString();
        }

        showScreen("quiz");
        renderPage();
        if (isTimerEnabled && !reviewMode) {
            startCountdownTimer(true);
        }
    } else {
        buildYearSelector();
        selectYear(0);
    }

    renderDashboard();
}

// Screen management helper
function switchScreen(screenId) {
    // Clear any existing timer loops if exiting quiz unexpectedly
    if (screenId !== "quiz") {
        clearInterval(timerInterval);
        document.getElementById("timerContainer").style.display = "none";
    }

    // Handle active navigation highlights
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach(link => {
        if (link.getAttribute("data-screen") === screenId) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    // Lock headers if user is in quiz session
    const header = document.querySelector(".global-header");
    if (screenId === "quiz") {
        header.classList.add("quiz-active");
    } else {
        header.classList.remove("quiz-active");
    }

    showScreen(screenId);

    if (screenId === "dashboard") {
        renderDashboard();
    }
}

function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add("active");
    }
    window.scrollTo(0, 0);
}

// UI Assembly Functions
function buildYearSelector() {
    const container = document.getElementById("yearSelector");
    if (!container) return;
    container.innerHTML = Data
        .map(
            (d, i) => `
    <button class="year-btn ${i === currentYearIdx ? "active" : ""}" onclick="selectYear(${i})" id="yb${i}">
        ${d.label}
    </button>
    `
        )
        .join("");
}

function selectYear(index) {
    currentYearIdx = index;
    selectedSections.clear();

    document.querySelectorAll(".year-btn").forEach((btn, i) => {
        btn.classList.toggle("active", i === index);
    });

    buildSectionGrid();
    updateStartButton();
}

function buildSectionGrid() {
    const sections = Data[currentYearIdx].sections;
    const grid = document.getElementById("sectionGrid");
    if (!grid) return;
    grid.innerHTML = sections
        .map(
            (s, i) => `
        <div class="section-card ${selectedSections.has(i) ? "selected" : ""}" onclick="toggleSection(${i})" id="sc${i}">
        <div class="section-num">Section ${s.id}</div>
        <div class="section-title">${s.title}</div>
        <div class="section-desc">${s.desc.substring(0, 60)}...</div>
        <div class="section-count">${s.questions.length} Questions</div>
        </div>
    `
        )
        .join("");
}

function toggleSection(i) {
    if (selectedSections.has(i)) {
        selectedSections.delete(i);
    } else {
        selectedSections.add(i);
    }
    const el = document.getElementById(`sc${i}`);
    if (el) el.classList.toggle("selected");
    updateStartButton();
}

function updateStartButton() {
    const startBtn = document.getElementById("startBtn");
    if (startBtn) {
        startBtn.disabled = selectedSections.size === 0;
    }
}

// Initialization of quiz parameters
function startQuiz() {
    if (selectedSections.size === 0) return;

    let compiledQuestions = [];
    const sections = Data[currentYearIdx].sections;
    const sortedSections = Array.from(selectedSections).sort((a, b) => a - b);

    sortedSections.forEach((si) => {
        const s = sections[si];
        s.questions.forEach((q) => {
            compiledQuestions.push({
                ...q,
                sectionId: s.id,
                sectionTitle: s.title,
                type: s.type || "mc",
                sectionIdx: si,
            });
        });
    });

    const selectedYear = Data[currentYearIdx];
    const isPractice =
        (typeof DATA_PRACTICE !== "undefined" && selectedYear === DATA_PRACTICE) ||
        (selectedYear && selectedYear.label && selectedYear.label.toLowerCase().includes("practice")) ||
        (selectedYear && selectedYear.id && selectedYear.id.toLowerCase().includes("practice"));

    if (isPractice) {
        const totalAvailable = compiledQuestions.length;
        showModal(
            "Configure Practice",
            `How many questions would you like to solve? (Select up to ${totalAvailable})`,
            true,
            totalAvailable,
            function (parsedCount) {
                // Durstenfeld shuffle routine
                for (let i = compiledQuestions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = compiledQuestions[i];
                    compiledQuestions[i] = compiledQuestions[j];
                    compiledQuestions[j] = temp;
                }

                quizQuestions = compiledQuestions.slice(0, parsedCount);
                setupQuizState();
            }
        );
    } else {
        quizQuestions = compiledQuestions;
        setupQuizState();
    }
}

function setupQuizState() {
    currentPage = 0;
    userAnswers = new Array(quizQuestions.length).fill(null);
    reviewMode = false;

    const qppSelect = document.getElementById("qpp");
    if (qppSelect) qppSelect.value = "1";
    questionsPerPage = 1;

    switchScreen("quiz");
    renderPage();

    if (isTimerEnabled) {
        remainingSeconds = timeLimitPerQuestion * questionsPerPage;
        startCountdownTimer(false);
    }
    saveQuizState();
}

function changeQPP(val) {
    questionsPerPage = val === "all" ? quizQuestions.length : parseInt(val, 10);
    currentPage = 0;
    renderPage();
    window.scrollTo(0, 0);

    if (isTimerEnabled && !reviewMode) {
        remainingSeconds = timeLimitPerQuestion * questionsPerPage;
        startCountdownTimer(false);
    }
    saveQuizState();
}

// Timing Execution Mechanism
function startCountdownTimer(isResumed = false) {
    clearInterval(timerInterval);
    const container = document.getElementById("timerContainer");
    const counterSpan = document.getElementById("timerSeconds");

    if (!container || !counterSpan) return;
    container.style.display = "inline-flex";

    if (!isResumed) {
        remainingSeconds = timeLimitPerQuestion * (questionsPerPage === quizQuestions.length ? quizQuestions.length : questionsPerPage);
    }

    counterSpan.textContent = remainingSeconds;
    container.classList.remove("timer-warning");

    timerInterval = setInterval(() => {
        remainingSeconds--;
        counterSpan.textContent = remainingSeconds;

        // Persist decreasing timer values securely in IndexedDB
        saveQuizState();

        if (remainingSeconds <= 10) {
            container.classList.add("timer-warning");
        } else {
            container.classList.remove("timer-warning");
        }

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            handlePageTimeout();
        }
    }, 1000);
}

function handlePageTimeout() {
    // Automatically submit unanswered questions on the current page as incorrect
    const startIndex = currentPage * questionsPerPage;
    const endIndex = Math.min(startIndex + questionsPerPage, quizQuestions.length);

    for (let i = startIndex; i < endIndex; i++) {
        if (userAnswers[i] === null) {
            userAnswers[i] = -1; // Mark explicitly as missed
        }
    }

    showModal("Time's Up!", "Time has run out for this page. Unanswered questions were marked as incorrect.");
    renderPage();
    saveQuizState();
}

// Rendering of Active Quiz Page
function renderPage() {
    const totalQuestions = quizQuestions.length;
    if (totalQuestions === 0) return;

    const totalPages = Math.ceil(totalQuestions / questionsPerPage);
    const startIndex = currentPage * questionsPerPage;
    const endIndex = Math.min(startIndex + questionsPerPage, totalQuestions);
    const pct = (((currentPage + 1) / totalPages) * 100).toFixed(1);

    document.getElementById("sectionLabel").textContent = `Questions ${startIndex + 1} – ${endIndex} of ${totalQuestions}`;
    document.getElementById("progressText").textContent = `Page ${currentPage + 1} / ${totalPages}`;
    document.getElementById("progressFill").style.width = pct + "%";
    document.getElementById("prevBtn").disabled = currentPage === 0;

    const isLastPage = currentPage === totalPages - 1;
    document.getElementById("nextBtn").textContent = isLastPage ? "Finish Exam" : "Next Page";

    let html = "";
    let cardIndex = 0;
    let renderedPassages = new Set();

    for (let i = startIndex; i < endIndex; i++) {
        const q = quizQuestions[i];
        const answered = userAnswers[i] !== null;
        const locked = answered || reviewMode;
        const delay = (cardIndex * 0.08).toFixed(2);
        cardIndex++;

        const section = Data[currentYearIdx].sections[q.sectionIdx];
        if (section && section.passage && !renderedPassages.has(q.sectionIdx)) {
            html += `<div class="q-passage" style="margin-bottom: 24px; animation: fadeUp 0.5s ease forwards;">${section.passage}</div>`;
            renderedPassages.add(q.sectionIdx);
        }

        html += `<div class="question-card" id="q-card-${i}" style="animation-delay: ${delay}s">
        <div class="q-label">Question ${i + 1} <span class="q-section-tag">Section ${q.sectionId}</span></div>`;

        if (q.type === "error") {
            html += buildErrorQuestion(q, i, locked);
        } else {
            html += buildMCQuestion(q, i, locked);
        }

        if (locked) {
            const isMissed = userAnswers[i] === -1;
            const correct = userAnswers[i] === q.a;
            let answerLetter = String.fromCharCode(65 + q.a);

            let explanationHtml = "";
            if ((reviewMode || !correct) && q.explain) {
                explanationHtml = `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 0.95em; color: var(--text-muted);">
                <strong style="color: var(--text-main);">Reason:</strong> ${q.explain}
            </div>
        `;
            }

            let statusMsg = "";
            if (isMissed) {
                statusMsg = `<strong>✗ Time Limit Exceeded.</strong> The correct answer is <strong>${answerLetter}</strong>.`;
            } else if (correct) {
                statusMsg = "<strong>✓ Correct!</strong> Well done.";
            } else {
                statusMsg = `<strong>✗ Incorrect.</strong> The correct answer is <strong>${answerLetter}</strong>.`;
            }

            html += `<div class="feedback ${correct ? "correct-fb" : "wrong-fb"} show" style="display: flex; flex-direction: column;">
          <div>${statusMsg}</div>
          ${explanationHtml}
      </div>`;
        }

        html += `</div>`;
    }

    document.getElementById("questionArea").innerHTML = html;
}

function buildMCQuestion(q, globalIndex, locked) {
    const letters = ["A", "B", "C", "D"];
    let html = `<div class="q-text">${q.q}</div>`;

    if (q.context) {
        html += `<div class="q-passage">${q.context}</div>`;
    }

    html += `<div class="options">`;

    q.opts.forEach((opt, i) => {
        let cls = "";
        if (locked) {
            if (i === q.a) cls = "correct";
            else if (i === userAnswers[globalIndex]) cls = "wrong";
            else if (userAnswers[globalIndex] === i) cls = "selected";
        } else if (userAnswers[globalIndex] === i) {
            cls = "selected";
        }

        html += `<div class="opt ${cls} ${locked ? "locked" : ""}" onclick="selectAnswer(${globalIndex}, ${i})">
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
        let cls = "";
        if (locked) {
            if (i === q.a) cls = "correct";
            else if (i === userAnswers[globalIndex]) cls = "wrong";
            else if (userAnswers[globalIndex] === i) cls = "selected";
        } else if (userAnswers[globalIndex] === i) {
            cls = "selected";
        }

        html += `<div class="part-opt ${cls} ${locked ? "locked" : ""}" onclick="selectAnswer(${globalIndex}, ${i})">
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
    saveQuizState();

    if (questionsPerPage > 1 && globalIndex < quizQuestions.length - 1) {
        setTimeout(() => {
            const nextEl = document.getElementById(`q-card-${globalIndex + 1}`);
            if (nextEl) {
                const y = nextEl.getBoundingClientRect().top + window.pageYOffset - 200;
                window.scrollTo({ top: y, behavior: "smooth" });
            }
        }, 400);
    }
}

// Navigation flow control
function nextQ() {
    if (!reviewMode) {
        const startIndex = currentPage * questionsPerPage;
        const endIndex = Math.min(startIndex + questionsPerPage, quizQuestions.length);

        let allAnswered = true;
        for (let i = startIndex; i < endIndex; i++) {
            if (userAnswers[i] === null) {
                allAnswered = false;
                break;
            }
        }

        if (!allAnswered) {
            showModal("Missing Answers", "Please select an answer for all questions on this page before proceeding.");
            return;
        }
    }

    const totalPages = Math.ceil(quizQuestions.length / questionsPerPage);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderPage();
        window.scrollTo(0, 0);

        if (isTimerEnabled && !reviewMode) {
            startCountdownTimer(false);
        }
        saveQuizState();
    } else {
        clearInterval(timerInterval);
        document.getElementById("timerContainer").style.display = "none";
        showResults();
    }
}

function prevQ() {
    if (currentPage > 0) {
        currentPage--;
        renderPage();
        window.scrollTo(0, 0);

        if (isTimerEnabled && !reviewMode) {
            startCountdownTimer(false);
        }
        saveQuizState();
    }
}

function goHome() {
    if (!reviewMode && quizQuestions.length > 0) {
        showModal(
            "Confirm Exit",
            "Are you sure you want to abandon this exam? Your active progress will be cleared.",
            false,
            0,
            null,
            true, // Show as confirm dialog
            async () => {
                clearInterval(timerInterval);
                document.getElementById("timerContainer").style.display = "none";
                quizQuestions = [];
                userAnswers = [];
                await clearQuizState();
                switchScreen("home");
            }
        );
    } else {
        clearInterval(timerInterval);
        document.getElementById("timerContainer").style.display = "none";
        quizQuestions = [];
        userAnswers = [];
        clearQuizState();
        switchScreen("home");
    }
}

// Execution and Persistence of Outcomes
async function showResults() {
    const total = quizQuestions.length;
    const answered = userAnswers.filter((a) => a !== null).length;
    const correct = userAnswers.filter((a, i) => a === quizQuestions[i].a).length;
    const wrong = total - correct;
    const pct = Math.round((correct / total) * 100) || 0;

    // Clear running session database state upon successful termination
    await clearQuizState();

    // Log to history store inside IndexedDB
    const selectedYear = Data[currentYearIdx];
    const activeSections = Array.from(selectedSections)
        .map((si) => selectedYear.sections[si].id)
        .join(", ");

    await logQuizAttempt({
        timestamp: new Date().toISOString(),
        yearLabel: selectedYear.label,
        sections: activeSections,
        correct,
        wrong,
        total,
        scorePct: pct,
    });

    document.getElementById("scoreRing").style.setProperty("--pct", pct + "%");
    document.getElementById("scorePct").textContent = pct;
    document.getElementById("statCorrect").textContent = correct;
    document.getElementById("statWrong").textContent = wrong;
    document.getElementById("statTotal").textContent = total;

    let title, sub;
    if (pct >= 90) {
        title = "Outstanding! 🎉";
        sub = "MEXT-ready! Excellent performance.";
    } else if (pct >= 75) {
        title = "Well Done! 👍";
        sub = "Strong performance. Keep refining.";
    } else if (pct >= 60) {
        title = "Good Effort";
        sub = "Review your mistakes and try again.";
    } else {
        title = "Keep Practicing";
        sub = "Study the explanations and retake the quiz.";
    }

    document.getElementById("resultTitle").textContent = title;
    document.getElementById("resultSub").textContent = sub;

    switchScreen("results");
}

function reviewAnswers() {
    reviewMode = true;
    currentPage = 0;
    questionsPerPage = quizQuestions.length;

    const qppDropdown = document.getElementById("qpp");
    if (qppDropdown) {
        qppDropdown.value = "all";
    }

    switchScreen("quiz");
    renderPage();
}

// Analytics Presentation Logic
async function renderDashboard() {
    const logs = await getHistoryData();

    // Metric variables
    const totalAttempts = logs.length;
    let avgScore = 0;
    let totalCorrect = 0;
    let totalErrors = 0;

    if (totalAttempts > 0) {
        const sumScores = logs.reduce((sum, item) => sum + item.scorePct, 0);
        avgScore = Math.round(sumScores / totalAttempts);
        totalCorrect = logs.reduce((sum, item) => sum + item.correct, 0);
        totalErrors = logs.reduce((sum, item) => sum + item.wrong, 0);
    }

    document.getElementById("dashTotalAttempts").textContent = totalAttempts;
    document.getElementById("dashAvgScore").textContent = avgScore + "%";
    document.getElementById("dashTotalCorrect").textContent = totalCorrect;
    document.getElementById("dashTotalWrong").textContent = totalErrors;

    // Toggle chart visibility depending on data availability
    const chartsContainer = document.getElementById("chartsContainer");
    if (chartsContainer) {
        chartsContainer.style.display = totalAttempts > 0 ? "grid" : "none";
    }

    // Populate charts if user database has data
    if (totalAttempts > 0) {
        buildDashboardCharts(logs, totalCorrect, totalErrors);
    }

    // Populate Performance Table Elements
    const tableBody = document.getElementById("historyTableBody");
    if (!tableBody) return;

    if (totalAttempts === 0) {
        tableBody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
                No completed quiz sessions are currently available.
            </td>
        </tr>`;
        return;
    }

    // Render recent sessions (newest first)
    tableBody.innerHTML = [...logs]
        .reverse()
        .map((item) => {
            const dateString = new Date(item.timestamp).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            });
            return `
        <tr>
            <td>${dateString}</td>
            <td><strong>${item.yearLabel}</strong></td>
            <td><span class="section-count" style="margin-top:0;">Sec. ${item.sections}</span></td>
            <td><strong>${item.scorePct}%</strong></td>
            <td>${item.correct} / ${item.total}</td>
        </tr>`;
        })
        .join("");
}

function buildDashboardCharts(logs, totalCorrect, totalErrors) {
    // Prevent execution if Chart library fails to resolve from CDN
    if (typeof Chart === "undefined") {
        console.warn("Chart.js library is not available.");
        return;
    }

    // Safely dispose of former instances before regeneration
    if (scoreChartInstance) scoreChartInstance.destroy();
    if (accuracyChartInstance) accuracyChartInstance.destroy();

    // 1. Prepare Data for Line Chart (chronological progression)
    const scoreLabels = logs.map((_, index) => `Session ${index + 1}`);
    const scoreData = logs.map((item) => item.scorePct);

    const ctxScore = document.getElementById("scoreTrendChart").getContext("2d");
    scoreChartInstance = new Chart(ctxScore, {
        type: "line",
        data: {
            labels: scoreLabels,
            datasets: [
                {
                    label: "Score (%)",
                    data: scoreData,
                    borderColor: "#346739", // Theme primary Dark Green
                    backgroundColor: "rgba(159, 203, 152, 0.25)", // Theme primary-light
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: "#346739",
                    pointRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        callback: (value) => `${value}%`,
                    },
                    grid: {
                        color: "rgba(159, 203, 152, 0.1)",
                    },
                },
                x: {
                    grid: { display: false },
                },
            },
        },
    });

    // 2. Prepare Data for Doughnut Chart (accuracy breakdown)
    const ctxAccuracy = document.getElementById("accuracyChart").getContext("2d");
    accuracyChartInstance = new Chart(ctxAccuracy, {
        type: "doughnut",
        data: {
            labels: ["Correct", "Errors"],
            datasets: [
                {
                    data: [totalCorrect, totalErrors],
                    backgroundColor: [
                        "#346739", // Theme primary Dark Green
                        "#d45d5d", // Theme Soft Red
                    ],
                    borderWidth: 2,
                    borderColor: "#ffffff",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { family: "'Inter', sans-serif" },
                    },
                },
            },
            cutout: "65%",
        },
    });
}

// Configuration Administration functions
async function toggleAdminTimer(checked) {
    isTimerEnabled = checked;
    const configGroup = document.getElementById("timerConfigGroup");
    if (configGroup) {
        configGroup.style.display = checked ? "block" : "none";
    }
    await saveSetting("timerEnabled", checked);
}

async function saveTimeLimitSetting(val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 300) {
        timeLimitPerQuestion = parsed;
        await saveSetting("timeLimit", parsed);
    }
}

async function saveAdminSettings() {
    const timerToggle = document.getElementById("adminTimerToggle").checked;
    const limitInput = document.getElementById("adminTimeLimit").value;

    await toggleAdminTimer(timerToggle);
    await saveTimeLimitSetting(limitInput);

    showModal("Settings Saved", "Your timing and configuration changes were stored persistently.");
    switchScreen("home");
}

// Modal/Dialogue Presentation Helpers
function handleModalConfirm() {
    const modalInput = document.getElementById("modalInput");
    const val = parseInt(modalInput.value, 10);

    if (isNaN(val) || val < 1 || val > activeMaxVal) {
        const errorMsg = document.getElementById("modalMessage");
        errorMsg.innerHTML = `<span style="color: var(--danger, #d45d5d); font-weight: 600;">Please enter a valid count between 1 and ${activeMaxVal}.</span>`;
        return;
    }

    closeModal();
    if (activeConfirmCallback) {
        activeConfirmCallback(val);
    }
}

function showModal(title, message, isInput = false, maxVal = 0, onConfirm = null, isConfirmCancel = false, onCancelConfirm = null) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalMessage").textContent = message;

    const inputContainer = document.getElementById("modalInputContainer");
    const actionContainer = document.getElementById("modalActionContainer");
    const modalInput = document.getElementById("modalInput");

    if (isInput) {
        inputContainer.style.display = "block";
        modalInput.value = maxVal;
        modalInput.min = 1;
        modalInput.max = maxVal;

        activeConfirmCallback = onConfirm;
        activeMaxVal = maxVal;

        actionContainer.innerHTML = `
        <button class="btn btn-primary modal-btn" onclick="handleModalConfirm()">Start Practice</button>
        <button class="btn modal-btn" onclick="closeModal()" style="background: none; border: 1px solid var(--border, #9fcb98); color: var(--text-muted, #4e6b52);">Cancel</button>
    `;
        actionContainer.style.flexDirection = "row";
    } else if (isConfirmCancel) {
        inputContainer.style.display = "none";
        activeConfirmCallback = onCancelConfirm;

        actionContainer.innerHTML = `
        <button class="btn btn-primary modal-btn" id="modalConfirmBtn">Yes, Exit</button>
        <button class="btn modal-btn" onclick="closeModal()" style="background: none; border: 1px solid var(--border, #9fcb98); color: var(--text-muted, #4e6b52);">Cancel</button>
    `;
        actionContainer.style.flexDirection = "row";
        document.getElementById("modalConfirmBtn").onclick = () => {
            closeModal();
            if (onCancelConfirm) onCancelConfirm();
        };
    } else {
        inputContainer.style.display = "none";
        actionContainer.innerHTML = `
        <button class="btn btn-primary modal-btn" onclick="closeModal()">Got it</button>
    `;
        actionContainer.style.flexDirection = "column";
    }

    document.getElementById("customModal").classList.add("active");
}

function closeModal() {
    document.getElementById("customModal").classList.remove("active");
}

window.onload = init;