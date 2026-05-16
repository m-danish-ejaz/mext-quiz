function QuizEngine(config) {
    createLayout(
        config.title,
        config.subtitle
    );

    const quizDiv = document.getElementById('quiz');
    let currentPage = 1;
    let questionsPerPage = 25;
    const userAnswers = {};
    document.getElementById('pageSize').addEventListener('change', function () {
        questionsPerPage = parseInt(this.value);
        currentPage = 1;
        renderQuiz();
    });

    function renderQuiz() {
        quizDiv.innerHTML = '';
        const start = (currentPage - 1) * questionsPerPage;
        const end = start + questionsPerPage;
        const questions = config.questions.slice(start, end);
        questions.forEach((item, index) => {
            const globalIndex = start + index;
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="question">
                    <strong>
                        Q${globalIndex + 1}.
                    </strong>
                    ${item.q}
                </div>
            `;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            item.options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.innerText = opt;
                btn.onclick = () => {
                    if (
                        userAnswers[globalIndex]
                    ) return;
                    userAnswers[globalIndex] = true;
                    if (i === item.a) {
                        btn.classList.add('correct');
                    } else {
                        btn.classList.add('wrong');
                    }
                };
                optionsDiv.appendChild(btn);
            });
            card.appendChild(optionsDiv);
            quizDiv.appendChild(card);
        });

        renderPagination();
    }

    function renderPagination() {
        const totalPages = Math.ceil(config.questions.length / questionsPerPage);
        const old = document.getElementById('pagination');
        if (old) old.remove();
        document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
        const div = document.createElement('div');
        div.id = 'pagination';
        div.className = 'pagination-buttons';
        const prev = document.createElement('button');
        prev.innerText = '← Previous';
        prev.disabled = currentPage === 1;
        prev.onclick = () => {
            currentPage--;
            renderQuiz();
        };
        const next = document.createElement('button');
        next.innerText = 'Next →';
        next.disabled = currentPage === totalPages;
        next.onclick = () => {
            currentPage++;
            renderQuiz();
        };
        div.appendChild(prev);
        div.appendChild(next);
        quizDiv.appendChild(div);
    }
    renderQuiz();
}