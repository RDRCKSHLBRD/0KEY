//app.js 

document.addEventListener('DOMContentLoaded', () => {
  // Game elements
  const gameContainer = document.getElementById('game-container');
  const gameLetters = document.getElementById('game-letters');
  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over');
  const scoreDisplay = document.getElementById('score');
  const finalScoreDisplay = document.getElementById('final-score');
  const startButton = document.getElementById('start-button');
  const restartButton = document.getElementById('restart-button');
  const difficultySelect = document.getElementById('difficulty');
  const themeSelect = document.getElementById('theme');

  // Game variables
  let score = 0;
  let gameActive = false;
  let letters = [];
  let letterSpeed = 1;
  let letterInterval = 2000;
  let animationFrameId;
  let lastFrameTime = 0;
  let missedLetters = 0;
  const maxMissedLetters = 10;

  // Letters and game area dimensions
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterSize = 50;
  let gameWidth = gameLetters.clientWidth;
  let gameHeight = gameLetters.clientHeight;

  // Theme handling
  themeSelect.addEventListener('change', () => {
      const theme = themeSelect.value;
      gameContainer.className = `theme-${theme}`;
  });

  // Difficulty settings
  const difficulties = {
      easy: { speed: 0.5, interval: 2500 },
      medium: { speed: 1, interval: 2000 },
      hard: { speed: 1.5, interval: 1500 }
  };

  // Initialize game
  function initGame() {
      score = 0;
      missedLetters = 0;
      letters = [];
      scoreDisplay.textContent = '0';
      gameLetters.innerHTML = '';
      
      // Set difficulty
      const difficulty = difficulties[difficultySelect.value];
      letterSpeed = difficulty.speed;
      letterInterval = difficulty.interval;
      
      // Set theme
      const theme = themeSelect.value;
      gameContainer.className = `theme-${theme}`;
      
      // Update game dimensions
      gameWidth = gameLetters.clientWidth;
      gameHeight = gameLetters.clientHeight;
      
      startScreen.classList.add('hidden');
      gameOverScreen.classList.add('hidden');
      gameActive = true;
      
      // Start generating letters
      generateLetters();
      
      // Start game loop
      lastFrameTime = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
  }

  // Generate letters at intervals
  function generateLetters() {
      if (!gameActive) return;
      
      const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
      const x = Math.random() * (gameWidth - letterSize);
      
      // Create letter element
      const letterElement = document.createElement('div');
      letterElement.className = 'letter';
      letterElement.textContent = randomLetter;
      letterElement.style.left = `${x}px`;
      letterElement.style.top = '0px';
      
      // Add to game and letters array
      gameLetters.appendChild(letterElement);
      letters.push({
          element: letterElement,
          char: randomLetter,
          x: x,
          y: 0,
          active: false
      });
      
      // Schedule next letter
      setTimeout(generateLetters, letterInterval);
  }

  // Game loop
  function gameLoop(timestamp) {
      if (!gameActive) return;
      
      const deltaTime = timestamp - lastFrameTime;
      lastFrameTime = timestamp;
      
      // Move letters downward
      letters.forEach((letter, index) => {
          letter.y += letterSpeed * deltaTime / 10;
          letter.element.style.top = `${letter.y}px`;
          
          // Check if letter has reached bottom
          if (letter.y > gameHeight - letterSize && !letter.active) {
              // Remove letter and count as missed
              gameLetters.removeChild(letter.element);
              letters.splice(index, 1);
              missedLetters++;
              
              // Check game over condition
              if (missedLetters >= maxMissedLetters) {
                  endGame();
                  return;
              }
          }
      });
      
      // Continue game loop
      animationFrameId = requestAnimationFrame(gameLoop);
  }

  // Handle keyboard input
  document.addEventListener('keydown', (e) => {
      if (!gameActive) return;
      
      const key = e.key.toUpperCase();
      
      // Check if key is a letter
      if (/^[A-Z]$/.test(key)) {
          // Find matching letters
          let matched = false;
          
          for (let i = 0; i < letters.length; i++) {
              if (letters[i].char === key && !letters[i].active) {
                  // Mark as active (being removed)
                  letters[i].active = true;
                  letters[i].element.classList.add('active');
                  
                  // Remove after animation
                  setTimeout(() => {
                      if (gameActive && letters[i] && letters[i].element.parentNode) {
                          gameLetters.removeChild(letters[i].element);
                          letters.splice(i, 1);
                      }
                  }, 200);
                  
                  // Update score
                  score++;
                  scoreDisplay.textContent = score.toString();
                  matched = true;
                  break;
              }
          }
          
          // Subtle visual feedback for incorrect keys
          if (!matched) {
              gameContainer.classList.add('shake');
              setTimeout(() => {
                  gameContainer.classList.remove('shake');
              }, 100);
          }
      }
  });

  // End game
  function endGame() {
      gameActive = false;
      cancelAnimationFrame(animationFrameId);
      finalScoreDisplay.textContent = score.toString();
      gameOverScreen.classList.remove('hidden');
  }

  // Event listeners
  startButton.addEventListener('click', initGame);
  restartButton.addEventListener('click', initGame);
  
  // Handle window resize
  window.addEventListener('resize', () => {
      if (gameActive) {
          gameWidth = gameLetters.clientWidth;
          gameHeight = gameLetters.clientHeight;
      }
  });
  
  // Add a subtle shake animation for feedback
  const style = document.createElement('style');
  style.textContent = `
      @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
          100% { transform: translateX(0); }
      }
      .shake {
          animation: shake 0.1s ease-in-out;
      }
  `;
  document.head.appendChild(style);
});