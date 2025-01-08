document.addEventListener('DOMContentLoaded', () => {
    // 启动说明处理
    const startupOverlay = document.getElementById('startup-overlay');
    const warningOverlay = document.getElementById('warning-overlay');
    const startButton = document.getElementById('start-button');
    const verifyButton = document.getElementById('verify-button');
    const cancelButton = document.getElementById('cancel-button');
    const verificationCode = document.getElementById('verification-code');
    const container = document.querySelector('.container');

    // 初始隐藏主容器
    container.style.display = 'none';

    // 验证码检查函数
    function checkVerificationCode() {
        const correctCode = 'xxx12zzcx';
        const inputCode = verificationCode.value.trim();
        
        if (inputCode === correctCode) {
            warningOverlay.style.opacity = '0';
            warningOverlay.style.transition = 'opacity 1s';
            
            setTimeout(() => {
                warningOverlay.style.display = 'none';
                container.style.display = 'block';
                container.style.opacity = '0';
                container.style.transition = 'opacity 1s';
                requestAnimationFrame(() => {
                    container.style.opacity = '1';
                    // 开始第一个问题
                    askNextQuestion();
                });
            }, 1000);
        } else {
            // 验证失败效果
            verificationCode.classList.add('verification-error');
            verificationCode.value = '';
            verificationCode.placeholder = '验证码错误 - 系统防御已启动';
            
            // 添加抖动效果
            warningOverlay.classList.add('shake');
            setTimeout(() => {
                warningOverlay.classList.remove('shake');
                verificationCode.classList.remove('verification-error');
                verificationCode.placeholder = '请输入验证码';
            }, 1000);
        }
    }

    // 点击开始按钮后的处理
    startButton.addEventListener('click', () => {
        startupOverlay.style.opacity = '0';
        startupOverlay.style.transition = 'opacity 1s';
        
        setTimeout(() => {
            startupOverlay.style.display = 'none';
            warningOverlay.style.display = 'block';
            warningOverlay.style.opacity = '0';
            requestAnimationFrame(() => {
                warningOverlay.style.opacity = '1';
            });
        }, 1000);
    });

    // 验证按钮点击事件
    verifyButton.addEventListener('click', checkVerificationCode);

    // 取消按钮点击事件
    cancelButton.addEventListener('click', () => {
        window.close();
        // 如果window.close()不起作用，显示终止访问信息
        document.body.innerHTML = '<div class="termination-message">系统访问已终止</div>';
    });

    // 验证码输入框回车事件
    verificationCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkVerificationCode();
        }
    });

    // 对话状态管理
    const dialogueState = {
        currentStage: 'initial',
        currentQuestionIndex: 0,
        repeatCount: 0,
        collectedData: {},
        waitingForFollowUp: false
    };

    const analyzer = new PersonalityAnalyzer();
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const analysisResult = document.getElementById('analysis-result');
    const stageName = document.querySelector('.stage-name');
    const progressPercentage = document.querySelector('.progress-percentage');
    const progressFill = document.querySelector('.progress-fill');

    // 获取当前问题
    function getCurrentQuestion() {
        const stage = analyzer.promptModel.prompts[dialogueState.currentStage];
        if (!stage || !stage.questions) return null;
        return stage.questions[dialogueState.currentQuestionIndex];
    }

    // 显示下一个问题
    function askNextQuestion() {
        const currentStage = analyzer.promptModel.prompts[dialogueState.currentStage];
        if (!currentStage) return;

        // 如果当前问题组已完成，进入下一阶段
        if (dialogueState.currentQuestionIndex >= currentStage.questions.length) {
            if (currentStage.nextStage === 'analyzing') {
                startAnalysis();
                return;
            }
            dialogueState.currentStage = currentStage.nextStage;
            dialogueState.currentQuestionIndex = 0;
            dialogueState.repeatCount = 0;
            updateProgress();
        }

        const question = getCurrentQuestion();
        if (!question) return;

        // 如果是重复问题且达到重复次数，跳到下一个问题
        if (question.repeat && dialogueState.repeatCount >= question.repeat) {
            dialogueState.currentQuestionIndex++;
            dialogueState.repeatCount = 0;
            askNextQuestion();
            return;
        }

        // 显示问题
        let questionText = question.question;
        if (question.repeat && question.repeat > 1) {
            const remaining = question.repeat - dialogueState.repeatCount;
            questionText = `${question.question} (还需要${remaining}个)`;
        }
        addMessage(questionText, false);
        
        if (question.options) {
            addMessage(`可选项: ${question.options.join(' / ')}`, false, true);
        }
    }

    // 处理用户输入
    async function handleUserInput() {
        const message = userInput.value.trim();
        if (!message) return;

        // 禁用输入和发送按钮
        userInput.disabled = true;
        sendButton.disabled = true;

        // 显示用户消息
        addMessage(message, true);
        userInput.value = '';

        // 处理输入
        const question = getCurrentQuestion();
        if (!question) return;

        // 验证输入
        const isValid = validateInput(message, question);
        if (!isValid) {
            addMessage(getValidationMessage(question), false, true);
            userInput.disabled = false;
            sendButton.disabled = false;
            return;
        }

        // 保存数据
        saveAnswer(message, question);

        // 处理后续问题
        if (question.repeat && dialogueState.repeatCount < question.repeat - 1) {
            dialogueState.repeatCount++;
            askNextQuestion();  // 立即显示下一个重复问题
        } else if (question.followUp && message === question.followUp.condition) {
            dialogueState.waitingForFollowUp = true;
            addMessage(question.followUp.question, false);
        } else {
            if (dialogueState.waitingForFollowUp) {
                // 保存跟进问题的答案
                saveAnswer(message, {...getCurrentQuestion(), id: getCurrentQuestion().id + '_followup'});
                dialogueState.waitingForFollowUp = false;
            }
            dialogueState.currentQuestionIndex++;
            dialogueState.repeatCount = 0;
            askNextQuestion();  // 显示下一个问题
        }

        // 重新启用输入
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
    }

    // 验证输入
    function validateInput(input, question) {
        switch (question.format) {
            case '单选':
                return question.options.includes(input);
            case '数字':
                return !isNaN(input) && input !== '';
            case 'datetime':
                return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input);
            case 'time':
                return /^\d{2}:\d{2}$/.test(input);
            case 'timeRange':
                return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(input);
            case 'percentage':
                const num = parseFloat(input);
                return !isNaN(num) && num >= 0 && num <= 100;
            case 'score':
                const score = parseInt(input);
                return !isNaN(score) && score >= question.min && score <= question.max;
            case 'boolean':
                return ['是', '否'].includes(input);
            default:
                return input.length > 0;
        }
    }

    // 获取验证错误消息
    function getValidationMessage(question) {
        switch (question.format) {
            case '单选':
                return `请从以下选项中选择一个: ${question.options.join(' / ')}`;
            case '数字':
                return '请输入有效的数字';
            case 'datetime':
                return '请使用格式: YYYY-MM-DD HH:mm';
            case 'time':
                return '请使用格式: HH:mm';
            case 'timeRange':
                return '请使用格式: HH:mm-HH:mm';
            case 'percentage':
                return '请输入0-100之间的数字';
            case 'score':
                return `请输入${question.min}-${question.max}之间的分数`;
            case 'boolean':
                return '请回答"是"或"否"';
            default:
                return '请输入有效的内容';
        }
    }

    // 保存答案
    function saveAnswer(answer, question) {
        if (!dialogueState.collectedData[dialogueState.currentStage]) {
            dialogueState.collectedData[dialogueState.currentStage] = {};
        }
        
        if (question.repeat) {
            if (!dialogueState.collectedData[dialogueState.currentStage][question.id]) {
                dialogueState.collectedData[dialogueState.currentStage][question.id] = [];
            }
            dialogueState.collectedData[dialogueState.currentStage][question.id].push(answer);
        } else {
            dialogueState.collectedData[dialogueState.currentStage][question.id] = answer;
        }
    }

    // 开始分析
    async function startAnalysis() {
        addMessage("数据采集完成，开始深度分析...", false);
        try {
            // 显示分析结果容器
            const analysisResult = document.getElementById('analysis-result');
            analysisResult.classList.remove('hidden');
            
            // 创建并显示进度条
            const analysisContainer = document.getElementById('analysis-container');
            if (!document.getElementById('analysis-progress')) {
                const progressDiv = document.createElement('div');
                progressDiv.id = 'analysis-progress';
                progressDiv.className = 'analysis-progress';
                progressDiv.innerHTML = `
                    <div class="progress-status">准备开始分析...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="progress-percent">0%</div>
                `;
                analysisContainer.insertBefore(progressDiv, analysisContainer.firstChild);
            }
            
            // 更新初始进度
            updateAnalysisProgress("开始数据处理...", 10);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 更新进度并开始分析
            updateAnalysisProgress("正在进行深度分析...", 30);
            
            // 调用大模型生成分析内容
            const analysisData = await generateAnalysisContent(dialogueState.collectedData);
            
            // 显示结果
            await displayResults(analysisData);
            
                dialogueState.currentStage = 'complete';
            updateProgress();
            
        } catch (error) {
            console.error('分析过程出错:', error);
            addMessage("分析过程中遇到错误，请检查数据完整性。", false);
            updateAnalysisProgress("分析过程出错", 0);
        }
    }

    // 生成分析内容
    async function generateAnalysisContent(userData) {
        try {
            updateAnalysisProgress("正在生成命理分析...", 10);
            
            // 构建基础提示词
            const systemPrompt = `你是一位经验丰富的命理分析师，需要用通俗易懂的语言为用户解读人生轨迹。
请基于用户的出生信息，对其人生进行完整的分析和预测。
分析要求：
1. 使用大众能理解的语言
2. 避免专业术语，即使用到也要配合解释
3. 预测要具体且贴近生活
4. 重点说明人生重要转折`;

            // 分段获取内容
            let fullContent = '';
            
            // 第一部分：整体运势分析
            const overallPrompt = `请基于以下信息进行整体运势分析：
${JSON.stringify(userData, null, 2)}

请分析以下内容：
1. 性格特点和天赋：
   - 主要性格特征
   - 特殊才能和天赋
   - 适合发展的方向

2. 人生主要特点：
   - 人生整体发展趋势
   - 最重要的几个转折点
   - 需要特别把握的机会

3. 人生各阶段概述：
   - 童年期（1-12岁）主要特点
   - 青少年期（13-18岁）主要特点
   - 成年早期（19-30岁）主要特点
   - 成年中期（31-45岁）主要特点
   - 成年后期（46-60岁）主要特点
   - 老年期（61-80岁）主要特点`;

            const overallResult = await callAPI(systemPrompt, overallPrompt);
            fullContent += overallResult + '\n\n';
            updateAnalysisProgress("整体运势分析完成", 30);

            // 分段获取各年龄段的具体分析
            const ageRanges = [
                { start: 1, end: 12, name: "童年期" },
                { start: 13, end: 18, name: "青少年期" },
                { start: 19, end: 30, name: "成年早期" },
                { start: 31, end: 45, name: "成年中期" },
                { start: 46, end: 60, name: "成年后期" },
                { start: 61, end: 80, name: "老年期" }
            ];

            for (let i = 0; i < ageRanges.length; i++) {
                const range = ageRanges[i];
                const agePrompt = `请基于以下信息分析${range.start}-${range.end}岁的具体情况：
${JSON.stringify(userData, null, 2)}

请按年龄详细分析${range.name}（${range.start}-${range.end}岁）的具体情况：

分析要求：
1. 每一年都要包含：
   - 这一年的整体运势
   - 重要事件和时间点
   - 需要注意的事项
   - 机会与挑战

2. 重点说明：
   - 学习或工作情况
   - 家庭和感情变化
   - 健康状况变化
   - 财务发展情况
   - 人际关系变化
   - 重大事件预测

请按以下格式描述每一年：

${range.start}岁：
- 整体运势：[用简单的语言描述]
- 重要事件：[具体事情及发生时间]
- 需要注意：[要特别关注的事项]
- 机会与挑战：[可能遇到的机遇和困难]

...以此类推到${range.end}岁`;

                const result = await callAPI(systemPrompt, agePrompt);
                fullContent += `\n\n${range.name}（${range.start}-${range.end}岁）详细分析：\n${result}`;
                updateAnalysisProgress(`${range.name}分析完成`, 30 + (i + 1) * 10);
            }

            return fullContent;

        } catch (error) {
            console.error('生成分析内容时出错:', error);
            throw error;
        }
    }

    // 调用API的辅助函数
    async function callAPI(systemPrompt, userPrompt) {
        const apiUrl = CONFIG.API_ENDPOINT;
        
        const requestBody = {
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.95,
            stream: false,
            presence_penalty: 0,
            frequency_penalty: 0
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.choices || !result.choices[0] || !result.choices[0].message) {
            throw new Error('API返回数据格式不完整');
        }

        return result.choices[0].message.content;
    }

    // 更新分析进度
    function updateAnalysisProgress(status, percent) {
        const progressDiv = document.getElementById('analysis-progress');
        if (!progressDiv) return;

        const statusDiv = progressDiv.querySelector('.progress-status');
        const fillDiv = progressDiv.querySelector('.progress-fill');
        const percentDiv = progressDiv.querySelector('.progress-percent');

        if (statusDiv) statusDiv.textContent = status;
        if (fillDiv) fillDiv.style.width = `${percent}%`;
        if (percentDiv) percentDiv.textContent = `${percent}%`;

        // 添加日志以便调试
        console.log(`Progress updated: ${status} - ${percent}%`);
    }

    // 显示分析结果
    async function displayResults(analysisData) {
        try {
            // 获取分析结果容器
            const analysisResult = document.getElementById('analysis-result');
            analysisResult.classList.remove('hidden');
            analysisResult.classList.add('visible');
            
            // 清空之前的内容
            const analysisContainer = document.getElementById('analysis-container');
            analysisContainer.innerHTML = `
                <div class="analysis-text">
                    ${analysisData.replace(/\n/g, '<br>')}
                </div>
            `;
            
            // 滚动到分析结果
            analysisResult.scrollIntoView({ behavior: 'smooth' });
            
        } catch (error) {
            console.error('显示分析结果时出错:', error);
            addMessage("显示分析结果时遇到错误。", false);
        }
    }

    // 格式化时间
    function formatEventTime(event) {
        if (event.year) {
            return `${event.year}年${event.month ? event.month + '月' : ''}`;
        }
        return event.time || '时间未知';
    }

    // 更新进度
    function updateProgress() {
        const stages = Object.keys(analyzer.promptModel.prompts);
        const currentStageIndex = stages.indexOf(dialogueState.currentStage);
        const totalStages = stages.length;
        const currentStage = analyzer.promptModel.prompts[dialogueState.currentStage];
        
        if (!currentStage) return;

        const questionProgress = dialogueState.currentQuestionIndex / currentStage.questions.length;
        const totalProgress = Math.round(((currentStageIndex + questionProgress) / totalStages) * 100);

        stageName.textContent = `当前阶段：${getStageDisplayName(dialogueState.currentStage)}`;
        progressFill.style.width = `${totalProgress}%`;
        progressPercentage.textContent = `${totalProgress}%`;
    }

    // 获取阶段显示名称
    function getStageDisplayName(stage) {
        const stageNames = {
            initial: '基础数据采集',
            lifePattern: '生命周期分析',
            relationships: '社交网络分析',
            values: '决策模型分析',
            challenges: '发展瓶颈分析',
            analyzing: '深度分析中',
            complete: '分析完成'
        };
        return stageNames[stage] || stage;
    }

    // 添加消息到聊天界面
    function addMessage(content, isUser = false, isGuide = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : isGuide ? 'guide-message' : 'ai-message'}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        messageDiv.appendChild(contentDiv);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 格式化时间线部分
    function formatTimelineSection(timeline) {
        if (!timeline || !Array.isArray(timeline)) return '';

        return `<div class="timeline-section">
            <h2>生命阶段</h2>
            <div class="timeline">
                ${timeline.map(event => `
                    <div class="timeline-event">
                        <div class="event-time">${formatEventTime(event)}</div>
                        <div class="event-content">
                            <h3>${event.title || '阶段'}</h3>
                            <p>${event.description || ''}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    // 事件监听器
    sendButton.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });
}); 