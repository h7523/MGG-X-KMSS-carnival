let currentPlayer = null;
let currentState = null;
let timerInterval = null;

const joinScreen = document.getElementById("joinScreen");
const waitingScreen = document.getElementById("waitingScreen");
const battleScreen = document.getElementById("battleScreen");
const zoomScreen = document.getElementById("zoomScreen");

const nicknameInput = document.getElementById("nickname");
const joinButton = document.getElementById("joinButton");
const joinError = document.getElementById("joinError");


// ==========================================
// SCREEN CONTROL
// ==========================================

function showScreen(screen) {
  [
    joinScreen,
    waitingScreen,
    battleScreen,
    zoomScreen
  ].forEach(item => item.classList.add("hidden"));

  screen.classList.remove("hidden");
}


// ==========================================
// JOIN GAME
// ==========================================

joinButton.addEventListener("click", joinGame);

nicknameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    joinGame();
  }
});


async function joinGame() {

  const nickname = nicknameInput.value.trim();

  joinError.textContent = "";

  if (!nickname) {
    joinError.textContent = "Enter your name first.";
    return;
  }

  if (nickname.length > 18) {
    joinError.textContent = "Keep your name under 18 characters.";
    return;
  }

  joinButton.disabled = true;
  joinButton.textContent = "JOINING...";

  const { data, error } = await supabaseClient
    .from("players")
    .insert({
      nickname: nickname,
      score: 0,
      alive: true,
      connected: true
    })
    .select()
    .single();

  if (error) {

    console.error("Join error:", error);

    joinError.textContent =
      "Couldn't join the game. Please try again.";

    joinButton.disabled = false;
    joinButton.textContent = "JOIN GAME";

    return;
  }

  currentPlayer = data;

  localStorage.setItem(
    "mgg_player_id",
    currentPlayer.id
  );

  document.getElementById("playerName").textContent =
    currentPlayer.nickname.toUpperCase();

  showScreen(waitingScreen);

  await loadGameState();

  subscribeToGame();
  subscribeToPlayer();
}


// ==========================================
// RESTORE PLAYER AFTER REFRESH
// ==========================================

async function restorePlayer() {

  const savedId =
    localStorage.getItem("mgg_player_id");

  if (!savedId) {
    showScreen(joinScreen);
    return;
  }

  const { data, error } = await supabaseClient
    .from("players")
    .select("*")
    .eq("id", savedId)
    .maybeSingle();

  if (error || !data) {

    localStorage.removeItem("mgg_player_id");

    showScreen(joinScreen);

    return;
  }

  currentPlayer = data;

  document.getElementById("playerName").textContent =
    currentPlayer.nickname.toUpperCase();

  showScreen(waitingScreen);

  await loadGameState();

  subscribeToGame();
  subscribeToPlayer();
}


// ==========================================
// LOAD GAME STATE
// ==========================================

async function loadGameState() {

  const { data, error } = await supabaseClient
    .from("game_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Game state error:", error);
    return;
  }

  currentState = data;

  await handleGameState(data);
}


// ==========================================
// LIVE GAME STATE
// ==========================================

function subscribeToGame() {

  supabaseClient
    .channel("mgg-game-state")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_state",
        filter: "id=eq.1"
      },
      async payload => {

        currentState = payload.new;

        await handleGameState(payload.new);
      }
    )
    .subscribe();
}


// ==========================================
// LIVE PLAYER UPDATES
// ==========================================

function subscribeToPlayer() {

  if (!currentPlayer) return;

  supabaseClient
    .channel("mgg-player-" + currentPlayer.id)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "players",
        filter: `id=eq.${currentPlayer.id}`
      },
      payload => {

        currentPlayer = payload.new;

        updatePlayerUI();
      }
    )
    .subscribe();
}


// ==========================================
// HANDLE CURRENT GAME
// ==========================================

async function handleGameState(state) {

  if (!currentPlayer) return;

  if (
    state.game_mode === "lobby" ||
    state.status === "waiting"
  ) {

    showScreen(waitingScreen);
    return;
  }


  // BATTLE ROYALE

  if (state.game_mode === "battle") {

    showScreen(battleScreen);

    document.getElementById("battleRound").textContent =
      state.round_number || 1;

    await updateAliveCount();

    if (state.status === "question") {

      if (!currentPlayer.alive) {

        hideBattlePanels();

        document
          .getElementById("eliminatedScreen")
          .classList.remove("hidden");

        return;
      }

      await loadBattleQuestion(
        state.current_question
      );

      return;
    }


    if (state.status === "result") {

      updatePlayerUI();

      return;
    }
  }


  // ZOOMED IN

  if (state.game_mode === "zoom") {

    showScreen(zoomScreen);

    document.getElementById("zoomRound").textContent =
      state.round_number || 1;

    document.getElementById("playerScore").textContent =
      currentPlayer.score || 0;

    updateZoomPoints(state.zoom_level);

    resetZoomInput();

    return;
  }
}


// ==========================================
// UPDATE PLAYER UI
// ==========================================

