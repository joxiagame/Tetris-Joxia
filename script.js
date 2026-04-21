// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
    // IMPORTANT : L'URL doit être exactement celle-ci pour pointer sur l'Europe
    databaseURL: "https://joxiahub-2928b-default-rtdb.europe-west1.firebasedatabase.app/"
};

// Initialisation avec vérification
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // Utilise l'app déjà initialisée
}

const database = firebase.database();

// --- VARIABLES DE JEU ---
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextContext = nextCanvas.getContext('2d');
context.scale(20, 20);
nextContext.scale(20, 20);

// On récupère le joueur dans l'URL (ex: ?player=Witnesse)
let currentPlayer = new URLSearchParams(window.location.search).get('player') || "Invité";
document.getElementById('player-display').innerText = currentPlayer;

const themes = {
    classic: ['none','#4ecca3','#ff922b','#339af0','#fcc419','#ff6b6b','#51cf66','#cc5de8'],
    neon: ['none','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff'],
    forest: ['none','#2ecc71','#27ae60','#d35400','#f1c40f','#c0392b','#7f8c8d','#8e44ad']
};
let currentTheme = 'classic';
let isGameOver = false;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

const arena = Array.from({length: 20}, () => Array(12).fill(0));
const player = { pos: {x: 0, y: 0}, matrix: null, next: null, score: 0 };

// --- LOGIQUE CLASSEMENT (CORRIGÉE) ---

function saveScore(playerName, score) {
    // On ne sauvegarde pas si c'est un invité ou si le score est nul
    if (!playerName || playerName === "Invité" || score <= 0) return;

    const scoresRef = database.ref('games/TETRIS/scores');

    // On cherche si le nom existe déjà
    scoresRef.orderByChild('name').equalTo(playerName).once('value').then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const key = Object.keys(data)[0];
            const oldScore = data[key].score;

            // Mise à jour uniquement si le nouveau score est meilleur
            if (score > oldScore) {
                database.ref(`games/TETRIS/scores/${key}`).update({
                    score: Number(score)
                }).then(() => console.log("Record mis à jour !"));
            }
        } else {
            // Création si nouveau joueur
            scoresRef.push({
                name: playerName,
                score: Number(score)
            }).then(() => console.log("Premier score enregistré !"));
        }
    }).catch(err => {
        console.error("Erreur de permission ou réseau :", err);
    });
}

function displayLeaderboard() {
    database.ref('games/TETRIS/scores').orderByChild('score').limitToLast(10).on('value', snap => {
        let scores = [];
        snap.forEach(s => { scores.push(s.val()); });
        scores.sort((a,b) => b.score - a.score);
        document.getElementById('leaderboard').innerHTML = scores.map((s, i) => `
            <div class="score-row"><span>#${i+1} ${s.name}</span><span>${s.score} pts</span></div>`).join('');
    });
}

// --- MOTEUR DE JEU ---

function createPiece(t) {
    const p = {
        'I': [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
        'L': [[0,2,0],[0,2,0],[0,2,2]], 'J': [[0,3,0],[0,3,0],[3,3,0]],
        'O': [[4,4],[4,4]], 'Z': [[5,5,0],[0,5,5],[0,0,0]],
        'S': [[0,6,6],[6,6,0],[0,0,0]], 'T': [[0,7,0],[7,7,7],[0,0,0]]
    };
    return p[t];
}

function drawMatrix(matrix, offset, ctx) {
    const colors = themes[currentTheme];
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                if (currentTheme === 'neon') { ctx.shadowColor = colors[value]; ctx.shadowBlur = 12; }
                else { ctx.shadowBlur = 0; }
                ctx.fillStyle = colors[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.lineWidth = 0.05;
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x: 0, y: 0}, context);
    drawMatrix(player.matrix, player.pos, context);
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, 80, 80);
    if(player.next) drawMatrix(player.next, {x: 1, y: 1}, nextContext);
}

function collide(a, p) {
    const [m, o] = [p.matrix, p.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (a[y + o.y] && a[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function merge(a, p) {
    p.matrix.forEach((row, y) => {
        row.forEach((v, x) => { if (v !== 0) a[y + p.pos.y][x + p.pos.x] = v; });
    });
}

function arenaSweep() {
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) { if (arena[y][x] === 0) continue outer; }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
    }
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    player.matrix = player.next || createPiece(pieces[Math.random() * 7 | 0]);
    player.next = createPiece(pieces[Math.random() * 7 | 0]);
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
        isGameOver = true;
        document.getElementById('final-score').innerText = player.score;
        document.getElementById('game-over-screen').classList.remove('hidden');
        saveScore(currentPlayer, player.score);
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        player.score++;
        document.getElementById('score').innerText = player.score;
        playerReset();
        arenaSweep();
    }
    dropCounter = 0;
}

function rotate(matrix) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    matrix.forEach(row => row.reverse());
}

function update(time = 0) {
    if (isGameOver) return;
    const dt = time - lastTime; lastTime = time;
    dropCounter += dt;
    if (dropCounter > dropInterval) playerDrop();
    draw();
    requestAnimationFrame(update);
}

// --- CONTRÔLES ---
document.onkeydown = e => {
    if (isGameOver) return;
    if (e.keyCode === 37) { player.pos.x--; if (collide(arena, player)) player.pos.x++; }
    else if (e.keyCode === 39) { player.pos.x++; if (collide(arena, player)) player.pos.x--; }
    else if (e.keyCode === 40) playerDrop();
    else if (e.keyCode === 38) {
        rotate(player.matrix);
        while (collide(arena, player)) { player.pos.x += (player.pos.x < 6 ? 1 : -1); }
    }
};

// --- INTERFACE ---
window.setTheme = (n) => { document.body.className = 'theme-'+n; currentTheme = n; };
window.toggleLeaderboard = () => { document.getElementById('leaderboard-overlay').classList.toggle('hidden'); };
window.resetGame = () => { location.reload(); };
document.getElementById('backToHub').onclick = () => window.location.href = "https://joxiagame.github.io/Joxia-Games/";

// --- LANCEMENT ---
playerReset();
update();
displayLeaderboard();