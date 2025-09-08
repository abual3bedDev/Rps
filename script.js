
const firebaseConfig = {
  apiKey: "AIzaSyC32bt4UxFhUMZbCENr5hf1nb9fwl7sbMk",
  authDomain: "rock-paper-scissors-267b4.firebaseapp.com",
  databaseURL: "https://rock-paper-scissors-267b4-default-rtdb.firebaseio.com",
  projectId: "rock-paper-scissors-267b4",
  storageBucket: "rock-paper-scissors-267b4.firebasestorage.app",
  messagingSenderId: "1062658164389",
  appId: "1:1062658164389:web:96bd6a00f48429194def4c",
  measurementId: "G-JQTTZNF7Y3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentRoom = "";
let player = "";
let playerName = "";


function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");

  // أيقونات SVG
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h1m0-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || ""}<span>${message}</span>`;

  container.appendChild(toast);

 
  setTimeout(() => {
    toast.remove();
  }, 3000);
}


function saveName() {
  const input = document.querySelector(".player-name-input").value.trim();
  if(input === "") {
    showToast("Enter Your Name!","error");
    return;
  }
  playerName = input;

  document.getElementById("enterName").style.display = "none";
  document.getElementById("lobby").style.display = "block"; 

  document.getElementById("playerDisplayName").innerText = playerName;
  document.getElementById("playerInfo").style.display = "flex";
}



function createRoom() {
  currentRoom = Math.floor(1000 + Math.random() * 9000).toString();
  player = "player1";

  db.ref("rooms/" + currentRoom).set({
    player1: "",
    player2: "",
    name1: playerName,
    name2: ""
  });

  openModal(currentRoom);
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
}



function joinRoom() {
  let RoomId = document.getElementById("roomId").value.trim();

  if (RoomId === "") {
    showToast("Enter Your Room Id!", "error");
    return;
  }

 
  db.ref("rooms/" + RoomId).once("value").then((snapshot) => {
    if (snapshot.exists()) {
      
      currentRoom = RoomId;
      player = "player2";

      db.ref("rooms/" + currentRoom + "/name2").set(playerName);

      showToast(`Room ${currentRoom}`, "success");

      document.getElementById("lobby").style.display = "none";
      document.getElementById("game").style.display = "block";
    } else {
      
      showToast("Room not found!", "error");
    }
  });
}




function play(choice) {
  db.ref("rooms/" + currentRoom + "/" + player).set(choice);
  checkResult();
}


function checkResult() {
  db.ref("rooms/" + currentRoom).on("value", (snapshot) => {
    let data = snapshot.val();
    if (!data) return;

    // أسماء اللاعبين
    document.getElementById("name1").innerText = data.name1 || "Player 1";
    document.getElementById("name2").innerText = data.name2 || "Player 2";


    if (!data.player1 || !data.player2) {
      document.getElementById("choice1").innerText = data.player1 ? " Selected" : " Waiting...";
      document.getElementById("choice2").innerText = data.player2 ? " Selected" : " Waiting...";
      document.getElementById("result").innerText = "";
      return;
    }


    document.getElementById("choice1").innerText = data.player1;
    document.getElementById("choice2").innerText = data.player2;

    if (data.player1 && data.player2) {
  let result = "";
  if (data.player1 === data.player2) result = "🔹 Draw!";
  else if (
    (data.player1 === "Rock" && data.player2 === "Scissors") ||
    (data.player1 === "Paper" && data.player2 === "Rock") ||
    (data.player1 === "Scissors" && data.player2 === "Paper")
  ) result = ` ${data.name1} Winer!`;
  else result = ` ${data.name2} Winer!`;

 
  startBattleAnimation(data.player1, data.player2, result);
}

  });
}


function startBattleAnimation(p1Choice, p2Choice, resultText) {
  const leftHand = document.getElementById("leftHand");
  const rightHand = document.getElementById("rightHand");
  const result = document.getElementById("result");

 
  leftHand.innerText = "✊";
  rightHand.innerText = "✊";
  leftHand.className = "hand left-hand animate-hand";
  rightHand.className = "hand right-hand animate-hand";
  result.innerText = "";

 
  document.getElementById("battleArea").style.display = "flex";


  setTimeout(() => {
    leftHand.classList.remove("animate-hand");
    rightHand.classList.remove("animate-hand");

    leftHand.innerText = getEmoji(p1Choice);
    rightHand.innerText = getEmoji(p2Choice);

    if (resultText.includes("فاز")) {
      if (resultText.includes("Player 1") || resultText.includes("name1")) {
        leftHand.classList.add("winner");
        rightHand.classList.add("loser");
      } else {
        rightHand.classList.add("winner");
        leftHand.classList.add("loser");
      }
    } else if (resultText.includes("تعادل")) {
      leftHand.classList.add("draw");
      rightHand.classList.add("draw");
    }

    result.innerText = resultText;
  }, 5000); // 5 ثواني
}


function getEmoji(choice) {
  switch (choice) {
    case "Rock": return "✊";
    case "Paper": return "✋";
    case "Scissors": return "✌️";
    default: return "❔";
  }
}



function openModal(roomId) {
  document.getElementById("roomModal").style.display = "block";
  document.getElementById("roomCodeText").innerText = roomId;


  document.getElementById("qrcode").innerHTML = "";

  
  new QRCode(document.getElementById("qrcode"), {
    text: roomId,
    width: 128,
    height: 128,
    colorDark : "#a7a7a7ff",
    colorLight : "#000000",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function closeModal() {
  document.getElementById("roomModal").style.display = "none";
}

function copyRoomCode() {
  const code = document.getElementById("roomCodeText").innerText;
  navigator.clipboard.writeText(code);
  showToast("Room code copied!", "success");
}


function backToLobby() {
  document.getElementById("game").style.display = "none";
  document.getElementById("lobby").style.display = "block";
  currentRoom = "";
  player = "";
  document.getElementById("result").innerText = "";
}