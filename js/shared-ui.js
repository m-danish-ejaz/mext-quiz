function createLayout(title, subtitle) {

    document.body.innerHTML = `

        <div class="container">
            <div class="top-bar">
                <a href="index.html" class="back-btn"> Back</a>
            </div>
            <div class="header">
                <h1>${title}</h1>
                <p>${subtitle}</p>
            </div>
            <div class="stats">
                <div class="stat-box">
                    <h2 id="correct">0</h2>
                    <p>Correct</p>
                </div>
                <div class="stat-box">
                    <h2 id="wrong">0</h2>
                    <p>Wrong</p>
                </div>
                <div class="stat-box">
                    <h2 id="score">0%</h2>
                    <p>Score</p>
                </div>
            </div>
            <div class="view-box">
                <div class="pagination-controls">
                    <div>
                        <label>
                            Questions Per Page
                        </label>
                        <select id="pageSize">
                            <option value="10"> 10</option>
                            <option value="25" selected> 25</option>
                            <option value="50">50 </option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <div id="pageInfo"></div>
                </div>
                <div id="quiz"></div>
            </div>
            <div class="summary"
                id="summary">
                <h2>
                    Quiz Completed 🎉
                </h2>
            </div>
        </div>
    `;
}