function updatePlayerUI() {

  if (!currentPlayer) return;

  document.getElementById("playerScore").textContent =
    currentPlayer.score || 0;

  if (
    currentState &&
    currentState.game_mode === "battle" &&
    currentState.status === "result"
  ) {

    showScreen(battleScreen);

    hideBattlePanels();

    if (currentPlayer.alive) {

      document
        .getElementById("survivedScreen")
        .classList.remove("hidden");

    } else {

      document
        .getElementById("eliminatedScreen")
        .classList.remove("hidden");
    }
  }
}


// ==========================================
// BATTLE ROYALE QUESTION
// ==========================================

async function loadBattleQuestion(questionId) {

  hideBattlePanels();

  document
    .getElementById("battleContent")
    .classList.remove("hidden");

  const { data, error } = await supabaseClient
    .from("battle_questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error || !data) {

    console.error("Question error:", error);

    document.getElementById("questionText").textContent =
      "Waiting for the next question...";

    return;
  }

  document.getElementById("questionText").textContent =
    data.question;

  const answers = [
    ["A", data.option_a],
    ["B", data.option_b],
    ["C", data.option_c],
    ["D", data.option_d]
  ];

  const grid =
    document.getElementById("answerGrid");

  grid.innerHTML = "";

  answers.forEach(([letter, text]) => {

    const button =
      document.createElement("button");

    button.className = "answer-button";

    const letterCircle =
      document.createElement("span");

    letterCircle.textContent = letter;

    button.appendChild(letterCircle);

    button.appendChild(
      document.createTextNode(" " + text)
    );

    button.addEventListener(
      "click",
      () => submitBattleAnswer(
        questionId,
        letter
      )
    );

    grid.appendChild(button);
  });

  startLocalTimer(10);
}


// ==========================================
// SUBMIT BATTLE ANSWER
// ==========================================

async function submitBattleAnswer(
  questionId,
  answer
) {

  if (!currentPlayer) return;

  clearInterval(timerInterval);

  const buttons =
    document.querySelectorAll(".answer-button");

  buttons.forEach(button => {
    button.disabled = true;
  });

  const { error } = await supabaseClient
    .from("answers")
    .insert({
      player_id: currentPlayer.id,
      game_mode: "battle",
      question_id: questionId,
      answer: answer
    });

  if (error && error.code !== "23505") {

    console.error("Answer error:", error);

    alert("Your answer couldn't be submitted.");

    buttons.forEach(button => {
      button.disabled = false;
    });

    return;
  }

  hideBattlePanels();

  document
    .getElementById("answerLocked")
    .classList.remove("hidden");
}


// ==========================================
// ALIVE PLAYER COUNT
// ==========================================

async function updateAliveCount() {

  const { count, error } = await supabaseClient
    .from("players")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("alive", true);

  if (!error) {

    document.getElementById("aliveCount").textContent =
      count ?? 0;
  }
}


// ==========================================
// BATTLE PANELS
// ==========================================

function hideBattlePanels() {

  [
    "battleContent",
    "answerLocked",
    "survivedScreen",
    "eliminatedScreen"
  ].forEach(id => {

    document
      .getElementById(id)
      .classList.add("hidden");
  });
}


// ==========================================
// QUESTION TIMER
// ==========================================

function startLocalTimer(seconds) {

  clearInterval(timerInterval);

  const display =
    document.getElementById("timerNumber");

  let remaining = seconds;

  display.textContent = remaining;

  timerInterval = setInterval(() => {

    remaining -= 1;

    display.textContent =
      Math.max(remaining, 0);

    if (remaining <= 0) {

      clearInterval(timerInterval);

      document
        .querySelectorAll(".answer-button")
        .forEach(button => {
          button.disabled = true;
        });
    }

  }, 1000);
}


// ==========================================
// ZOOMED IN
// ==========================================

function updateZoomPoints(level) {

  const points = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };

  document.getElementById("zoomPoints").textContent =
    `${points[level] || 250} POINTS`;
}


function resetZoomInput() {

  const input =
    document.getElementById("zoomAnswer");

  const button =
    document.getElementById("zoomSubmit");

  input.disabled = false;
  button.disabled = false;

  input.value = "";

  button.textContent = "LOCK ANSWER";
}


document
  .getElementById("zoomSubmit")
  .addEventListener(
    "click",
    submitZoomAnswer
  );


document
  .getElementById("zoomAnswer")
  .addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        submitZoomAnswer();
      }
    }
  );


async function submitZoomAnswer() {

  if (!currentPlayer || !currentState) return;

  const input =
    document.getElementById("zoomAnswer");

  const answer =
    input.value.trim();

  if (!answer) return;

  const points = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };

  const button =
    document.getElementById("zoomSubmit");

  button.disabled = true;
  input.disabled = true;

  const { error } = await supabaseClient
    .from("answers")
    .insert({
      player_id: currentPlayer.id,
      game_mode: "zoom",
      question_id: currentState.current_question,
      answer: answer,
      points:
        points[currentState.zoom_level] || 250
    });

  if (error && error.code !== "23505") {

    console.error("Zoom answer error:", error);

    button.disabled = false;
    input.disabled = false;

    alert("Your answer couldn't be submitted.");

    return;
  }

  button.textContent = "ANSWER LOCKED ✓";
}


// ==========================================
// START
// ==========================================

restorePlayer();
