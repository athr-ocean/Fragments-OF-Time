import { Game } from './js/Game.js';

window.addEventListener('DOMContentLoaded', () => {

  const titleScreen      = document.getElementById('title-screen');
  const difficultyScreen = document.getElementById('difficulty-screen');
  const cutsceneScreen   = document.getElementById('cutscene-screen');
  const gameWrapper      = document.getElementById('game-wrapper');

  let game        = null;     
  let titleActive = true;     
  let selectedDifficulty = 'medium'; 

  const startFromTitle = () => {
    if (!titleActive) return; 
    titleActive = false;      

    titleScreen.style.cssText += 'transition:opacity .5s;opacity:0';

    setTimeout(() => {
      titleScreen.classList.add('hidden');
      showDifficultyScreen();
    }, 500);
  };

  window.addEventListener('keydown', e => {
    if (titleActive && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); 
      startFromTitle();
    }
  });

  titleScreen.addEventListener('click', startFromTitle);

  const DIFF_KEYS = ['easy', 'medium', 'hard'];

  let diffCursorIdx  = 1;

  let diffInputActive = false;

  const diffCards = () => document.querySelectorAll('.diff-card');

  const highlightDiff = key => diffCards().forEach(c =>
    c.classList.toggle('diff-card-selected', c.dataset.difficulty === key)
  );

  const showDifficultyScreen = () => {
    difficultyScreen.classList.remove('hidden'); 

    difficultyScreen.style.cssText += 'opacity:0;transition:opacity .4s';

    requestAnimationFrame(() =>
      requestAnimationFrame(() => difficultyScreen.style.opacity = '1')
    );

    diffInputActive = true; 

    highlightDiff(DIFF_KEYS[diffCursorIdx]);

    diffCards().forEach(card => card.addEventListener('click', () => {
      if (!diffInputActive) return; 
      selectedDifficulty = card.dataset.difficulty;               
      diffCursorIdx = DIFF_KEYS.indexOf(selectedDifficulty);      
      highlightDiff(selectedDifficulty);                          
      setTimeout(confirmDifficulty, 180);                         
    }));
  };

  window.addEventListener('keydown', e => {
    if (!diffInputActive) return; 

    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      e.preventDefault();
      diffCursorIdx = (diffCursorIdx - 1 + DIFF_KEYS.length) % DIFF_KEYS.length;
      highlightDiff(selectedDifficulty = DIFF_KEYS[diffCursorIdx]);
    }

    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
      e.preventDefault();
      diffCursorIdx = (diffCursorIdx + 1) % DIFF_KEYS.length;
      highlightDiff(selectedDifficulty = DIFF_KEYS[diffCursorIdx]);
    }

    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      confirmDifficulty();
    }
  });

  const confirmDifficulty = () => {
    if (!diffInputActive) return; 
    diffInputActive = false;      

    document.querySelector(`.diff-card[data-difficulty="${selectedDifficulty}"]`)
      ?.classList.add('diff-card-confirmed'); 

    setTimeout(() => {
      difficultyScreen.style.opacity = '0';
      setTimeout(() => {
        difficultyScreen.classList.add('hidden');
        startCutscene(); 
      }, 400);
    }, 350);
  };

  const startCutscene = () => {
    cutsceneScreen.classList.remove('hidden'); 

    game = new Game('gameCanvas', () => {
      cutsceneScreen.classList.add('hidden');    
      gameWrapper.classList.remove('hidden');    
    }, selectedDifficulty);

    game.start(); 
  };

  window.__chronobyte = () => game;

});