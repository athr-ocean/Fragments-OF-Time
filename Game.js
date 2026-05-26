import { Player }        from './Player.js';
import { Renderer }      from './Renderer.js';
import { GameUI }        from './GameUI.js';
import { ERAS, STORY, TILE, DIFFICULTY_CONFIG } from './data.js';

const S = {
  CUTSCENE:   'CUTSCENE',   INTRO_ERA:  'INTRO_ERA',
  EXPLORANDO: 'EXPLORANDO', LENDO_TEXTO:'LENDO_TEXTO',
  QUIZ:       'RESPONDENDO_QUIZ', FEEDBACK: 'MOSTRANDO_FEEDBACK',
  PORTAL:     'PORTAL_ANIM',    GAMEOVER: 'GAME_OVER',
};

export class Game {
  constructor(canvasId, onCutsceneDone, difficulty = 'medium') {
    this.canvas          = document.getElementById(canvasId);
    this.onCutsceneDone  = onCutsceneDone;
    this.renderer        = new Renderer(this.canvas);

    this.difficulty      = difficulty;
    const d              = DIFFICULTY_CONFIG[difficulty];
    this.maxLives        = this.lives  = d.lives;
    this.scoreBonus      = d.scoreBonus;
    
    this._quizTimeMax    = this._quizTimeRemaining = d.quizTime;

    this.state           = S.CUTSCENE;
    
    this.eraIndex        = 0;
    this.completedMachines = new Set();
    this.score           = this.totalCorrect = 0;
    
    this.dialogReady     = false;
    this._lastAnswerCorrect  = false;
    this._currentQuizMachine = null;

    this.cutsceneLines   = STORY.intro;
    this.cutsceneIndex   = 0;
    this.cutsceneTyping  = false;
    
    this.introLines      = [];
    this.introIndex      = 0;

    const e0             = ERAS[0];
    this.player          = new Player(e0.playerStart.col, e0.playerStart.row);
    
    this.ui              = new GameUI(
      (i, m) => this._onQuizAnswer(i, m),
      ()     => this._onFeedbackContinue()
    );

    this.keys = {
      ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,
      KeyW:false,KeyS:false,KeyA:false,KeyD:false,
      KeyE:false,Space:false,Enter:false,
    };
    
    this._interactConsumed = false;
    this._bindInput();

    this._lastTime = this._rafId = this._twTimer = null;
    this._portalTimer = 0;

    this._csPortrait = document.getElementById('cutscene-portrait');
    this._csName     = document.getElementById('cutscene-portrait-name');
    this._csText     = document.getElementById('cutscene-text');
    this._csArrow    = document.getElementById('cutscene-arrow');

    this._playCutsceneLine(0);
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      if (e.code in this.keys) { e.preventDefault(); this.keys[e.code] = true; }
    });
    window.addEventListener('keyup', e => {
      if (e.code in this.keys) this.keys[e.code] = false;
      if (['KeyE','Space','Enter'].includes(e.code)) this._interactConsumed = false;
    });
  }

  _interact()        { return (this.keys.KeyE || this.keys.Space || this.keys.Enter) && !this._interactConsumed; }
  _consumeInteract() { this._interactConsumed = true; }

  start() { this._rafId = requestAnimationFrame(ts => this._loop(ts)); }
  stop()  { if (this._rafId) cancelAnimationFrame(this._rafId); }

  _loop(ts) {
    const dt = this._lastTime ? Math.min((ts - this._lastTime) / 1000, 0.1) : 0;
    this._lastTime = ts;
    
    this.renderer.tick();
    this._update(dt);
    this._render();
    
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    const era = ERAS[this.eraIndex];
    
    switch (this.state) {
      case S.CUTSCENE:
        if (this._interact()) {
          this._consumeInteract();
          if (this.cutsceneTyping) {
            this._cutsceneSkip();
          } else if (++this.cutsceneIndex >= this.cutsceneLines.length) {
            this._endCutscene();
          } else {
            this._playCutsceneLine(this.cutsceneIndex);
          }
        }
        break;

      case S.INTRO_ERA:
        if (this._interact()) {
          this._consumeInteract();
          if (this.ui.isTyping()) {
            this.ui.skipDialog(); this.dialogReady = true;
          } else if (this.dialogReady) {
            if (++this.introIndex >= this.introLines.length) {
              this.ui.hideAll(); this.state = S.EXPLORANDO;
            } else {
              this._playIntroLine(this.introIndex);
            }
          }
        }
        break;

      case S.EXPLORANDO:
        this._handleMovement(era);
        this._handleInteract(era);
        this.player.update(dt, era);
        break;

      case S.LENDO_TEXTO:
        if (this._interact()) {
          this._consumeInteract();
          if (this.ui.isTyping()) {
            this.ui.skipDialog(); this.dialogReady = true;
          } else if (this.dialogReady) {
            this._advanceToQuiz();
          }
        }
        this.player.update(dt, era);
        break;

      case S.QUIZ:
        this._quizTimeRemaining -= dt;
        this.ui.updateQuizTimer(this._quizTimeRemaining, this._quizTimeMax);
        
        if (this._quizTimeRemaining <= 0 && this._currentQuizMachine) {
          this._quizTimeRemaining = 0;
          this.ui.disableQuizButtons();
          this._onQuizAnswer(-1, this._currentQuizMachine);
        }
        this.player.update(dt, era);
        break;

      case S.FEEDBACK:
        this.player.update(dt, era);
        break;

      case S.PORTAL:
        this._portalTimer += dt;
        if (this._portalTimer >= 0.8) { this._portalTimer = 0; this._goToNextEra(); }
        break;
    }
  }

  _handleMovement(era) {
    if (this.player.isMoving) return;
    const { keys: k } = this;
    if      (k.ArrowUp    || k.KeyW) this.player.tryMove( 0,-1, era);
    else if (k.ArrowDown  || k.KeyS) this.player.tryMove( 0, 1, era);
    else if (k.ArrowLeft  || k.KeyA) this.player.tryMove(-1, 0, era);
    else if (k.ArrowRight || k.KeyD) this.player.tryMove( 1, 0, era);
  }

  _handleInteract(era) {
    if (!this._interact()) return;
    this._consumeInteract();
    
    const f     = this.player.getFacingTile();
    const fTile = era.map[f.row]?.[f.col];
    
    if (fTile === TILE.MACHINE) {
      const m = era.machine; if (!m) return;
      this.completedMachines.has(m.id)
        ? this._showAlreadyDone(m, era)
        : this._startMachineDialog(m, era);
      return;
    }
    
    if (fTile === TILE.PORTAL || fTile === TILE.WARP) { this._triggerPortal(era); return; }
    
    const cTile = era.map[this.player.row]?.[this.player.col];
    if (cTile === TILE.PORTAL || cTile === TILE.WARP) this._triggerPortal(era);
  }

  _playCutsceneLine(idx) {
    const line = this.cutsceneLines[idx];
    this._csName.textContent    = line.speaker;
    this._setCutscenePortrait(line.portrait);
    this._csArrow.style.display = 'none';
    this.cutsceneTyping         = true;
    
    this._typewriterTo(this._csText, line.text, 28, () => {
      this.cutsceneTyping = false;
      this._csArrow.style.display = 'block';
    });
  }
  
  _cutsceneSkip() {
    this._stopTypewriter();
    this._csText.textContent    = this.cutsceneLines[this.cutsceneIndex].text;
    this.cutsceneTyping         = false;
    this._csArrow.style.display = 'block';
  }
  
  _endCutscene() { 
    if (this.onCutsceneDone) this.onCutsceneDone(); 
    this._startEra(0);
  }
  
  _setCutscenePortrait(type) {
    const el = this._csPortrait; el.innerHTML = '';
    const c  = document.createElement('canvas');
    c.width = c.height = 64;
    c.style.cssText = 'image-rendering:pixelated;width:64px;height:64px';
    el.appendChild(c);
    this.renderer.drawPortrait(c, type, ERAS[this.eraIndex]);
  }

  _startEra(index) {
    this.eraIndex = index;
    const era = ERAS[index];
    
    this.player.resetTo(era.playerStart.col, era.playerStart.row);
    
    this.ui.updateEraBanner(era);
    this.ui.updateHUD(this.score, this.completedMachines.size, 5);
    this.ui.updateLives(this.lives, this.maxLives);
    this.ui.updateDifficultyBadge(DIFFICULTY_CONFIG[this.difficulty]);
    
    if (era.introMsg?.length) {
      this.introLines = era.introMsg; this.introIndex = 0;
      this.state = S.INTRO_ERA; this._playIntroLine(0);
    } else {
      this.state = S.EXPLORANDO;
    }
  }

  _playIntroLine(idx) {
    const line = this.introLines[idx];
    this.dialogReady = false;
    this.ui.showDialogLine(line.speaker, line.text, line.portrait,
      this.renderer, ERAS[this.eraIndex], () => { this.dialogReady = true; });
  }

  _triggerPortal(era) {
    if (era.machine && !this.completedMachines.has(era.machine.id)) {
      this.introLines = [{ speaker:'AVÔ AUGUSTO', portrait:'grandpa',
        text:'O portal está bloqueado! Você precisa responder corretamente ao quiz do computador histórico antes de viajar no tempo, Lucas!' }];
      this.introIndex = 0; this.dialogReady = false;
      this.state = S.INTRO_ERA; this._playIntroLine(0);
      return;
    }
    
    this.state = S.PORTAL; this._portalTimer = 0;
    this.ui.triggerPortalFlash();
  }

  _goToNextEra() {
    const next = this.eraIndex + 1;
    next >= ERAS.length ? this._showEnding() : this._startEra(next);
  }

  _getMachineForDifficulty(machine) {
    const byDiff = machine.questionsByDifficulty?.[this.difficulty];
    return byDiff ? { ...machine, ...byDiff } : machine;
  }

  _startMachineDialog(machine, era) {
    this.state = S.LENDO_TEXTO; this.dialogReady = false;
    this.ui.showDialogLine(machine.name, machine.description, 'machine',
      this.renderer, era, () => { this.dialogReady = true; });
  }

  _showAlreadyDone(machine, era) {
    this.state = S.LENDO_TEXTO; this.dialogReady = false;
    this.ui.showDialogLine(machine.name,
      `Você já domina o conhecimento do ${machine.name}! Vá até o portal ✦ e pressione E para viajar.`,
      'machine', this.renderer, era, () => { this.dialogReady = true; });
  }

  _advanceToQuiz() {
    const machine = ERAS[this.eraIndex].machine; if (!machine) return;
    this._currentQuizMachine    = this._getMachineForDifficulty(machine);
    this._quizTimeRemaining     = this._quizTimeMax;
    this.state = S.QUIZ;
    this.ui.showQuiz(this._currentQuizMachine, ERAS[this.eraIndex]);
  }

  _onQuizAnswer(answerIdx, machine) {
    this._quizTimeRemaining = 0;
    
    const timedOut = answerIdx === -1;
    const correct  = !timedOut && answerIdx === machine.correctIndex;
    
    this._lastAnswerCorrect = correct;
    this.state = S.FEEDBACK;
    
    if (correct) {
      this.score += this.scoreBonus; this.totalCorrect++;
      this.completedMachines.add(machine.id);
      this.ui.updateHUD(this.score, this.completedMachines.size, 5);
    } else {
      this.lives = Math.max(0, this.lives - 1);
      this.ui.updateLives(this.lives, this.maxLives);
    }
    
    this.ui.showFeedback(correct, machine, Math.round((this.completedMachines.size / 5) * 100), timedOut);
  }

  _onFeedbackContinue() {
    this._interactConsumed = true;
    
    if (!this._lastAnswerCorrect && this.lives <= 0) { this._showGameOver(); return; }
    
    this.introLines = [this._lastAnswerCorrect
      ? { speaker:'AVÔ AUGUSTO', portrait:'grandpa',
          text:'Brilhante, Lucas! Você absorveu o conhecimento desta era! O portal temporal foi DESBLOQUEADO. Vá até o símbolo ✦ e pressione E para viajar!' }
      : { speaker:'AVÔ AUGUSTO', portrait:'grandpa',
          text:`Não desanime, Lucas! Todo cientista aprende com os erros. ${
            this.lives === 1 ? 'Você ainda tem 1 vida restante!' : `Você ainda tem ${this.lives} vidas restantes!`
          } Leia a curiosidade com atenção e tente o quiz novamente. O portal só abre com conhecimento verdadeiro!` }
    ];
    
    this.introIndex = 0; this.dialogReady = false;
    this.state = S.INTRO_ERA; this._playIntroLine(0);
  }

  _showGameOver() {
    this.state = S.GAMEOVER; this.ui.hideAll();
    this.ui.showGameOver(this.score, this.completedMachines.size, this.totalCorrect,
      DIFFICULTY_CONFIG[this.difficulty], () => location.reload());
  }

  _showEnding() {
    this.stop(); this.ui.hideAll();
    document.getElementById('game-wrapper').classList.add('hidden');
    
    const ending = document.getElementById('ending-screen');
    ending.classList.remove('hidden');
    
    document.getElementById('end-score').textContent    = this.score;
    document.getElementById('end-machines').textContent = `${this.completedMachines.size}/5`;
    document.getElementById('end-hits').textContent     = this.totalCorrect;
    
    const endDiff = document.getElementById('end-difficulty');
    const diffCfg = DIFFICULTY_CONFIG[this.difficulty];
    if (endDiff) { endDiff.textContent = `${diffCfg.icon} ${diffCfg.label}`; endDiff.style.color = diffCfg.color; }
    
    const abraco = document.getElementById('abraco-canvas');
    if (abraco) this.renderer.drawEndingScene(abraco);
    
    document.getElementById('ending-replay-btn').addEventListener('click', () => location.reload());
  }

  _render() {
    const era = ERAS[this.eraIndex];
    this.renderer.clear();
    
    if (this.state === S.CUTSCENE) return; 
    
    this.renderer.drawMap(era, this.completedMachines);
    this.renderer.drawPlayer(this.player, era);
    
    if (this.state !== S.EXPLORANDO && this.state !== S.PORTAL)
      this.renderer.drawOverlay(0.3);
      
    if (this.state === S.PORTAL)
      this.renderer.drawOverlay(Math.min(this._portalTimer / 0.8, 1));
  }

  _typewriterTo(el, text, speed, onDone) {
    this._stopTypewriter();
    el.textContent = '';
    let i = 0;
    const chars = text.split('');
    
    const tick = () => {
      if (i >= chars.length) { if (onDone) onDone(); return; }
      el.textContent += chars[i++];
      this._twTimer = setTimeout(tick, speed);
    };
    this._twTimer = setTimeout(tick, speed);
  }

  _stopTypewriter() { 
    if (this._twTimer) { clearTimeout(this._twTimer); this._twTimer = null; } 
  }
}