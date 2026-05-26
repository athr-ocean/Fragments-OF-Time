const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export class GameUI {
  constructor(onQuizAnswer, onFeedbackContinue) {
    this.onQuizAnswer       = onQuizAnswer;
    this.onFeedbackContinue = onFeedbackContinue;

    this.uiContainer     = document.getElementById('ui-container');
    
    this.dialogBox       = document.getElementById('dialog-box');
    this.dialogPortrait  = document.getElementById('dialog-portrait-canvas');
    this.dialogLabel     = document.getElementById('dialog-portrait-label');
    this.dialogSpeaker   = document.getElementById('dialog-speaker-name');
    this.dialogText      = document.getElementById('dialog-text');
    this.dialogArrow     = document.getElementById('dialog-arrow-indicator');

    this.quizPanel       = document.getElementById('quiz-panel');
    this.quizEpoch       = document.getElementById('quiz-epoch-label');
    this.quizMachine     = document.getElementById('quiz-machine-label');
    this.quizQuestion    = document.getElementById('quiz-question');
    this.quizOptionsGrid = document.getElementById('quiz-options-grid');

    this.quizTimerWrap   = document.getElementById('quiz-timer-wrap');
    this.quizTimerFill   = document.getElementById('quiz-timer-fill');
    this.quizTimerCount  = document.getElementById('quiz-timer-count');

    this.feedbackPanel     = document.getElementById('feedback-panel');
    this.feedbackIcon      = document.getElementById('feedback-icon');
    this.feedbackTitle     = document.getElementById('feedback-title');
    this.feedbackCuriosity = document.getElementById('feedback-curiosity');
    this.repairFill        = document.getElementById('repair-bar-fill');
    this.repairPercent     = document.getElementById('repair-percent');
    this.feedbackBtn       = document.getElementById('feedback-continue-btn');

    this.hudScore        = document.getElementById('hud-score');
    this.hudProgress     = document.getElementById('hud-progress');
    this.hudLives        = document.getElementById('hud-lives');
    this.hudDiffBadge    = document.getElementById('hud-diff-badge');
    this.eraBannerName   = document.getElementById('era-name');
    this.eraBannerYear   = document.getElementById('era-year');
    this.eraBannerIcon   = document.getElementById('era-icon');

    this._gameOverEl = null;

    this._twTimer    = null;  
    this._twActive   = false; 
    this._onTwDone   = null;  
    this._pendingText = '';   

    this.feedbackBtn.addEventListener('click', () => {
      this._hidePanel(this.feedbackPanel);
      this.hideAll(); 
      if (this.onFeedbackContinue) this.onFeedbackContinue(); 
    });
  }

  _show(el)      { el.classList.remove('hidden'); el.style.display = ''; }
  _hide(el)      { el.classList.add('hidden');    el.style.display = 'none'; }
  _hidePanel(el) { el.classList.add('hidden'); }

  hideAll() {
    this.uiContainer.classList.add('hidden');
    this._hide(this.dialogBox);
    this._hidePanel(this.quizPanel);
    this._hidePanel(this.feedbackPanel);
    this.dialogArrow.style.display = 'none';
    this._stopTw(); 
  }

  isTyping() { return this._twActive; }

  skipDialog() {
    const text = this._pendingText || '';
    this._stopTw(); 
    this.dialogText.textContent = text; 
    this.dialogArrow.style.display = 'block'; 
    if (this._onTwDone) { this._onTwDone(); this._onTwDone = null; }
  }

  _startTw(el, text, speed, onDone) {
    this._stopTw(); 
    this._pendingText = text;
    el.textContent = '';
    this._twActive = true;
    this._onTwDone = onDone;
    
    const chars = text.split('');
    let i = 0;
    
    const tick = () => {
      if (!this._twActive) return; 
      
      if (i >= chars.length) {
        this._twActive = false;
        if (onDone) { onDone(); this._onTwDone = null; }
        return;
      }
      
      el.textContent += chars[i++]; 
      this._twTimer = setTimeout(tick, speed); 
    };
    this._twTimer = setTimeout(tick, speed); 
  }

  _stopTw() {
    this._twActive = false;
    if (this._twTimer) { clearTimeout(this._twTimer); this._twTimer = null; }
  }

  showDialogLine(speaker, text, portrait, renderer, era, onDone) {
    this.uiContainer.classList.remove('hidden');
    this._hidePanel(this.quizPanel);
    this._hidePanel(this.feedbackPanel);
    this._show(this.dialogBox);
    this.dialogArrow.style.display = 'none';

    this.dialogSpeaker.textContent = speaker;
    this.dialogLabel.textContent   = speaker;

    renderer.drawPortrait(this.dialogPortrait, portrait, era);

    this.dialogReady = false;
    this._startTw(this.dialogText, text, 24, () => {
      this.dialogArrow.style.display = 'block';
      if (onDone) onDone();
    });
  }

  showQuiz(machine, era) {
    this.uiContainer.classList.remove('hidden');
    this._hide(this.dialogBox);
    this._hidePanel(this.feedbackPanel);
    this.quizPanel.classList.remove('hidden');

    this.quizEpoch.textContent   = era.year;
    this.quizMachine.textContent = machine.name;
    
    this.quizOptionsGrid.innerHTML = '';
    this.quizQuestion.textContent  = '';

    if (this.quizTimerFill)  this.quizTimerFill.style.width = '100%';
    if (this.quizTimerCount) this.quizTimerCount.textContent = '—';
    if (this.quizTimerFill)  this.quizTimerFill.className = 'timer-fill timer-ok';

    this._startTw(this.quizQuestion, machine.question, 20, () => {
      machine.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.textContent   = `${OPTION_LETTERS[i]}:  ${opt}`;
        btn.dataset.letter = OPTION_LETTERS[i]; 

        btn.style.opacity    = '0';
        btn.style.transform  = 'translateY(8px)';
        btn.style.transition = 'opacity 0.2s, transform 0.2s';

        btn.addEventListener('click', () => {
          const isCorrect = i === machine.correctIndex;
          
          btn.style.borderColor = isCorrect ? '#50e878' : '#ff5050';
          btn.style.color       = isCorrect ? '#50e878' : '#ff5050';

          this.quizOptionsGrid.querySelectorAll('button').forEach(b => {
            b.disabled     = true;
            b.style.opacity = b === btn ? '1' : '0.4';
          });

          if (!isCorrect) {
            const correctBtn = this.quizOptionsGrid.querySelectorAll('button')[machine.correctIndex];
            if (correctBtn) {
              correctBtn.style.borderColor = '#50e878';
              correctBtn.style.color       = '#50e878';
              correctBtn.style.opacity     = '1';
            }
          }

          setTimeout(() => this.onQuizAnswer(i, machine), 600);
        });

        this.quizOptionsGrid.appendChild(btn);

        setTimeout(() => {
          btn.style.opacity   = '1';
          btn.style.transform = 'translateY(0)';
        }, 100 * i + 60);
      });
    });
  }

  updateQuizTimer(remaining, max) {
    if (!this.quizTimerFill || !this.quizTimerCount) return;
    
    const pct = Math.max(0, (remaining / max) * 100);
    this.quizTimerFill.style.width = `${pct}%`;
    this.quizTimerCount.textContent = Math.ceil(Math.max(0, remaining)) + 's';

    this.quizTimerFill.className = 'timer-fill';
    if (pct > 55) {
      this.quizTimerFill.classList.add('timer-ok');
    } else if (pct > 25) {
      this.quizTimerFill.classList.add('timer-warn');
    } else {
      this.quizTimerFill.classList.add('timer-danger');
    }
  }

  disableQuizButtons() {
    if (!this.quizOptionsGrid) return;
    this.quizOptionsGrid.querySelectorAll('button').forEach(b => {
      b.disabled     = true;
      b.style.opacity = '0.4';
    });
  }

  showFeedback(isCorrect, machine, repairPercent, timedOut = false) {
    this.uiContainer.classList.remove('hidden');
    this._hide(this.dialogBox);
    this._hidePanel(this.quizPanel);
    this.feedbackPanel.classList.remove('hidden');

    if (timedOut) {
      this.feedbackIcon.textContent  = '⏰';
      this.feedbackTitle.textContent = 'TEMPO ESGOTADO!';
      this.feedbackTitle.className   = 'timeout';
    } else if (isCorrect) {
      this.feedbackIcon.textContent  = '✅';
      this.feedbackTitle.textContent = 'CORRETO!';
      this.feedbackTitle.className   = 'correct';
    } else {
      this.feedbackIcon.textContent  = '❌';
      this.feedbackTitle.textContent = 'ERRADO!';
      this.feedbackTitle.className   = 'wrong';
    }

    this.repairFill.style.width    = `${repairPercent}%`;
    this.repairPercent.textContent = `${repairPercent}%`;

    this.feedbackCuriosity.textContent = '';
    this._startTw(this.feedbackCuriosity, machine.curiosity, 18, null);
  }

  updateHUD(score, completed, total) {
    if (this.hudScore)    this.hudScore.textContent    = `⭐ ${score}`;
    if (this.hudProgress) this.hudProgress.textContent = `🔧 ${completed}/${total}`;
  }

  updateLives(lives, maxLives) {
    if (!this.hudLives) return;
    let html = '';
    for (let i = 0; i < maxLives; i++) {
      if (i < lives) {
        html += `<span class="heart heart-full">♥</span>`; 
      } else {
        html += `<span class="heart heart-empty">♡</span>`; 
      }
    }
    this.hudLives.innerHTML = html; 
  }

  updateDifficultyBadge(diffCfg) {
    if (!this.hudDiffBadge) return;
    this.hudDiffBadge.textContent   = `${diffCfg.icon} ${diffCfg.label}`;
    this.hudDiffBadge.style.color   = diffCfg.color;
    this.hudDiffBadge.style.borderColor = diffCfg.color;
    this.hudDiffBadge.style.boxShadow   = `0 0 8px ${diffCfg.color}44`;
  }

  updateEraBanner(era) {
    this.eraBannerName.textContent = era.name;
    this.eraBannerYear.textContent = era.year;
    this.eraBannerIcon.textContent = era.icon;
  }

  triggerPortalFlash() {
    let flash = document.getElementById('portal-flash');
    
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'portal-flash';
      flash.style.cssText = `
        position:fixed;inset:0;background:#fff;z-index:9999;
        pointer-events:none;opacity:0;transition:opacity 0.15s;
      `;
      document.body.appendChild(flash);
    }
    
    flash.style.opacity = '0';
    requestAnimationFrame(() => {
      flash.style.opacity = '1';
      setTimeout(() => { flash.style.opacity = '0'; }, 350);
    });
  }

  showGameOver(score, machinesCompleted, totalCorrect, diffCfg, onRetry) {
    if (this._gameOverEl) this._gameOverEl.remove();

    const el = document.createElement('div');
    el.id = 'gameover-screen';
    
    el.innerHTML = `
      <div id="gameover-bg"></div>
      <div id="gameover-content">
        <div id="gameover-badge">💀</div>
        <p id="gameover-title">GAME  OVER</p>
        <p id="gameover-sub">Você ficou sem vidas!</p>

        <div id="gameover-diff-badge" style="color:${diffCfg.color};border-color:${diffCfg.color};box-shadow:0 0 12px ${diffCfg.color}44">
          ${diffCfg.icon} ${diffCfg.label}
        </div>

        <div id="gameover-stats">
          <div class="stat-row">
            <span>PONTUAÇÃO</span>
            <span style="color:var(--gba-yellow)">${score}</span>
          </div>
          <div class="stat-row">
            <span>COMPUTADORES</span>
            <span style="color:var(--gba-yellow)">${machinesCompleted}/5</span>
          </div>
          <div class="stat-row">
            <span>ACERTOS</span>
            <span style="color:var(--gba-yellow)">${totalCorrect}</span>
          </div>
        </div>

        <p id="gameover-tip">
          ${diffCfg.key === 'hard'
            ? '💡 Tente a dificuldade MÉDIO para ter mais tempo e vidas!'
            : diffCfg.key === 'medium'
              ? '💡 Tente a dificuldade FÁCIL para aprender com mais calma!'
              : '💡 Leia as curiosidades com atenção antes de tentar novamente!'}
        </p>

        <button id="gameover-retry-btn">▶  TENTAR NOVAMENTE</button>
      </div>
    `;

    document.body.appendChild(el);
    this._gameOverEl = el;

    requestAnimationFrame(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.6s';
      requestAnimationFrame(() => { el.style.opacity = '1'; });
    });

    document.getElementById('gameover-retry-btn').addEventListener('click', () => {
      if (onRetry) onRetry();
    });
  }
}